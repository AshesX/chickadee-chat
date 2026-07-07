# Technical Debt & Architecture Audit

*Date: July 2026*

This document is a quick audit of the current state of the codebase, focusing on technically complex areas that are prime candidates for improvement.

## Overview
The codebase is generally in very good shape. Notably:
- **Strict Typing**: No `: any` types were found.
- **Clean Code**: Zero `TODO` or `FIXME` comments polluting the source code.

However, there are a few major architectural and technical debt leads that stand out for future improvement:

---

## 1. Monolith Files & "God" Components

There are a few incredibly large files that are likely doing too much, hurting maintainability:

- **`apps/desktop/src/renderer/src/App.tsx` (~72 KB, ~2,400 lines)**
  This is massive for a single React file. It’s highly likely this file is acting as a "God component"—handling routing, global state, auth, and layout all in one place. It needs to be broken down into smaller, composable views and state providers.

- **`apps/desktop/src/renderer/src/hooks/usePeerMesh.ts` (~36 KB, ~1,200 lines)**
  WebRTC is inherently complex, and housing the entire mesh logic in one hook usually results in a tangled mix of state, signaling events, and peer connection management. This is a prime candidate for refactoring into smaller, distinct domain classes or services (e.g., `PeerManager`, `TrackManager`).

- **`apps/signaling/src/index.ts` (~33 KB, ~1,100 lines)**
  The signaling server is built as a monolith in the entry file. It should be split out into separate connection handlers, room managers, and websocket events.

- **`packages/shared/src/index.ts` (~25 KB)**
  This is quite large for a shared package entry point and might be acting as a dumping ground. It could benefit from being split into isolated modules (e.g., `/types`, `/utils`, `/constants`).

---

## 2. High Cyclomatic Complexity (Deep Nesting)

A scan for deep indentation (4+ levels deep) found over 350 instances across the codebase. 

- Files like `WelcomeWizard.tsx` and `usePeerMesh.ts` showed significant nesting, which is often a symptom of "callback hell", inline complex rendering, or heavy `if/else` logic. 
- **Recommendation:** Extracting inline event handlers and flattening Promise chains/callbacks in the WebRTC logic would make these areas significantly more readable and testable.

---

## 3. Theme System & Hardcoded Values

- **Finding:** While there is an excellent design system defined in `theme.css` (the "Alabaster Editorial" palette), `styles.css` contains over 50+ hardcoded color values (like `#fff`, `#000`).
- **Recommendation:** According to the design lore, a Dark Theme needs to be built on top of this baseline via a `[data-theme]` override. Doing so will be incredibly tedious if `styles.css` bypasses the CSS variables (e.g., `var(--card)`, `var(--text)`). Cleaning this up and strictly enforcing design tokens would be a great quick win.
