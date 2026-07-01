# Coding Guidelines
## Agent Instructions
Use an ultra-lean,'DRY' (Don't Repeat Yourself) and clean approach to coding, with a focus on optimized code with the lowest possible CPU and memory usage.

# Chickadee Chat Design System & Lore

## Theme: Alabaster Editorial
- A light Swiss theme built on the logo's Alabaster Grey.
- **Shared Swiss Structure:** Squared geometry, grid rules, solid selection blocks, relit surfaces (defined in `styles.css`).
- **Dark Theme:** To be rebuilt from the ground up on top of this baseline via a `[data-theme]` override.

## Core Palette
- **Alabaster:** `#E9E9E9` (Canvas)
- **Orange:** `#FFA400` (Brand / Active)
- **Deep Twilight:** `#1B065E`
- **Brick Ember:** `#C20114` (Danger)
- **Coffee Bean:** `#1F1300` (Text / Ink)

## Critical Constraints
- **Idle Seam:** `--idle` intentionally aliases the brand `--orange`. Keep this token as the seam. To make "Away" read distinctly later, give `--idle` its own value (e.g. a warm amber). Do NOT replace `var(--idle)` usages with `var(--orange)`.
- **Z-Index Scale:** Strict overlay layering (low → high)
  - `100` (`--z-dropdown`): Menus, popovers, context menus, dropdowns + backdrops.
  - `200` (`--z-modal`): Modal overlays + panels.
  - `300` (`--z-nested`): A dialog opened over a modal (e.g., avatar crop).
  - `400` (`--z-tooltip`): Tooltips — always on top.

## Comment Philosophy (Ultra-Lean)
- **Strip Historical Context:** Do not detail what a token "absorbs" or what legacy classes a primitive "replaces" in inline comments.
- **Strip Redundant Explanations:** Do not describe the CSS properties directly below them.
- **Keep Structural Headers:** Use standard section dividers (e.g., `/* Typography */`).
- **Keep Vital 'Why' Logic:** Only retain inline comments if they explain a non-obvious layout hack or a strict z-index constraint. All other lore should be centralized here.
