import { useState, useEffect, useRef } from "react";

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');

  @keyframes ripple {
    0%   { transform: scale(1);    opacity: .55; }
    100% { transform: scale(1.9);  opacity: 0;   }
  }
  @keyframes floatUp {
    0%   { opacity: 1; transform: translateY(0)     scale(1);   }
    100% { opacity: 0; transform: translateY(-88px) scale(2.3); }
  }
  @keyframes slideInR {
    from { opacity: 0; transform: translateX(14px); }
    to   { opacity: 1; transform: translateX(0);    }
  }
  @keyframes msgIn {
    from { opacity: 0; transform: translateY(7px) scale(.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1);   }
  }
  @keyframes dotPulse {
    0%,100% { box-shadow: 0 0 4px #22c55e; }
    50%      { box-shadow: 0 0 10px #22c55e, 0 0 18px #22c55e44; }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #22224e; border-radius: 99px; }
  input::placeholder { color: #22225a; }
  input:focus { outline: none; }
  .hov { transition: all .15s; cursor: pointer; }
  .hov:hover  { opacity: .88; }
  .hov:active { transform: scale(.93) !important; }
  .rr { border-radius: 8px; transition: background .14s; cursor: pointer; }
  .rr:hover { background: rgba(139,92,246,.14) !important; }
  .rx { border-radius: 6px; padding: 3px 5px; transition: all .12s; cursor: pointer; }
  .rx:hover { transform: scale(1.45); background: rgba(139,92,246,.28) !important; }
  .cb { border-radius: 10px; transition: all .15s; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 13px; min-width: 54px; }
  .cb:hover { transform: translateY(-2px); filter: brightness(1.12); }
  .cb:active { transform: scale(.92) !important; }
`;

const USERS = [
  { id:1, name:"Rain",   init:"R", hue:"#f59e0b", isYou:true  },
  { id:2, name:"Zephyr", init:"Z", hue:"#8b5cf6"               },
  { id:3, name:"Pixel",  init:"P", hue:"#3b82f6"               },
  { id:4, name:"Nova",   init:"N", hue:"#ec4899"               },
];
const ROOMS = [
  { id:"lobby",   label:"Lobby",       icon:"🏠", n:4 },
  { id:"dungeon", label:"Dungeon Run",  icon:"⚔️", n:0 },
  { id:"chill",   label:"Chill Zone",  icon:"🎮", n:0 },
];
const EMOJIS = ["🔥","😂","👍","❤️","🎉","💀"];
const INIT_MSGS = [
  { id:1, uid:2, text:"ready when you are 👍",   t:"9:41" },
  { id:2, uid:3, text:"one sec grabbing water",   t:"9:42" },
  { id:3, uid:4, text:"let's GOOOO 🔥🔥",        t:"9:42" },
];
const FRIENDS = [
  { name:"Blaze", init:"B", hue:"#f97316", status:"online",  where:"In Lobby" },
  { name:"Wren",  init:"W", hue:"#10b981", status:"idle",    where:"Idle"     },
  { name:"Kira",  init:"K", hue:"#ec4899", status:"offline", where:"Offline"  },
];
const STCOLOR = { online:"#22c55e", idle:"#f59e0b", offline:"#404070" };

function useTimer() {
  const [s, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set(x => x+1), 1000); return () => clearInterval(id); }, []);
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

export default function App() {
  const [muted,  setMuted]  = useState(false);
  const [cam,    setCam]    = useState(false);
  const [share,  setShare]  = useState(false);
  const [ptt,    setPtt]    = useState(false);
  const [ns,     setNs]     = useState(true);
  const [room,   setRoom]   = useState("lobby");
  const [chat,   setChat]   = useState(true);
  const [msgs,   setMsgs]   = useState(INIT_MSGS);
  const [input,  setInput]  = useState("");
  const [spk,    setSpk]    = useState({ 3:true });
  const [floats, setFloats] = useState([]);
  const endRef = useRef(null);
  const timer  = useTimer();

  useEffect(() => {
    const id = setInterval(() => {
      const next = {};
      USERS.forEach(u => { next[u.id] = u.isYou ? (!muted && !ptt && Math.random()>.45) : Math.random()>.56; });
      setSpk(next);
    }, 2300);
    return () => clearInterval(id);
  }, [muted, ptt]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  const send = () => {
    if (!input.trim()) return;
    const t = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    setMsgs(m => [...m, { id:Date.now(), uid:1, text:input, t }]);
    setInput("");
  };

  const react = (emoji) => {
    const id = Date.now(), x = 18+Math.random()*64;
    setFloats(f => [...f, { id, emoji, x }]);
    setTimeout(() => setFloats(f => f.filter(i => i.id!==id)), 1800);
    const t = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    setMsgs(m => [...m, { id, uid:1, text:emoji, t, rx:true }]);
  };

  const BG='#06060f', PNL='#0a0a1c', CRD='#0e0e23', BD='#171736', DIM='#353570';

  return <>
    <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }}/>
    <div style={{ display:'flex', height:'100vh', background:BG, color:'#e0deef',
      fontFamily:"'Outfit',-apple-system,sans-serif", overflow:'hidden',
      position:'relative', fontSize:14, userSelect:'none' }}>

      {/* Ambient background glow */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:0,
        background:'radial-gradient(ellipse 55% 50% at 32% 48%, rgba(139,92,246,.07) 0%, transparent 70%)' }}/>

      {/* Floating emoji reactions */}
      {floats.map(f => (
        <div key={f.id} style={{ position:'absolute', bottom:80, left:`${f.x}%`,
          fontSize:30, pointerEvents:'none', zIndex:99,
          animation:'floatUp 1.8s ease-out forwards' }}>{f.emoji}</div>
      ))}

      {/* ═══ SIDEBAR ═══ */}
      <nav style={{ width:200, background:PNL, borderRight:`1px solid ${BD}`,
        display:'flex', flexDirection:'column', flexShrink:0, zIndex:2 }}>

        {/* Wordmark */}
        <div style={{ padding:'15px 16px', borderBottom:`1px solid ${BD}`,
          display:'flex', alignItems:'center', gap:9 }}>
          <span style={{ fontSize:22 }}>🐦</span>
          <span style={{ fontWeight:800, fontSize:14, letterSpacing:'-.01em' }}>
            Chickadee
            <span style={{ background:'linear-gradient(90deg,#a78bfa,#60a5fa)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}> CHAT</span>
          </span>
        </div>

        <div style={{ flex:1, padding:'12px 8px', overflowY:'auto' }}>
          {/* Rooms */}
          <p style={{ fontSize:9, fontWeight:700, letterSpacing:'.11em', color:DIM, padding:'0 10px 8px' }}>ROOMS</p>
          {ROOMS.map(r => (
            <div key={r.id} className="rr" onClick={() => setRoom(r.id)} style={{
              display:'flex', alignItems:'center', gap:8, padding:'7px 10px', marginBottom:2,
              background: room===r.id ? 'linear-gradient(135deg,rgba(139,92,246,.22),rgba(59,130,246,.13))' : 'transparent',
              border:`1px solid ${room===r.id ? 'rgba(139,92,246,.32)' : 'transparent'}`,
            }}>
              <span style={{ fontSize:14 }}>{r.icon}</span>
              <span style={{ flex:1, fontSize:12, fontWeight:room===r.id?700:400, color:room===r.id?'#c4b5fd':DIM }}>{r.label}</span>
              {r.n>0 && <span style={{ background:'#4c1d95', color:'#ddd6fe', borderRadius:99, padding:'1px 6px', fontSize:9, fontWeight:700 }}>{r.n}</span>}
            </div>
          ))}
          <div className="rr hov" style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
            border:`1px dashed ${BD}`, color:DIM, marginTop:6, opacity:.65, fontSize:12 }}>
            <span>＋</span><span>Create Room</span>
          </div>

          {/* Friends */}
          <p style={{ fontSize:9, fontWeight:700, letterSpacing:'.11em', color:DIM, padding:'18px 10px 8px' }}>
            FRIENDS — {FRIENDS.filter(f=>f.status!=='offline').length} online
          </p>
          {FRIENDS.map(f => (
            <div key={f.name} className="rr hov" style={{ display:'flex', alignItems:'center',
              gap:8, padding:'5px 8px', marginBottom:2 }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                <div style={{ width:26, height:26, borderRadius:'50%',
                  background:`linear-gradient(135deg,${f.hue},${f.hue}66)`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, fontWeight:800, color:'#fff' }}>{f.init}</div>
                <div style={{ position:'absolute', bottom:0, right:0, width:8, height:8,
                  borderRadius:'50%', background:STCOLOR[f.status], border:`2px solid ${PNL}`,
                  animation: f.status==='online' ? 'dotPulse 2.5s ease-in-out infinite' : 'none' }}/>
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:500, color:f.status==='offline'?DIM:'#d0cee8' }}>{f.name}</div>
                <div style={{ fontSize:9, color:DIM }}>{f.where}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Self status */}
        <div style={{ padding:'10px 12px', borderTop:`1px solid ${BD}`, background:'rgba(0,0,0,.32)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ position:'relative' }}>
              <div style={{ width:30, height:30, borderRadius:'50%',
                background:'linear-gradient(135deg,#f59e0b,#f97316)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:800, fontSize:13 }}>R</div>
              <div style={{ position:'absolute', bottom:0, right:0, width:8, height:8,
                borderRadius:'50%', background:'#22c55e', border:`2px solid ${PNL}`,
                animation:'dotPulse 2.5s ease-in-out infinite' }}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#e0deef' }}>Rain</div>
              <div style={{ fontSize:10, color:DIM, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>🎮 Deep Rock Galactic</div>
            </div>
            <span className="hov" style={{ fontSize:14, opacity:.45 }}>⚙️</span>
          </div>
        </div>
      </nav>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', zIndex:1 }}>

        {/* Room header */}
        <header style={{ padding:'10px 18px', borderBottom:`1px solid ${BD}`,
          display:'flex', alignItems:'center', gap:10, background:'rgba(0,0,0,.2)', flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15, display:'flex', alignItems:'center', gap:7 }}>
              🏠 Lobby
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99,
                background:'rgba(59,130,246,.14)', border:'1px solid rgba(59,130,246,.26)',
                color:'#93c5fd', letterSpacing:'.03em' }}>4 / 4</span>
            </div>
            <div style={{ fontSize:10, color:DIM, marginTop:2 }}>Deep Rock Galactic · ⏱ {timer}</div>
          </div>
          <div style={{ flex:1 }}/>
          {/* Noise suppression */}
          <div className="hov" onClick={() => setNs(n=>!n)} style={{ padding:'4px 10px', borderRadius:99,
            background: ns?'rgba(34,197,94,.1)':'rgba(255,255,255,.04)',
            border:`1px solid ${ns?'rgba(34,197,94,.25)':BD}`,
            color: ns?'#4ade80':DIM, fontSize:10, fontWeight:500,
            display:'flex', alignItems:'center', gap:4 }}>
            🎙️ {ns?"Noise Suppressed":"Noise Off"}
          </div>
          {/* Connected badge */}
          <div style={{ padding:'4px 10px', borderRadius:99, fontSize:10, fontWeight:600,
            background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.22)', color:'#22c55e',
            display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e',
              animation:'dotPulse 2.5s ease-in-out infinite' }}/>
            Connected
          </div>
          {/* Chat toggle */}
          <div className="hov" onClick={() => setChat(c=>!c)} style={{ padding:'5px 12px', borderRadius:8,
            background: chat?'rgba(139,92,246,.16)':'rgba(255,255,255,.04)',
            border:`1px solid ${chat?'rgba(139,92,246,.3)':BD}`,
            color: chat?'#c4b5fd':DIM, fontSize:11, fontWeight:500 }}>💬 Chat</div>
        </header>

        {/* Grid + Chat */}
        <div style={{ flex:1, display:'flex', overflow:'hidden', padding:14, gap:12 }}>

          {/* 2×2 Video grid */}
          <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr 1fr', gap:10 }}>
            {USERS.map(u => <Tile key={u.id} u={u} speaking={!!spk[u.id]} isMuted={u.isYou&&muted} CARD={CRD} BD={BD}/>)}
          </div>

          {/* Chat panel */}
          {chat && <ChatPanel msgs={msgs} input={input} setInput={setInput}
            send={send} react={react} endRef={endRef} CARD={CRD} BD={BD} DIM={DIM}/>}
        </div>

        {/* Control bar */}
        <footer style={{ padding:'10px 20px 16px', display:'flex', justifyContent:'center',
          alignItems:'center', gap:6, flexShrink:0, borderTop:`1px solid ${BD}`, background:'rgba(0,0,0,.22)' }}>
          <CBtn icon={muted?"🔇":"🎤"} label={muted?"Unmute":"Mute"}     on={!muted} danger={muted} onClick={()=>setMuted(m=>!m)}/>
          <CBtn icon="📷"              label={cam?"Stop Cam":"Camera"}    on={cam}                  onClick={()=>setCam(c=>!c)}/>
          <CBtn icon="🖥️"              label={share?"Stop Share":"Share"} on={share}                onClick={()=>setShare(s=>!s)}/>
          <CBtn icon="🎙️"              label={ptt?"PTT On":"Push-Talk"}   on={ptt}                  onClick={()=>setPtt(p=>!p)}/>
          <CBtn icon="🔊"              label="Volume"                     on={false}                onClick={()=>{}}/>
          <CBtn icon="⚙️"              label="Settings"                   on={false} fade            onClick={()=>{}}/>
          <div style={{ width:1, height:36, background:BD, margin:'0 8px' }}/>
          <button className="cb" onClick={()=>{}} style={{ background:'linear-gradient(135deg,#991b1b,#ef4444)',
            border:'none', padding:'10px 22px', color:'#fff', fontSize:13, fontWeight:700,
            boxShadow:'0 0 26px rgba(239,68,68,.26)', flexDirection:'row', gap:6,
            fontFamily:'inherit', cursor:'pointer', borderRadius:10 }}>📵 Leave</button>
        </footer>
      </div>
    </div>
  </>;
}

function Tile({ u, speaking, isMuted, CARD, BD }) {
  return (
    <div style={{ background:CARD, borderRadius:16,
      border: speaking?`2px solid ${u.hue}`:`1px solid ${BD}`,
      boxShadow: speaking?`0 0 34px ${u.hue}1e, inset 0 0 70px ${u.hue}06`:'none',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      position:'relative', overflow:'hidden', transition:'border .28s, box-shadow .28s' }}>

      {/* Radial ambient glow */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:`radial-gradient(circle at 50% 62%, ${u.hue}0d 0%, transparent 58%)` }}/>

      {/* Ripple rings (double-staggered) */}
      {speaking && <>
        <div style={{ position:'absolute', width:92, height:92, borderRadius:'50%', pointerEvents:'none',
          border:`2px solid ${u.hue}55`, animation:'ripple 1.3s ease-out infinite' }}/>
        <div style={{ position:'absolute', width:92, height:92, borderRadius:'50%', pointerEvents:'none',
          border:`2px solid ${u.hue}28`, animation:'ripple 1.3s ease-out infinite', animationDelay:'.45s' }}/>
      </>}

      {/* Avatar circle */}
      <div style={{ width:68, height:68, borderRadius:'50%', position:'relative', zIndex:1,
        background:`linear-gradient(145deg, ${u.hue}ee, ${u.hue}66)`,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:26, fontWeight:800, color:'#fff',
        boxShadow: speaking?`0 0 34px ${u.hue}70`:`0 4px 22px rgba(0,0,0,.55)`,
        transition:'box-shadow .3s' }}>
        {u.init}
        {isMuted && <div style={{ position:'absolute', bottom:-3, right:-3, width:20, height:20,
          borderRadius:'50%', background:'#ef4444', border:`2px solid ${CARD}`,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:9 }}>🔇</div>}
      </div>

      {/* Name badge */}
      <div style={{ position:'absolute', bottom:10, left:10, display:'flex', alignItems:'center', gap:4,
        background:'rgba(0,0,0,.83)', borderRadius:8, padding:'3px 9px' }}>
        {speaking && <div style={{ width:5, height:5, borderRadius:'50%', flexShrink:0,
          background:u.hue, boxShadow:`0 0 7px ${u.hue}` }}/>}
        <span style={{ fontSize:11, fontWeight:600, color:'#e0deef' }}>{u.name}{u.isYou?' (you)':''}</span>
      </div>

      {/* Game tag */}
      <div style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.72)',
        borderRadius:5, padding:'2px 6px', fontSize:9, color:'#2a2a62' }}>🎮 DRG</div>
    </div>
  );
}

function ChatPanel({ msgs, input, setInput, send, react, endRef, CARD, BD, DIM }) {
  return (
    <div style={{ width:250, display:'flex', flexDirection:'column', background:CARD,
      borderRadius:14, border:`1px solid ${BD}`, overflow:'hidden', flexShrink:0,
      animation:'slideInR .2s ease' }}>
      <div style={{ padding:'9px 14px', borderBottom:`1px solid ${BD}`,
        fontSize:9, fontWeight:700, letterSpacing:'.11em', color:DIM }}>ROOM CHAT</div>
      <div style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
        {msgs.map(m => {
          const u = USERS.find(x => x.id===m.uid);
          return (
            <div key={m.id} style={{ marginBottom:10, animation:'msgIn .15s ease' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:1 }}>
                <span style={{ fontSize:11, fontWeight:700, color:u.hue }}>{u.name}</span>
                <span style={{ fontSize:9, color:'#1a1a4a' }}>{m.t}</span>
              </div>
              <div style={{ fontSize:m.rx?22:12, color:'#aeaccc', lineHeight:1.5 }}>{m.text}</div>
            </div>
          );
        })}
        <div ref={endRef}/>
      </div>
      {/* Reaction strip */}
      <div style={{ padding:'5px 10px', borderTop:`1px solid ${BD}`, display:'flex', gap:2 }}>
        {EMOJIS.map(e => <div key={e} className="rx" onClick={()=>react(e)}
          style={{ fontSize:15, background:'rgba(255,255,255,.04)' }}>{e}</div>)}
      </div>
      {/* Input */}
      <div style={{ padding:'7px 10px', borderTop:`1px solid ${BD}`, display:'flex', gap:6 }}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Message..."
          style={{ flex:1, background:'rgba(255,255,255,.04)', border:`1px solid ${BD}`,
            borderRadius:8, padding:'5px 9px', color:'#e0deef', fontSize:12, fontFamily:'inherit' }}/>
        <div className="hov" onClick={send} style={{ width:28, height:28, borderRadius:7, flexShrink:0,
          background:'linear-gradient(135deg,#7c3aed,#3b82f6)',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>→</div>
      </div>
    </div>
  );
}

function CBtn({ icon, label, on, danger, fade, onClick }) {
  const [hov, setHov] = useState(false);
  const bg = danger?'rgba(239,68,68,.18)':on?'rgba(139,92,246,.18)':hov?'rgba(255,255,255,.07)':'rgba(255,255,255,.04)';
  const bd = danger?'rgba(239,68,68,.38)':on?'rgba(139,92,246,.38)':'#171736';
  const lc = danger?'#f87171':on?'#c4b5fd':fade?'#171740':'#353570';
  return (
    <div className="cb" onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:bg, border:`1px solid ${bd}`, transform:hov?'translateY(-2px)':'none' }}>
      <span style={{ fontSize:17 }}>{icon}</span>
      <span style={{ fontSize:9, color:lc, fontWeight:500, textAlign:'center' }}>{label}</span>
    </div>
  );
}
