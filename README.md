# Austin's 3D Portfolio

A dark valley under a sleeping star. Austin's projects and experience drift overhead as sealed relics. Visitors shoot them down with a bow, or ask the Oracle (the star) to bring one down. The star is a heart of light inside a rhombic triacontahedron of clear glass, nested in six convex shells that start as fine line drawings tumbling around three symmetry axes. Each relic opened sends a beam back to it: one shell fills with glass in that relic's colour and turns into line with the axes, so the finished star settles into one symmetric jewel. The star also grows a ray, the valley brightens a step, and the skills the project used wake as stars in a constellation overhead. Projects that share a skill are joined by a line, so with all six open the sky becomes one chart of Austin's stack. The résumé, GitHub and LinkedIn links stay in the top bar the whole time.

Built with [three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). No other runtime dependencies.

The wanderer wears a pale, thin woven robe and a sewn hood with a pointed back and a short neck drape. Cloth panels run from a small pointed front opening back to the rear seam. The upper arch projects forward over the forehead, while the lower corners fall outward and down toward the neck. Subtle movement at the hem, cuffs and rear hood tip uses CPU vertex deformation in the existing three.js r128 runtime, including gentle inertia when starting, stopping and turning. The face opening and shoulders stay anchored, and cloth motion respects `prefers-reduced-motion`.

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

Light the four braziers on the spiral stairs to wake a hidden seventh relic. The wish pillars' caps, boulders, stair stones and the brazier landings can all be stood on; click a pillar to fly up onto it. The short introduction opens on arrival and again whenever you click Austin's name in the top bar.

## Project layout

```
index.html          Page markup: top bar, relic tracker, card, chat dock
src/main.js           The world: scene, valley, lighting, relic logic, player, arrows, camera, UI wiring
src/oracle.js         The star (the Oracle): glass core, six glass shells, the rays it regains, returning light
src/polyhedra.js      Polyhedra drawn as light: clear glass and glowing-edge shaders, the star's convex solids
src/constellation.js  The skill constellation: star layout, figures, labels, wake-up animation
src/relics.js         The seven relic models (faceted, with soft auras) and how each one unfolds when opened
src/hero.js           The wanderer (a small doll in a thin robe and draped hood), its bow and lantern, and their animation
src/colliders.js      Solid shapes for standing, walls, ceilings and arrow hits
src/content.js        Everything visitors read: relic text, skills, the Oracle's lines and answers
src/noise.js          Seeded random and value noise (the valley is identical on every visit)
src/textures.js       Canvas-drawn textures: glows, rays, runes, sigils, dials, paper, fabric weave
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
