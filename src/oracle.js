import * as THREE from 'three';
import { glowTex, hazeTex, ringTex } from './textures.js';
import { withEdges, edgeGlow } from './polyhedra.js';

// The star above the valley (the Oracle), after the first sky-garden prototype: one flat-faceted icosahedron shaded
// in two tones, a thin octahedral cage turning the other way, three gilded rings strung with beads, and shards on
// slow orbits. Its light is sealed in the six main relics: each one opened sends a beam back, lights that relic's
// shard and a ray in its colour, and the star burns warmer while the valley brightens.
export function createOracle(scene, { y, main, reduceMotion }){
  const C = h => new THREE.Color(h);
  const group = new THREE.Group(); group.position.set(0, y, 0); scene.add(group);
  const sprite = (map, color, opacity, scale, parent=group) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent:true, opacity, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    s.scale.set(scale, scale, 1); parent.add(s); return s; };

  /* soft light behind: a wide haze and a halo */
  const haze = sprite(hazeTex, 0x5A86C8, .3, 130), halo = sprite(glowTex, 0xFFE6B0, .5, 19);

  /* the core: a plain icosahedron; each flat face takes one tone, warm where it faces you and cyan at the rim */
  const coreMat = new THREE.ShaderMaterial({ fog:false,
    uniforms:{ t:{value:0}, glow:{value:.7}, warm:{value:C('#FFF1D2')}, cool:{value:C('#6FD8E6')}, tint:{value:C('#C9B8FF')} },
    vertexShader:'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader:`uniform float t; uniform float glow; uniform vec3 warm; uniform vec3 cool; uniform vec3 tint; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1. - max(dot(vN, vV), 0.), 1.6);
        vec3 c = mix(warm, cool, f);
        c = mix(c, tint, (.5 + .5*sin(vN.y*5. + vN.x*3. + t*1.2))*.22);
        gl_FragColor = vec4(c*glow, 1.); }` });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 0), coreMat); group.add(core);
  const cageMat = edgeGlow({ color:'#FFF4D6', lit:.35, fill:0, width:1.2, halo:4, line:.9 });
  const cage = new THREE.Mesh(withEdges(new THREE.OctahedronGeometry(4.2, 0)), cageMat); group.add(cage);

  /* three gilded rings, each strung with square beads */
  const ringMat = new THREE.MeshBasicMaterial({ color:0xD9B878, fog:false });
  const rings = [[5.6,.08,.9,0],[7.1,.06,-.6,.9],[8.6,.05,.4,1.9]].map(([R, th, spd, tilt], i) => {
    const piv = new THREE.Group(); piv.rotation.set(tilt*.55 + .35, tilt, 0); group.add(piv);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(R, th, 8, 160), ringMat); piv.add(tor);
    const n = (i + 2)*3; for (let k=0;k<n;k++){ const a = k/n*Math.PI*2, b = new THREE.Mesh(new THREE.BoxGeometry(.28,.28,.28), ringMat); b.position.set(Math.cos(a)*R, Math.sin(a)*R, 0); b.rotation.z = a; tor.add(b); }
    return { tor, spd }; });

  /* shards on slow orbits: one per main relic, dark until its light returns, and a few pale ones always lit */
  const shardGeo = new THREE.OctahedronGeometry(.5, 0); shardGeo.scale(.8, 1.3, .8);
  const orbit = (s, T, k=1) => { const a = s.ph + T*s.sp*k; s.mesh.position.set(Math.cos(a)*s.r, Math.sin(a*1.3)*1.6 + Math.sin(a)*s.tilt*s.r*.3, Math.sin(a)*s.r); };
  const slots = main.map((r, i) => {
    const mat = new THREE.MeshStandardMaterial({ color:0x1A2030, metalness:.6, roughness:.3, flatShading:true, emissive:C(r.color), emissiveIntensity:.06 });
    const mesh = new THREE.Mesh(shardGeo, mat); group.add(mesh); const glow = sprite(glowTex, C(r.color), 0, 3.6, mesh);
    /* the ray this relic gives back: a slender view-facing beam drawn in the vertex shader */
    const rayMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
      uniforms:{ ang:{value:Math.PI/2 + i/main.length*Math.PI*2}, len:{value:24}, wid:{value:1.5}, grow:{value:0}, t:{value:0}, seed:{value:i*1.7}, col:{value:C(r.color).lerp(C('#FFFFFF'), .35)} },
      vertexShader:`uniform float ang; uniform float len; uniform float wid; varying vec2 vUv;
        void main(){ vUv = uv; vec4 c = modelViewMatrix*vec4(0.,0.,0.,1.); vec2 d = vec2(cos(ang), sin(ang)), n = vec2(-d.y, d.x);
          c.xy += d*(uv.x*len) + n*((uv.y - .5)*wid*mix(1., .15, uv.x)); gl_Position = projectionMatrix*c; }`,
      fragmentShader:`uniform float grow; uniform float t; uniform float seed; uniform vec3 col; varying vec2 vUv;
        void main(){ float x = vUv.x, y = abs(vUv.y - .5)*2.; float core = exp(-y*y*7.);
          float a = core*pow(1. - x, 1.8)*smoothstep(.08,.2,x)*(.82 + .18*sin(t*2.6 + seed*5. + x*14.))*grow*(1. - smoothstep(grow - .08, grow, x))*.8;
          gl_FragColor = vec4(mix(col, vec3(1.), core*core*.5)*a, a); }` });
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rayMat); ray.frustumCulled = false; group.add(ray);
    return { relic:r, mesh, mat, glow, rayMat, r:10.5 + i*.45, sp:.16 + i*.02, ph:i/main.length*Math.PI*2, tilt:((i*.37) % 1 - .5)*1.2, lit:0, target:0 };
  });
  const motes = [0,1,2,3,4,5].map(i => ({ mesh:new THREE.Mesh(new THREE.OctahedronGeometry(.26, 0), new THREE.MeshBasicMaterial({ color:i%2 ? 0xFFF1CF : 0xA6ECF3, transparent:true, opacity:.75, fog:false })),
    r:12.4 + (i%3)*.6, sp:-.12 - i*.015, ph:i*1.05 + .5, tilt:(i%2 ? .4 : -.3) }));
  motes.forEach(m => group.add(m.mesh));

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
  const warmA = C('#FFF1D2'), warmB = C('#FFE7B8'), coolA = C('#6FD8E6'), coolB = C('#8FE6F0'), gold = C('#F4D58D');
  function update(dt, T, { power, speak }){
    flash = Math.max(0, flash - dt*.9); finale = Math.min(1, finale + (finale > 0 ? dt*.25 : 0));
    const p = Math.min(1, power + finale*.25), en = Math.max(speak, flash*.6), u = coreMat.uniforms;
    u.t.value = T; u.glow.value = .8 + p*.14 + speak*.12 + flash*.35; u.warm.value.copy(warmA).lerp(warmB, p); u.cool.value.copy(coolA).lerp(coolB, p*.5);
    group.position.y = y + Math.sin(T*.6)*.6;
    core.rotation.y += dt*.18*(1 + en*2); core.rotation.x = Math.sin(T*.3)*.25;
    cage.rotation.y -= dt*.25*(1 + en*3); cage.rotation.z += dt*.1; cageMat.uniforms.lit.value = .3 + p*.25 + speak*.25;
    rings.forEach(r => { r.tor.rotation.z += dt*r.spd*.35*(1 + en*3); });
    ringMat.color.set(0xD9B878).lerp(gold, p*.5).multiplyScalar(.9 + p*.2);
    halo.scale.setScalar((17 + p*6)*(1 + Math.sin(T*1.4)*.03 + speak*.05)); halo.material.opacity = .55 + p*.12 + speak*.12 + flash*.25;
    haze.scale.setScalar(120 + p*70); haze.material.opacity = .2 + p*.22; haze.material.color.set(0x5A86C8).lerp(gold, p*.4);
    slots.forEach(s => { s.lit += (s.target - s.lit)*(1 - Math.exp(-dt*(reduceMotion ? 30 : 1.4))); orbit(s, T, 1 + en);
      s.mat.emissiveIntensity = .06 + s.lit*1.6 + finale*.3; s.glow.material.opacity = s.lit*.85; s.mesh.rotation.y += dt*(.6 + s.lit);
      const ru = s.rayMat.uniforms; ru.grow.value = s.lit; ru.t.value = T; ru.ang.value += dt*.012; ru.len.value = (24 + p*5 + finale*8)*(1 + Math.sin(T*.7 + ru.seed.value)*.05); });
    motes.forEach(m => { orbit(m, T, 1 + en); m.mesh.rotation.y += dt*2; });
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
