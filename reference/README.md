# Reference prototypes

Earlier design explorations, kept for reference only. They are not part of the build.

- `fairytale-sky-garden.html`: the first world prototype. Same valley layout (spiral stairs, floating landings, the Oracle overhead), in a bright, sunlit fairytale style with blossom trees and a glowing sky orb. Projects sit on the landings instead of drifting as relics. It was replaced by the darker eclipse direction, but its terrain, lighting and landing code can still be useful.

Each file is standalone: open it directly in a browser. It loads three.js r128 from cdnjs, so it needs an internet connection.

## Selected Oracle concept A

- `oracle-concepts.png`: original concept sheet; **A, the left panel**, is the selected direction.
- `oracle-a.html`: interactive study of the actual production Oracle model, using the local Vite/three.js runtime. Open it through `npm run dev` at `/reference/oracle-a.html`. The reference thumbnail crops the left panel using CSS; the 3D object is built from geometry and procedural materials. Drag to orbit, scroll to zoom, and inspect rest, speaking, restoration, valley distance and reduced motion.

The study imports the same `createOracle` used in the valley and is not a production build entry.
