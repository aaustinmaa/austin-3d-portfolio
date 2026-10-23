import * as THREE from 'three';

// Polyhedra drawn as light: faceted solids whose true edges glow with a soft halo (not the triangle seams inside a
// face). Used by the star's cage and by the relics.

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
