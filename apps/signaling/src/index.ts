// Entry point — kept stable so Docker (`bun src/index.ts`) and `npm run dev`
// keep working unchanged. The WebSocket server + message dispatch live in
// ./server; in-memory state in ./state, per-message handlers in ./handlers/,
// env-derived limits in ./config, and pure (unit-tested) decisions in ./logic.
import './server';
