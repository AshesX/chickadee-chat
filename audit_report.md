# P2P Architecture Audit: NAT Persistence & Reliability

This document audits the three proposed ideas to improve STUN-only P2P reliability, specifically in the context of Opus DTX.

## 1. The Keepalive Data Channel

**Current State:** 
The application relies on perfect negotiation in `peerLink.ts` to manage audio and video streams. However, there is no persistent `RTCDataChannel` used for keepalives on the media connection. File transfers (`fileTransferLink.ts`) and soundboard sync (`useSoundboardSync.ts`) use ephemeral, on-demand DataChannels that tear down after use.

**Investigation & Impact:**
Because Opus DTX (`usedtx=1`) is aggressively enabled in `sdp.ts` to save bandwidth, the connection stops sending RTP audio packets when users aren't speaking (and aren't sharing video). In a STUN-only P2P mesh, this is dangerous: many consumer NAT routers aggressively time out idle UDP bindings (often within 30-60 seconds). If DTX pauses traffic for longer than the NAT timeout, the router closes the port, silently killing the connection. 

Implementing a persistent `system-keepalive` DataChannel with a 10-second ping interval is a **highly viable and recommended** solution. WebRTC DataChannels multiplex over the same underlying DTLS/ICE transport as the media tracks. A tiny 10-second heartbeat ensures continuous bi-directional UDP traffic, preventing NAT timeouts regardless of DTX silence.

## 2. Rapid Dead-Link Detection

**Current State:**
The app currently has a connection health monitor (`connectionHealthPolicy.ts`) hooked into `usePeerMesh.ts` that ticks every 2 seconds. Based on the imports and structure, it evaluates link health based on inbound audio packet counters (`sumInboundAudioPackets`). If inbound RTP stalls, it triggers `maybeRestartIce()`.

**Investigation & Impact:**
Relying on audio packet counts for health is fundamentally at odds with Opus DTX. During extended silence, DTX stops packet flow, which can cause the current monitor to mistake a perfectly healthy (but silent) connection for a "stalled" one, triggering unnecessary ICE restarts. 

By expanding the Keepalive Data Channel to enforce a strict ping/pong acknowledgment (e.g., assuming a dead link after 3 missed pongs/30 seconds), you can decouple link health from media packet flow entirely. This provides a deterministic, rapid dead-link detection mechanism that triggers `maybeRestartIce()` much faster than the browser's native `iceConnectionState` failure timeouts (which can take 15–30 seconds), while completely eliminating false positives caused by Opus DTX.

## 3. STUN Diversity

**Current State:**
The default STUN configuration in `packages/shared/src/ice.ts` provides two public servers:
- `stun:stun.l.google.com:19302`
- `stun:stun.cloudflare.com:3478`

**Investigation & Impact:**
Both default STUN servers operate on traditional WebRTC/STUN ports (19302 and 3478). Many corporate, school, or restrictive public Wi-Fi networks block unknown UDP ports, rendering these STUN servers unreachable and preventing the P2P connection from ever establishing.

Diversifying the `iceServers` array to include STUN endpoints listening on standard, rarely-blocked ports—specifically **UDP port 443 (HTTPS/QUIC) and UDP port 53 (DNS)**—can dramatically improve connection success rates on strict networks. For example, Google and Twilio offer STUN on port 443 (e.g. `stun:stun.l.google.com:443`). Since WebRTC ICE candidate gathering tests these in parallel, adding 2-3 port-diverse STUN servers adds almost zero latency to the connection setup while significantly improving STUN-only NAT traversal robustness.
