import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

// Polyhedra drawn as light: faceted solids whose true edges glow with a soft halo (not the triangle seams inside a
// face), plus the shapes the star is built from. Used by the star overhead and by the relics.
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

/* raise a pyramid on every face (faces found by grouping coplanar triangles): a dodecahedron becomes a twelve-point star */
export function kleetope(geo, apexR){
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.computeVertexNormals(); const p = g.attributes.position, n = g.attributes.normal, faces = new Map();
  for (let i=0;i<p.count;i+=3){ const k = `${n.getX(i).toFixed(2)},${n.getY(i).toFixed(2)},${n.getZ(i).toFixed(2)}`; if (!faces.has(k)) faces.set(k, { n:new V3(n.getX(i), n.getY(i), n.getZ(i)), pts:[] });
    for (let j=0;j<3;j++) faces.get(k).pts.push(new V3(p.getX(i+j), p.getY(i+j), p.getZ(i+j))); }
  const out = [];
  faces.forEach(f => { const ring = corners(new THREE.BufferGeometry().setFromPoints(f.pts)), c = ring.reduce((a, v) => a.add(v), new V3()).divideScalar(ring.length), apex = f.n.clone().multiplyScalar(apexR);
    const u = ring[0].clone().sub(c).normalize(), w = f.n.clone().cross(u); ring.sort((a, b) => Math.atan2(a.clone().sub(c).dot(w), a.clone().sub(c).dot(u)) - Math.atan2(b.clone().sub(c).dot(w), b.clone().sub(c).dot(u)));
    ring.forEach((a, i) => { const b = ring[(i+1) % ring.length]; out.push(a, b, apex); }); });
  return new THREE.BufferGeometry().setFromPoints(out);
}

export function icosidodecahedron(r){ const pts = [], s = r/PHI;
  [[0,0,PHI]].concat([[.5, PHI/2, PHI*PHI/2]]).forEach(([a,b,c]) => {
    for (const sa of a ? [-1,1] : [1]) for (const sb of b ? [-1,1] : [1]) for (const sc of [-1,1]) [[a*sa,b*sb,c*sc],[b*sb,c*sc,a*sa],[c*sc,a*sa,b*sb]].forEach(v => pts.push(new V3(...v).multiplyScalar(s))); });
  return new ConvexGeometry(pts); }
export function stellaOctangula(r){ const a = new THREE.TetrahedronGeometry(r), b = new THREE.TetrahedronGeometry(r).rotateZ(Math.PI/2);
  const pa = a.attributes.position.array, pb = b.attributes.position.array, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from([...pa, ...pb]), 3)); return g; }
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
