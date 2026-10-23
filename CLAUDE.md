# Notes for Claude Code

- Vite + three.js r128 (pinned on purpose; newer three.js changes colour management and the look). Plain JavaScript ES modules, no framework, no TypeScript.
- `src/content.js` holds all visitor-facing text. Keep facts there accurate to Austin's real work; do not invent projects, dates or claims.
- `src/main.js` is still one large module with shared state (`P` player, `camS` camera, `mode`, `T` time). When splitting it, move one system at a time and run `npm run build` plus a manual check in the browser after each move. Self-contained systems already live in their own modules: `oracle.js`, `constellation.js`, `relics.js`, `hero.js`, `colliders.js`.
- Anything solid needs a collider (`addFrustum` / `addBox` in `src/colliders.js`) so the wanderer can stand on it and arrows stop at it. Visual meshes alone are walk-through.
- In dev, `window.__valley` exposes the player, camera state, relics and `step(n)` (advance the simulation n frames) for checking things from the browser console.
- The visual direction is dark and mysterious (night, a glowing star, basalt, cyan and gold accents). Avoid bright or fairytale styling.
- The valley is Austin's own tended place, not someone else's ruin: no broken columns, abandoned structures or crystals stuck in the ground, and no swarms of creatures around the wanderer. Never place anything that can read as a grave marker (a stone, stele or obelisk, least of all one tied to his name). The ground should feel cared for: meadow, pines, natural rock, the lantern-lit path.
- Keep the résumé, GitHub and LinkedIn links reachable in one click at all times, and keep every 3D interaction available through a shortcut (keys 1–7, the relic tracker, the Oracle) for visitors who will not play.
- Respect `prefers-reduced-motion` (it skips the intro and particle drift).
- Verify with `npm run build` before committing.
