# Austin's 3D Portfolio

A dark valley under a sleeping star. Austin's projects and experience drift overhead as sealed relics. Visitors shoot them down with a bow, or ask the Oracle (the star) to bring one down. Each relic opened sends a beam of light back to the star: it grows a ray in that relic's colour, the valley brightens a step, and the skills the project used wake as stars in a constellation overhead. Projects that share a skill are joined by a line, so with all six open the sky becomes one chart of Austin's stack. The résumé, GitHub and LinkedIn links stay in the top bar the whole time.

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
| C | Look up at the skill constellation (also the ✦ button in the relic tracker) |
| Click a star | The Oracle names the relics that use that skill |
| Esc | Send the open relic back to the sky |

Light the four braziers on the spiral stairs to wake a hidden seventh relic. Column capitals, basalt columns, boulders and stair stones can all be stood on; click a column to fly up onto it.

## Project layout

```
index.html          Page markup: top bar, relic tracker, card, chat dock
src/main.js           The world: scene, valley, lighting, relic logic, player, arrows, camera, UI wiring
src/oracle.js         The star (the Oracle): core, rings, shards, the rays it regains, returning light
src/constellation.js  The skill constellation: star layout, figures, labels, wake-up animation
src/relics.js         The seven relic models and how each one unfolds when opened
src/hero.js           The wanderer model, bow and scarf, and their animation
src/moths.js          Lantern moths around the wanderer and the crystals
src/colliders.js      Solid shapes for standing, walls, ceilings and arrow hits
src/content.js        Everything visitors read: relic text, skills, the Oracle's lines and answers
src/noise.js          Seeded random and value noise (the valley is identical on every visit)
src/textures.js       Canvas-drawn textures: glows, rays, runes, sigils, dials, paper, moth wings
src/styles.css      UI styles and design tokens
```

To change wording, edit `src/content.js` only. The constellation comes from `SKILLS` there: each skill lists the relics whose text names it, and star positions live in `AT` at the top of `src/constellation.js` (a skill without a position is placed automatically in its group).

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
