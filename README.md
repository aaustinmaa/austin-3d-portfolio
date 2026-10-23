# Austin's 3D Portfolio

A night valley under an eclipse. Austin's projects and experience drift overhead as sealed relics. Visitors shoot them down with a bow, or ask the Oracle (the eclipse) to bring one down. The résumé, GitHub and LinkedIn links stay in the top bar the whole time.

Built with [three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). No other runtime dependencies.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173, reloads on save
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

Requires Node 18 or newer.

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | Walk |
| Space | Jump. Hold in the air to fly (uses the energy ring) |
| Shift | Dive while gliding |
| Drag | Look around, up to about 75° overhead |
| Click a relic | Auto shot: the wanderer fires a homing arrow |
| F | Toggle "draw the bow": hold to draw, drag to aim, release to shoot |
| 1–7 | Summon a relic directly |
| Esc | Send the open relic back to the sky |

Light the four braziers on the spiral stairs to wake a hidden seventh relic.

## Project layout

```
index.html          Page markup: top bar, relic tracker, card, chat dock
src/main.js         The world: scene, valley, eclipse, relics, wanderer, bow, flight, camera, UI wiring
src/content.js      Everything visitors read: relic text and the Oracle's scripted answers
src/noise.js        Seeded random and value noise (the valley is identical on every visit)
src/textures.js     Canvas-drawn textures: glows, corona, runes, the Oracle's eye
src/styles.css      UI styles and design tokens
```

To change wording, edit `src/content.js` only.

## Status

Prototype. Still to do:

- Replace the placeholder résumé and LinkedIn links in `index.html`.
- Connect the Oracle to a real language model. This needs a small backend (for example Cloudflare Workers or Vercel) so the API key never reaches the browser.
- Split `src/main.js` further (world, relics, archery, flight, UI) as features grow.
- three.js is pinned to r128, which the prototype was written against. Upgrading changes colour management, so check the look after any upgrade.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages. It only runs when started by hand (Actions → Deploy to GitHub Pages → Run workflow). Before the first run:

1. GitHub Pages on a free account needs a public repository. The other option is to deploy the private repository on Vercel or Netlify instead.
2. In Settings → Pages, set Source to **GitHub Actions**.

To deploy on every push to `main`, add a `push` trigger to the workflow.
