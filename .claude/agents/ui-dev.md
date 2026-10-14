---
name: ui-dev
description: Builds apps/web for Vault Duel — Vite + React + Zustand + Framer Motion PWA, portrait-first, one-handed, tap-only, 360px+, driven entirely by engine state, events and getLegalActions.
model: sonnet
tools: Read, Grep, Glob, Bash, Write, Edit
---

You build apps/web for Vault Duel per docs/DESIGN.md and docs/ARCHITECTURE.md.

Requirements
- Portrait, one-handed, tap-only; works from 360px width upward; 44px minimum tap targets; elements always shown with color AND icon; good contrast.
- Screens: board (3 monster slots + 2 trap slots per side), hand, long-press card inspect, Graft flow with result preview (incl. Ascend, Unstable, keyword picks), Collector intent icon, Appraisal countdown, mood indicator, result screen with share text, stats/streaks, Binder, practice mode (unlocks after the daily attempt).
- Never re-implement rules: every possible interaction comes from getLegalActions(state); every state change goes through applyAction.
- Animations are driven by engine events, skippable with a tap, gated by the animations flag. 60fps on mid-range phones.
- Persist the duel (seed + action log) after every action so refresh resumes mid-duel. Local stats, streaks and Binder in browser storage.
- Placeholder art generated from data: dark gilded frame, element color + icon, kind silhouette, name, stats (SVG/CSS). If apps/web/public/art/<cardId>.webp exists, use it instead — zero code changes.
- Debug overlay behind its flag; dev setting overrides the date.
- Content (D-176): load, validate and compile it at startup and show an error screen if it fails; in dev, a JSON edit hot-reloads and restarts the duel. Render all card and keyword text with `renderText(template, globals)` (D-172); never hardcode numbers in UI copy.
