# Chickadee Chat - RAM Usage Audit & Review

I've conducted a thorough audit of the `chickadee-chat` codebase (specifically the Electron desktop app and its React renderer) to identify how memory and CPU are managed, and to find potential areas for improving RAM usage. 

Overall, the application employs several very smart architectural decisions to minimize resource usage in the background, but there are a few potential memory bottlenecks.

## Current Optimizations (What's working well)

> [!TIP]
> **Video Decoding Suspension**
> The app employs an excellent optimization to stop decoding video when it's not visible. Because `backgroundThrottling: false` is set in the main process (to keep voice features responsive), Chromium would normally keep decoding incoming WebRTC video frames. However, the app passes a `windowVisible` prop down to `ParticipantTile` and `ScreenView`. When the window is minimized or hidden in the tray, it swaps the `<video>` element's `srcObject` to an **audio-only stream**. This detaches the video track, allowing Chromium to halt video decoding (a huge CPU/RAM saver) while keeping the audio playing.

> [!TIP]
> **WebRTC Cleanup & Perfect Negotiation**
> The WebRTC logic in `webrtc/peerLink.ts` is robust. It uses the perfect-negotiation pattern and utilizes `replaceTrack(null)` to pause video transmission without tearing down the connection. When a peer leaves (`closeLink` in `usePeerMesh.ts`), the `RTCPeerConnection` is closed and event listeners are cleaned up properly, avoiding dangling connection leaks.

> [!TIP]
> **Audio Processing Timers**
> The audio-activity and voice-activation hooks (`useAudioActivity.ts`, `useVoiceActivation.ts`) wisely use `setInterval` at ~50Hz rather than `requestAnimationFrame`. Because `rAF` stalls when the window is minimized, `setInterval` ensures background audio processing continues. They also debounce state changes to prevent thrashing React with 50Hz re-renders.

---

## Areas for Improvement (Potential RAM Hogs)

### 1. Unbounded Chat History & Lack of Virtualization
> [!WARNING]
> The most significant potential RAM leak is in the room chat. 

In `useRoomChat.ts`, incoming messages are continuously appended to an array:
```typescript
setMessages((m) => [...m, message]);
```
While the chat is cleared when switching rooms, if a user stays in an active room for hours or days, this array will grow indefinitely. 
Furthermore, `ChatPanel.tsx` maps over every single message and renders a DOM node for it. Thousands of messages will lead to thousands of DOM elements, causing the renderer's memory footprint to balloon and performance to degrade.
**Fix:** Implement virtualization (using libraries like `react-virtuoso` or `react-window`) or cap the message history (e.g., keeping only the most recent 200 messages).

### 2. Base64 Avatar Storage (String Heap Memory)
Avatars are synced over the signaling relay and persisted in settings as Base64 Data URLs (`avatarDataUrl`). Base64 strings are 33% larger than raw binary data and are stored directly in the V8 JavaScript heap. If users upload large images, or if there are many peers in a space, these large strings will sit in memory continuously.
**Fix:** Convert Base64 data URLs to binary `Blob` objects and use `URL.createObjectURL(blob)` for the `<img>` tags. Blobs are managed outside the V8 heap and are much more memory efficient.

### 3. React Re-render Churn (Virtual DOM Memory)
The root component (`App.tsx`) is very large and orchestrates a massive amount of state (WebRTC mesh, chat, settings, window focus, user presence). Because React relies on Virtual DOM reconciliation, frequent state changes (e.g., a peer speaking, a new chat message, or a volume slider moving) can cause large portions of the component tree to re-render. Frequent re-renders allocate many short-lived objects that the Garbage Collector has to clean up, temporarily spiking RAM and CPU.
**Fix:** Memoize heavy child components (like `ParticipantTile`, `ChatPanel`, `Sidebar`) using `React.memo` and ensure stable object references via `useMemo`/`useCallback`.

### 4. Background Timer Accumulation
While using `setInterval` for audio processing is necessary for background execution, running multiple 50Hz intervals (one for `useVoiceActivation`, one for `useNoiseExpander`, and one `useAudioActivity` per remote peer) means the JS event loop is constantly waking up.
**Fix:** If there are many peers in a room, you could centralize the audio polling into a single `setInterval` loop that iterates over all active audio nodes, rather than spawning a separate interval for each hook instance.
