# Austin's 3D Portfolio

A dark valley under a celestial Oracle. Its design follows option A in `reference/oracle-concepts.png`: three translucent ice-blue armillary ribbons with fine champagne-gold borders and engraved diagrams surround a luminous, nested geometric jewel. A delicate outer celestial frame, axial pearls, star-shaped medallions and sparse blue-violet dust give it depth. The rings and the shared core turn slowly; speech adds restrained light, and each main relic restores one of the six chapter jewels. The completed design stays composed rather than gaining more shells. Visitors shoot down Austin's projects as sealed relics, or ask the Oracle to summon one. Opening each relic returns light, brightens the valley and wakes the skills it used as stars in a constellation overhead. Projects sharing a skill are joined by a line. The résumé, GitHub and LinkedIn links stay in the top bar throughout.

Built with [three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). No other runtime dependencies. The Oracle uses actual 3D geometry and procedural materials. With `prefers-reduced-motion`, rotation, floating, moving highlights and expanding ripples stop; relic restoration still works.

For a close comparison with the selected concept, run the dev server and open `/reference/oracle-a.html`. Drag to orbit, scroll to zoom, and use the controls to inspect speech, partial restoration, completion and reduced motion. This development study is separate from the production entry page.

The wanderer wears a pale, thin woven robe and a sewn hood with a pointed back and a short neck drape. Cloth panels run from a small pointed front opening back to the rear seam. The upper arch projects a little forward over the forehead, while the lower corners flow into a neck drape tucked against the robe. Inside sits a shallow head with a flat face, rounded temples and a tapered chin, with two glowing eyes in shadow. Slim sleeves rest close to the body, with rounded caps keeping the shoulder seams attached as the arms reach the bow and string. The right hand grips the lantern's loop handle; a hip hook supports it when that hand draws the bow. Walking and flying use a steady forward lean without periodic body, head, arm or lantern sway. Subtle movement at the hem, cuffs and rear hood tip uses CPU vertex deformation in the existing three.js r128 runtime, including gentle inertia when starting, stopping and turning. The face opening follows the head while the lower neck drape stays anchored to the shoulders, including when aiming. Cloth motion respects `prefers-reduced-motion`.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173, reloads on save
npm run build      # production build into dist/
npm test           # geometry and collision regressions
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
| N | Write Austin a note on the paper crane's sheet (or click the unfolded paper by the stair) |
| Click a star | The Oracle names the relics that use that skill |
| Esc | Send the open relic back to the sky |

Light the four braziers on the spiral stairs to wake a hidden seventh relic. The wish pillars' caps, boulders, stair stones and the brazier landings can all be stood on; click a pillar to fly up onto it. The wanderer starts gliding toward the paper crane while the opening camera is still descending. The camera blends directly into following and moving closer, forming one continuous shot without stopping between the descent and zoom in. The wanderer follows a straight line from its starting position toward the crane and stops just short, facing in the same direction it travelled. Austin's name card appears halfway through the unfolding and closes when you leave. Clicking Austin's name in the top bar flies back to the crane and reopens the card. With reduced motion, the arrival and unfolding happen immediately.

Solid boundaries come from the rendered triangles: terrain, path stones, boulders, cliff faces, pillar shafts and caps, stair undersides, tree tiers, lanterns and hollow brazier bowls. Moving Oracle glass and folding paper update their boundaries with their animation. Walking and manual flight check this geometry. This comparison branch restores the original automatic movement: click flights and short stair hops directly animate an eased arc, ignoring obstacles along that arc, while similar-height clicks walk directly. The crane's ground glide and the lake's surface-dip/shore-return behavior remain. Both drawn and guided arrows stop at scenery, with the tip on its surface. Relics remain intangible: manual arrows have their original 1.9-metre hit tolerance and aim assistance, while guided arrows use a 1.2-metre arrival radius and a 2.5-second fallback. Their models never block movement or require a precise surface hit. Auras, flames, particles, grass and the lake's reflection remain non-solid.

Foreground rocks, trees and other scenery may naturally obscure the wanderer. They do not pull the camera closer, raise it or fade the character to keep the wanderer visible. Terrain clearance, manual zoom, aiming and the intentional crane-approach dolly still apply.

Manual aim selects points ahead of the bow so scenery behind the wanderer cannot turn an arrow backward. Arrows start at the bow and collide with scenery along their actual path.

The lake's bank follows the rendered terrain, so walking, low jumps and low flight can cross it freely. Touching open water triggers a splash and a hop back to dry ground.

Each brazier is a plain faceted stone bowl on an eight-sided stem, in the same basalt as the wish pillars, with no rings or ornament. It holds a golden fire that matches the valley's champagne-gold accents, never orange-red and never blue or violet. A volumetric shader shapes a single flame rising from glowing coals: a full, rounded base that fills the bowl and tapers to one pointed tip, its edge rippling and its tip flickering; the flame is dense, with a glaring white-hot heart that runs through gold to soft amber gold at the edges. The bowl hides the fire below its rim from every angle. Now and then a spark lifts off, beneath a soft halo and flickering local light. Lighting a brazier grows the flame up from the coals; with reduced motion the fire and lighting stay steady and no sparks rise.

## Project layout

```
index.html          Page markup: top bar, relic tracker, card, chat dock
src/main.js           The world: scene, valley, lighting, relic logic, player, arrows, camera, UI wiring
src/oracle.js         The Oracle interaction boundary: returning light, speech pulses, relic restoration
src/oracle-design.js  Option A: crystal ribbons, gold filaments, engraved scales, star jewels and geometric core
src/polyhedra.js      Polyhedra drawn as light: clear glass and glowing-edge shaders, the star's convex solids
src/constellation.js  The skill constellation: star layout, figures, labels, wake-up animation
src/relics.js         The seven relic models (faceted, with soft auras) and how each one unfolds when opened
src/hero.js           The wanderer (a small doll in a thin robe and draped hood), its bow and lantern, and their animation
src/braziers.js       Stair braziers: plain faceted stone bowls, glowing coals, volumetric fire, sparks and local lighting
src/paperbird.js      The paper crane by the stair: Austin's name card, unfolding into paper visitors can write a note on
src/colliders.js      Render-mesh collision trees for standing, body movement, ceilings and arrow hits
src/relic-targeting.js Forgiving arrow hits and aiming assistance for intangible relics
src/flight-path.js    Capsule-checked flight arcs, obstacle detours and support-contact classification
src/navigation.js    Ground and aerial path search, supported landing selection and cancellable click requests
src/bow-aim.js        Forward bow convergence for third-person aim
src/content.js        Everything visitors read: relic text, skills, the Oracle's lines and answers
src/noise.js          Seeded random and value noise (the valley is identical on every visit)
src/textures.js       Canvas-drawn textures: glows, rays, runes, sigils, dials, paper, fabric weave
src/styles.css      UI styles and design tokens
```

To change wording, edit `src/content.js` only. Visitor notes are posted as JSON (`{ name, message }`) to `NOTE.endpoint` there; until it is set, the paper says notes are not connected yet. The constellation comes from `SKILLS` there: each skill lists the relics whose text names it, and star positions live in `AT` at the top of `src/constellation.js` (a skill without a position is placed automatically in its group).

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
