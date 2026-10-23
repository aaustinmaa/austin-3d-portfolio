import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

// Polyhedra drawn as light: faceted solids whose true edges glow with a soft halo (not the triangle seams inside a
// face), the clear glass the star is made of, and the convex solids it is built from. Every solid here is convex:
// no corner pokes out and none folds in. Used by the star overhead and by the relics.
const V3 = THREE.Vector3, PHI = (1 + Math.sqrt(5))/2;

/* non-indexed copy with flat normals and an `edge` attribute: a barycentric coordinate per corner, pushed to 1 for
   seams between coplanar triangles so only the polyhedron's real edges light up */
export function withEdges(geo){
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.deleteAttribute('uv'); g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, tris = p.count/3, edges = new Map();
  const key = i => `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
  const ek = (a, b) => { const ka = key(a), kb = key(b); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
  for (let t=0;t<tris;t++) for (let e=0;e<3;e++){ const k = ek(t*3 + (e+1)%3, t*3 + (e+2)%3); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(t); }
  const dotN = (a, b) => n.getX(a*3)*n.getX(b*3) + n.getY(a*3)*n.getY(b*3) + n.getZ(a*3)*n.getZ(b*3);
  const bary = new Float32Array(p.count*3);
  for (let t=0;t<tris;t++){ const mask = [0,1,2].map(e => edges.get(ek(t*3 + (e+1)%3, t*3 + (e+2)%3)).some(o => o !== t && dotN(o, t) > .999) ? 1 : 0);
    for (let v=0;v<3;v++) for (let c=0;c<3;c++) bary[(t*3 + v)*3 + c] = (c === v ? 1 : 0) + mask[c]; }
  g.setAttribute('edge', new THREE.BufferAttribute(bary, 3)); return g;
}

/* the distinct corners of a geometry, for glowing vertex nodes */
export function corners(geo){ const p = geo.attributes.position, seen = new Map();
  for (let i=0;i<p.count;i++){ const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!seen.has(k)) seen.set(k, new V3(p.getX(i), p.getY(i), p.getZ(i))); }
  return [...seen.values()]; }

export function icosidodecahedron(r){ const pts = [], s = r/PHI;
  [[0,0,PHI]].concat([[.5, PHI/2, PHI*PHI/2]]).forEach(([a,b,c]) => {
    for (const sa of a ? [-1,1] : [1]) for (const sb of b ? [-1,1] : [1]) for (const sc of [-1,1]) [[a*sa,b*sb,c*sc],[b*sb,c*sc,a*sa],[c*sc,a*sa,b*sb]].forEach(v => pts.push(new V3(...v).multiplyScalar(s))); });
  return new ConvexGeometry(pts); }
/* the rhombic triacontahedron: thirty identical rhombi, the convex hull of an icosahedron and its dual dodecahedron */
export function rhombicTriacontahedron(r){ const pts = [];
  for (const x of [-1,1]) for (const y of [-1,1]) for (const z of [-1,1]) pts.push(new V3(x, y, z));
  for (const a of [-1,1]) for (const b of [-1,1]) pts.push(new V3(0, a*PHI, b/PHI), new V3(a*PHI, b/PHI, 0), new V3(b/PHI, 0, a*PHI), new V3(0, a, b*PHI), new V3(a, b*PHI, 0), new V3(b*PHI, 0, a));
  return new ConvexGeometry(pts.map(v => v.multiplyScalar(r/Math.sqrt(1 + PHI*PHI)))); }
/* the rhombic dodecahedron: twelve rhombi, the convex hull of a cube and an octahedron */
export function rhombicDodecahedron(r){ const pts = [];
  for (const x of [-1,1]) for (const y of [-1,1]) for (const z of [-1,1]) pts.push(new V3(x, y, z));
  [[2,0,0],[0,2,0],[0,0,2]].forEach(v => pts.push(new V3(...v), new V3(...v).negate()));
  return new ConvexGeometry(pts.map(v => v.multiplyScalar(r/2))); }
export const cube = r => new THREE.BoxGeometry(2*r/Math.sqrt(3), 2*r/Math.sqrt(3), 2*r/Math.sqrt(3));

/* soft glowing edges over a faint glassy fill. lit 0..1 brightens it; additive, so it reads as light, not matter.
   With fog on, distance fades the light rather than tinting it */
export function edgeGlow({ color='#9FE8FF', lit=1, fill=.5, width=1.4, halo=7, line=.9, fog=false } = {}){
  return new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog, extensions:{ derivatives:true },
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { col:{value:new THREE.Color(color)}, lit:{value:lit}, fill:{value:fill}, width:{value:width}, halo:{value:halo}, lineK:{value:line}, t:{value:0} }]),
    vertexShader:`attribute vec3 edge; varying vec3 vE; varying vec3 vN; varying vec3 vV;
      void main(){ vE = edge; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`uniform vec3 col; uniform float lit; uniform float fill; uniform float width; uniform float halo; uniform float lineK; uniform float t; uniform float fogNear; uniform float fogFar; varying vec3 vE; varying vec3 vN; varying vec3 vV;
      void main(){ float d = min(min(vE.x, vE.y), vE.z), w = max(fwidth(d), 1e-4);
        float line = 1. - smoothstep(w*width*.5, w*width*1.5, d), glow = exp(-d/(w*halo));
        float f = abs(dot(normalize(vN), normalize(vV))), face = (pow(1. - f, 2.)*.7 + .12)*fill;
        float a = (line*lineK + glow*.55 + face*.35)*lit;
        #ifdef USE_FOG
          a *= 1. - smoothstep(fogNear, fogFar, length(vV))*.6;
        #endif
        gl_FragColor = vec4(mix(col, vec3(1.), line*.18)*a, a); }` });
}

/* clear, bright glass: nearly invisible where a face looks straight at you, tinted toward its rims, with soft edges
   and glints that slide across the facets as the solid turns. Additive, so it is light.
   body scales the glass itself; wire adds a fine, crisp line along the true edges, for solids drawn as line work */
export function glass({ color='#9FE8FF', lit=1, edge=.45, halo=9, body=1, wire=0, fog=false } = {}){
  return new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog, extensions:{ derivatives:true },
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { col:{value:new THREE.Color(color)}, lit:{value:lit}, edgeK:{value:edge}, halo:{value:halo}, body:{value:body}, wire:{value:wire} }]),
    vertexShader:`attribute vec3 edge; varying vec3 vE; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){ vE = edge; vO = normal; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`uniform vec3 col; uniform float lit; uniform float edgeK; uniform float halo; uniform float body; uniform float wire; uniform float fogNear; uniform float fogFar; varying vec3 vE; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){ vec3 n = normalize(vN) * (gl_FrontFacing ? 1. : -1.), v = normalize(vV);
        float f = abs(dot(n, v)), rim = pow(1. - f, 2.2);
        vec3 r = reflect(-v, n);
        float glint = pow(max(dot(r, normalize(vec3(-.35,.75,.55))), 0.), 30.) + pow(max(dot(r, normalize(vec3(.6,-.25,.75))), 0.), 70.)*.6;
        float facet = fract(sin(dot(floor(vO*7. + .5), vec3(12.9898,78.233,37.719)))*43758.5453);
        float d = min(min(vE.x, vE.y), vE.z), w = max(fwidth(d), 1e-4), soft = exp(-d/(w*halo)), fine = 1. - smoothstep(w*.5, w*1.4, d);
        float a = ((.07 + rim*.62 + facet*.07 + glint*.85)*body + soft*edgeK + fine*wire)*lit;
        #ifdef USE_FOG
          a *= 1. - smoothstep(fogNear, fogFar, length(vV))*.6;
        #endif
        gl_FragColor = vec4(mix(col, vec3(1.), glint*.8*body + soft*.15 + fine*wire*.3)*a, a); }` });
}
