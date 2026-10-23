import * as THREE from 'three';
import { glowTex, hazeTex, ringTex } from './textures.js';
import { withEdges, edgeGlow } from './polyhedra.js';

// The star above the valley (the Oracle). One clear idea per layer:
//   a dodecahedron of light sealed inside a dark crystal icosahedron, its dual: sized so every corner of the light
//   just touches the centre of a glass face, leaving twenty points of light on the crystal;
//   three thin instrument rings around it, gold, cyan and gold, with fine tick marks;
//   six shards riding those rings, one per main relic and each a different solid (the five Platonic solids and a
//   slender double pyramid), dark until that relic's light returns.
// Each relic opened lights its shard and a slender ray, and the light inside the crystal warms toward gold.
export function createOracle(scene, { y, main, reduceMotion }){
  const C = h => new THREE.Color(h), V3 = THREE.Vector3;
  const group = new THREE.Group(); group.position.set(0, y, 0); scene.add(group);
  const sprite = (map, color, opacity, scale, parent=group) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent:true, opacity, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    s.scale.set(scale, scale, 1); parent.add(s); return s; };

  /* soft light around it: a wide indigo haze and a cyan halo */
  const haze = sprite(hazeTex, 0x3A5A9A, .3, 130), halo = sprite(glowTex, 0x7FD6EE, .5, 17);

  /* the crystal: outer icosahedron and inner dodecahedron turn together so they stay in contact */
  const crystal = new THREE.Group(); group.add(crystal);
  const R = 3.4, IN = R*.7947;
  const lightMat = new THREE.ShaderMaterial({ fog:false, uniforms:{ t:{value:0}, glow:{value:1}, hot:{value:C('#F2FEFF')}, cool:{value:C('#4FC6DD')} },
    vertexShader:'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }',
    fragmentShader:`uniform float t; uniform float glow; uniform vec3 hot; uniform vec3 cool; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = max(dot(vN, vV), 0.);
        float facet = fract(sin(dot(floor(vN*4.), vec3(12.9898,78.233,37.719)))*43758.5453);
        vec3 c = mix(cool, hot, pow(f, .9)*.75 + facet*.3);
        c *= .85 + .15*sin(dot(vN, vec3(2.1,1.3,1.7))*3. - t*1.4);
        gl_FragColor = vec4(c*glow*1.25, 1.); }` });
  crystal.add(new THREE.Mesh(new THREE.DodecahedronGeometry(IN*.985, 0), lightMat));
  const inner = sprite(glowTex, 0xBFF6FF, .55, 9, crystal);
  const glassGeo = withEdges(new THREE.IcosahedronGeometry(R, 0));
  const glassMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, fog:false, uniforms:{ deep:{value:C('#0B1A33')}, sheen:{value:C('#3E86B8')}, k:{value:1} },
    vertexShader:'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader:`uniform vec3 deep; uniform vec3 sheen; uniform float k; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1. - abs(dot(vN, vV)); float facet = fract(sin(dot(floor(vN*4.), vec3(12.9898,78.233,37.719)))*43758.5453);
        vec3 c = mix(deep, sheen, pow(f, 1.5)*.9 + facet*.18);
        gl_FragColor = vec4(c, (.1 + pow(f, 1.2)*.72 + facet*.08)*k); }` });
  crystal.add(new THREE.Mesh(glassGeo, glassMat));
  const edgeMat = edgeGlow({ color:'#D9A85A', lit:.6, fill:0, width:1.5, halo:7, line:.75 }); crystal.add(new THREE.Mesh(glassGeo, edgeMat));
  /* the twenty places where the light touches the glass */
  const kiss = []; { const p = glassGeo.attributes.position; for (let i=0;i<p.count;i+=3){ const c = new V3(); for (let j=0;j<3;j++) c.add(new V3(p.getX(i+j), p.getY(i+j), p.getZ(i+j))); kiss.push(c.divideScalar(3)); } }
  const kissMat = new THREE.PointsMaterial({ map:glowTex, color:0xDFFBFF, size:1.1, transparent:true, opacity:.75, depthWrite:false, blending:THREE.AdditiveBlending, fog:false });
  crystal.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(kiss), kissMat));

  /* three instrument rings with tick marks; each carries two shards */
  const goldMat = new THREE.MeshBasicMaterial({ color:0xC9A86A, transparent:true, opacity:.85, fog:false }), cyanMat = new THREE.MeshBasicMaterial({ color:0x5FC9DE, transparent:true, opacity:.6, fog:false });
  const tickGeo = new THREE.BoxGeometry(.035, .24, .035), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), ZA = new V3(0,0,1);
  const rings = [[5.8,.035,.32,[.5,.2,0],goldMat,72],[7.4,.025,-.22,[1.25,.9,.2],cyanMat,0],[9,.03,.15,[2.05,-.45,.4],goldMat,96]].map(([Rr, th, spd, rot, mat, n]) => {
    const piv = new THREE.Group(); piv.rotation.set(...rot); group.add(piv); const ring = new THREE.Group(); piv.add(ring);
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(Rr, th, 6, 200), mat));
    if (n){ const ticks = new THREE.InstancedMesh(tickGeo, mat, n); for (let k=0;k<n;k++){ const a = k/n*Math.PI*2; M4.compose(new V3(Math.cos(a)*Rr, Math.sin(a)*Rr, 0), Q.setFromAxisAngle(ZA, a - Math.PI/2), new V3(1, k%6 ? 1 : 2.2, 1)); ticks.setMatrixAt(k, M4); } ring.add(ticks); }
    return { ring, Rr, spd }; });

  /* the six shards, riding the rings in pairs */
  const SOLIDS = [s => new THREE.TetrahedronGeometry(s*1.15, 0), s => new THREE.BoxGeometry(s*1.1, s*1.1, s*1.1), s => new THREE.OctahedronGeometry(s, 0), s => new THREE.DodecahedronGeometry(s*.9, 0), s => new THREE.IcosahedronGeometry(s*.95, 0), s => new THREE.OctahedronGeometry(s*.8, 0).scale(.75, 1.6, .75)];
  const slots = main.map((r, i) => {
    const ring = rings[i % 3], geo = withEdges(SOLIDS[i % SOLIDS.length](.62)), col = C(r.color);
    const holder = new THREE.Group(); ring.ring.add(holder); const a0 = (i < 3 ? 0 : Math.PI) + i*.4;
    const mat = new THREE.MeshStandardMaterial({ color:0x2A3552, metalness:.4, roughness:.35, flatShading:true, emissive:col, emissiveIntensity:.14 });
    const body = new THREE.Mesh(geo, mat); holder.add(body);
    const edges = edgeGlow({ color:col.clone().lerp(C('#FFFFFF'), .2), lit:.3, fill:.3, width:1.2, halo:6, line:.8 }); body.add(new THREE.Mesh(geo, edges));
    const glow = sprite(glowTex, col, 0, 3.4, holder);
    /* the ray this relic gives back: a slender view-facing beam drawn in the vertex shader */
    const rayMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
      uniforms:{ ang:{value:Math.PI/2 + i/main.length*Math.PI*2}, len:{value:24}, wid:{value:1.5}, grow:{value:0}, t:{value:0}, seed:{value:i*1.7}, col:{value:col.clone().lerp(C('#FFFFFF'), .35)} },
      vertexShader:`uniform float ang; uniform float len; uniform float wid; varying vec2 vUv;
        void main(){ vUv = uv; vec4 c = modelViewMatrix*vec4(0.,0.,0.,1.); vec2 d = vec2(cos(ang), sin(ang)), n = vec2(-d.y, d.x);
          c.xy += d*(uv.x*len) + n*((uv.y - .5)*wid*mix(1., .15, uv.x)); gl_Position = projectionMatrix*c; }`,
      fragmentShader:`uniform float grow; uniform float t; uniform float seed; uniform vec3 col; varying vec2 vUv;
        void main(){ float x = vUv.x, y = abs(vUv.y - .5)*2.; float core = exp(-y*y*7.);
          float a = core*pow(1. - x, 1.8)*smoothstep(.1,.22,x)*(.82 + .18*sin(t*2.6 + seed*5. + x*14.))*grow*(1. - smoothstep(grow - .08, grow, x))*.75;
          gl_FragColor = vec4(mix(col, vec3(1.), core*core*.5)*a, a); }` });
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rayMat); ray.frustumCulled = false; group.add(ray);
    return { relic:r, ring, holder, body, mat, edges, glow, rayMat, a0, lit:0, target:0 };
  });

  /* a ripple of light whenever the star speaks or a beam arrives */
  const ripples = [];
  function ripple(color, size=46){ const s = sprite(ringTex, C(color), 0, 8); ripples.push({ s, t:0, size }); }

  /* the light point that actually brightens the valley */
  const light = new THREE.PointLight(0x9FE8FF, 1, 160, 1); group.add(light);

  /* beams of light travelling from an opened relic back up into the star */
  const travellers = [];
  function sendLight(from, color, onArrive){
    if (reduceMotion){ onArrive(); return; }
    const head = sprite(glowTex, C(color).lerp(C('#FFFFFF'), .5), 1, 6, scene), tail = [];
    for (let i=0;i<22;i++) tail.push(sprite(glowTex, C(color), .8*(1 - i/22), 4.2*(1 - i/26), scene));
    const p0 = from.clone(), p2 = group.position.clone(), p1 = p0.clone().lerp(p2, .25); p1.y = p0.y + (p2.y - p0.y)*.8;
    travellers.push({ head, tail, p0, p1, p2, t:0, hist:[], onArrive });
  }
  const bez = (o, a, b, c, t) => o.set(0,0,0).addScaledVector(a, (1-t)*(1-t)).addScaledVector(b, 2*(1-t)*t).addScaledVector(c, t*t);

  let flash = 0, finale = 0;
  const hotA = C('#F2FEFF'), hotB = C('#FFF3D8'), coolA = C('#4FC6DD'), coolB = C('#E8B866'), haloA = C('#7FD6EE'), gold = C('#F4D58D');
  function update(dt, T, { power, speak }){
    flash = Math.max(0, flash - dt*.9); finale = Math.min(1, finale + (finale > 0 ? dt*.25 : 0));
    const p = Math.min(1, power + finale*.25), en = Math.max(speak, flash*.6), u = lightMat.uniforms;
    u.t.value = T; u.glow.value = .85 + p*.2 + speak*.15 + flash*.4; u.hot.value.copy(hotA).lerp(hotB, p*.8); u.cool.value.copy(coolA).lerp(coolB, p*.45);
    edgeMat.uniforms.lit.value = .5 + p*.3 + speak*.2; kissMat.opacity = .6 + p*.3 + speak*.2; kissMat.color.copy(u.hot.value);
    inner.material.color.copy(u.hot.value).lerp(u.cool.value, .3); inner.material.opacity = .45 + p*.2 + speak*.15;
    group.position.y = y + Math.sin(T*.5)*.5;
    crystal.rotation.y += dt*.1*(1 + en*1.5); crystal.rotation.x = Math.sin(T*.23)*.3; crystal.rotation.z = Math.cos(T*.17)*.15;
    rings.forEach(r => { r.ring.rotation.z += dt*r.spd*(.35 + en*1.2); });
    goldMat.color.set(0xC9A86A).lerp(gold, p*.5); cyanMat.opacity = .5 + p*.25;
    halo.scale.setScalar((16 + p*6)*(1 + Math.sin(T*1.3)*.03 + speak*.05)); halo.material.opacity = .45 + p*.15 + speak*.12 + flash*.25; halo.material.color.copy(haloA).lerp(gold, p*.5);
    haze.scale.setScalar(120 + p*70); haze.material.opacity = .2 + p*.22; haze.material.color.set(0x3A5A9A).lerp(gold, p*.35);
    slots.forEach(s => { s.lit += (s.target - s.lit)*(1 - Math.exp(-dt*(reduceMotion ? 30 : 1.4)));
      const a = s.a0 + T*.05; s.holder.position.set(Math.cos(a)*s.ring.Rr, Math.sin(a)*s.ring.Rr, 0);
      s.body.rotation.x += dt*(.3 + s.lit*.5); s.body.rotation.y += dt*(.45 + s.lit*.6);
      s.mat.emissiveIntensity = .14 + s.lit*.75 + finale*.15; s.edges.uniforms.lit.value = .3 + s.lit*.6; s.glow.material.opacity = s.lit*.55;
      const ru = s.rayMat.uniforms; ru.grow.value = s.lit; ru.t.value = T; ru.ang.value += dt*.012; ru.len.value = (24 + p*5 + finale*8)*(1 + Math.sin(T*.7 + ru.seed.value)*.05); });
    for (let i = ripples.length-1; i >= 0; i--){ const r = ripples[i]; r.t += dt/1.8; r.s.scale.setScalar(8 + r.size*r.t); r.s.material.opacity = Math.sin(Math.min(1, r.t)*Math.PI)*.8;
      if (r.t >= 1){ group.remove(r.s); r.s.material.dispose(); ripples.splice(i,1); } }
    for (let i = travellers.length-1; i >= 0; i--){ const tr = travellers[i]; tr.t += dt/1.5; const e = Math.min(1, tr.t), k = e*e*(3 - 2*e);
      bez(tr.head.position, tr.p0, tr.p1, tr.p2.copy(group.position), k); tr.hist.unshift(tr.head.position.clone()); if (tr.hist.length > 44) tr.hist.pop();
      tr.tail.forEach((s, j) => { const h = tr.hist[Math.min(tr.hist.length-1, j*2)]; if (h) s.position.copy(h); });
      if (tr.t >= 1){ scene.remove(tr.head); tr.tail.forEach(s => scene.remove(s)); travellers.splice(i,1); tr.onArrive(); } }
  }

  return {
    group, light, update, sendLight, ripple,
    get position(){ return group.position; },
    /* a relic's light has arrived: light its shard, grow its ray and flare */
    receive(r){ const s = slots.find(x => x.relic === r); if (s) s.target = 1; flash = 1; ripple(r.color, 60); },
    speakPulse(){ ripple('#9FE8FF', 34); },
    bloom(){ finale = .001; flash = 1.4; ripple('#F4D58D', 90); },
  };
}
