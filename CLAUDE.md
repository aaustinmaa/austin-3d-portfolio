# Notes for Claude Code

- Vite + three.js r128 (pinned on purpose; newer three.js changes colour management and the look). Plain JavaScript ES modules, no framework, no TypeScript.
- `src/content.js` holds all visitor-facing text. Keep facts there accurate to Austin's real work; do not invent projects, dates or claims.
- `src/main.js` is still one large module with shared state (`P` player, `camS` camera, `mode`, `T` time). When splitting it, move one system at a time and run `npm run build` plus a manual check in the browser after each move.
- The visual direction is dark and mysterious (night, eclipse, basalt, cyan and gold accents). Avoid bright or fairytale styling.
- Keep the résumé, GitHub and LinkedIn links reachable in one click at all times, and keep every 3D interaction available through a shortcut (keys 1–7, the relic tracker, the Oracle) for visitors who will not play.
- Respect `prefers-reduced-motion` (it skips the intro and particle drift).
- Verify with `npm run build` before committing.
