import * as THREE from 'three';
import { glowTex, hazeTex, ringTex, rayTex, runeTex, sigilTex } from './textures.js';

// The star above the valley (the Oracle). Its light is sealed in the six main relics: each one opened sends a beam
// back up, the star grows a ray in that relic's colour, burns hotter, and the valley brightens.
const NOISE = `
  float h3(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
    return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x), f.y), mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x), f.y), f.z); }
  float fb(vec3 p){ float a = .5, s = 0.; for (int i=0;i<4;i++){ s += a*n3(p); p = p*2.03 + 1.7; a *= .5; } return s; }`;

export function createOracle(scene, { y, main, reduceMotion }){
  const V3 = THREE.Vector3, C = h => new THREE.Color(h);
  const group = new THREE.Group(); group.position.set(0, y, 0); scene.add(group);
  const spin = new THREE.Group(); group.add(spin);
  const sprite = (map, color, opacity, scale, parent=group) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent:true, opacity, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    s.scale.set(scale, scale, 1); parent.add(s); return s; };

  /* far haze and slow ray fans behind everything */
  const haze = sprite(hazeTex, 0x5A86C8, .32, 150);
  const fanA = sprite(rayTex, 0x9FE8FF, .2, 64), fanB = sprite(rayTex, 0xC9B8FF, .14, 50);
  const sigil = sprite(sigilTex, 0x78E6F0, .16, 30);
  const corona = sprite(glowTex, 0x9FE8FF, .8, 26);

  /* the core: a molten, slowly turning light with an iris that always faces the viewer */
  const coreMat = new THREE.ShaderMaterial({ fog:false,
    uniforms:{ t:{value:0}, power:{value:0}, speak:{value:0}, flash:{value:0}, hot:{value:C('#EFFFFF')}, deep:{value:C('#123B6B')}, rim:{value:C('#7FE9F2')} },
    vertexShader:'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; vP = position; gl_Position = projectionMatrix*mv; }',
    fragmentShader:`uniform float t; uniform float power; uniform float speak; uniform float flash; uniform vec3 hot; uniform vec3 deep; uniform vec3 rim;
      varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
      void main(){ vec3 n = normalize(vN), v = normalize(vV); float f = clamp(dot(n,v), 0., 1.); vec3 q = vP/3.;
        float flow = fb(q*2.2 + vec3(0., -t*.18, t*.11));
        float veins = pow(1. - abs(fb(q*3.4 + flow*1.4 - vec3(t*.07))*2. - 1.), 7.);
        float r = length(n.xy), ang = atan(n.y, n.x);
        float iris = pow(.5 + .5*sin(ang*36. + flow*9.), 3.)*smoothstep(.12,.3,r)*(1. - smoothstep(.42,.8,r));
        vec3 c = mix(deep, rim, smoothstep(0.,.8,f)*.75 + flow*.3);
        c = mix(c, hot, pow(f, 3.2)*(.5 + power*.4));
        c += rim*veins*(.55 + power*.6 + speak*.7);
        c += hot*iris*(.12 + speak*.4 + power*.1);
        c += hot*(1. - smoothstep(0., .24, r))*(.45 + power*.6 + speak*.5);
        c += rim*pow(1. - f, 2.4)*1.2;
        gl_FragColor = vec4(c*(.62 + power*.6 + speak*.25 + flash*.8), 1.); }` });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 5), coreMat); group.add(core);

  /* an atmosphere shell: a soft limb of light around the core */
  const shellMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, uniforms:{ col:{value:C('#7FE9F2')}, k:{value:.8} },
    vertexShader:'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
    fragmentShader:'uniform vec3 col; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f = clamp(dot(normalize(vN), normalize(vV)), 0., 1.); float a = pow(1. - f, 2.2)*smoothstep(0., .25, f)*k; gl_FragColor = vec4(col*a, a); }' });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(4.1, 48, 32), shellMat));

  /* a faint lattice and three gilded rings with ticks, turning at different speeds */
  const lattice = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(5.4, 1)), new THREE.LineBasicMaterial({ color:0x78E6F0, transparent:true, opacity:.14, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
  spin.add(lattice);
  const goldMat = new THREE.MeshBasicMaterial({ color:0xC9A86A, transparent:true, opacity:.75, fog:false });
  const tickGeo = new THREE.BoxGeometry(.09, .55, .09), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion();
  const rings = [[7.2,.07,.32,[.5,.2]],[8.6,.05,-.22,[1.25,.9]],[10.2,.045,.15,[2.1,-.4]]].map(([R,th,spd,[tx,ty]], i) => {
    const piv = new THREE.Group(); piv.rotation.set(tx, ty, 0); group.add(piv);
    const ring = new THREE.Group(); piv.add(ring); ring.add(new THREE.Mesh(new THREE.TorusGeometry(R, th, 6, 200), goldMat));
    const n = [36, 24, 60][i], ticks = new THREE.InstancedMesh(tickGeo, goldMat, n);
    for (let k=0;k<n;k++){ const a = k/n*Math.PI*2, big = k % 3 === 0 ? 1.6 : 1; M4.compose(new V3(Math.cos(a)*R, Math.sin(a)*R, 0), Q.setFromAxisAngle(new V3(0,0,1), a - Math.PI/2), new V3(1, big, 1)); ticks.setMatrixAt(k, M4); }
    ring.add(ticks); return { ring, spd }; });
  runeTex.repeat.set(5, 1);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(12.4, 12.4, .9, 120, 1, true), new THREE.MeshBasicMaterial({ map:runeTex, color:0x78E6F0, transparent:true, opacity:.32, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
  band.rotation.x = .16; group.add(band);

  /* six crystal shards, one per main relic: dark until that relic's light returns */
  const shardGeo = new THREE.OctahedronGeometry(.62, 0); shardGeo.scale(.6, 1.6, .6);
  const orbit = new THREE.Group(); orbit.rotation.set(.32, 0, .12); group.add(orbit);
  const slots = main.map((r, i) => {
    const mat = new THREE.MeshStandardMaterial({ color:0x1A2030, metalness:.6, roughness:.3, flatShading:true, emissive:C(r.color), emissiveIntensity:.04 });
    const shard = new THREE.Mesh(shardGeo, mat), a = i/main.length*Math.PI*2; shard.position.set(Math.cos(a)*14.5, 0, Math.sin(a)*14.5); orbit.add(shard);
    const glow = sprite(glowTex, C(r.color), 0, 4.2, shard);
    /* the ray this relic gives back: a view-facing spike drawn in the vertex shader */
    const rayMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
      uniforms:{ ang:{value:Math.PI/2 + a}, len:{value:30}, wid:{value:2.2}, grow:{value:0}, t:{value:0}, seed:{value:i*1.7}, col:{value:C(r.color).lerp(C('#FFFFFF'), .35)} },
      vertexShader:`uniform float ang; uniform float len; uniform float wid; varying vec2 vUv;
        void main(){ vUv = uv; vec4 c = modelViewMatrix*vec4(0.,0.,0.,1.); vec2 d = vec2(cos(ang), sin(ang)), n = vec2(-d.y, d.x);
          c.xy += d*(uv.x*len) + n*((uv.y - .5)*wid*mix(1., .15, uv.x)); gl_Position = projectionMatrix*c; }`,
      fragmentShader:`uniform float grow; uniform float t; uniform float seed; uniform vec3 col; varying vec2 vUv;
        void main(){ float x = vUv.x, y = abs(vUv.y - .5)*2.; float core = exp(-y*y*7.);
          float a = core*pow(1. - x, 1.5)*smoothstep(0.,.05,x)*(.82 + .18*sin(t*2.6 + seed*5. + x*14.))*grow*(1. - smoothstep(grow - .08, grow, x));
          gl_FragColor = vec4(mix(col, vec3(1.), core*core*.6)*a, a); }` });
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rayMat); ray.frustumCulled = false; group.add(ray);
    return { relic:r, shard, mat, glow, rayMat, lit:0, target:0 };
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
  const hotA = C('#EFFFFF'), hotB = C('#FFF2D2'), rimA = C('#7FE9F2'), rimB = C('#F4D58D'), deepA = C('#123B6B'), deepB = C('#3A3570');
  function update(dt, T, { power, speak }){
    flash = Math.max(0, flash - dt*.9); finale = Math.min(1, finale + (finale > 0 ? dt*.25 : 0));
    const p = Math.min(1, power + finale*.25), u = coreMat.uniforms;
    u.t.value = T; u.power.value = p; u.speak.value = speak; u.flash.value = flash;
    u.hot.value.copy(hotA).lerp(hotB, p); u.rim.value.copy(rimA).lerp(rimB, p*.55); u.deep.value.copy(deepA).lerp(deepB, p*.6);
    shellMat.uniforms.col.value.copy(u.rim.value); shellMat.uniforms.k.value = .7 + p*.5 + speak*.4 + flash;
    group.position.y = y + Math.sin(T*.4)*.5;
    core.rotation.y += dt*.05; spin.rotation.y += dt*.03; spin.rotation.x += dt*.011;
    const pulse = 1 + Math.sin(T*1.3)*.03 + speak*.06 + flash*.12;
    corona.scale.setScalar((24 + p*16)*pulse); corona.material.color.copy(u.rim.value).lerp(hotA, .35); corona.material.opacity = .62 + p*.3 + flash*.3;
    haze.scale.setScalar(130 + p*90); haze.material.opacity = .22 + p*.28; haze.material.color.set(0x5A86C8).lerp(C('#C7A774'), p*.5);
    fanA.material.rotation += dt*.012; fanB.material.rotation -= dt*.018;
    fanA.scale.setScalar(56 + p*44); fanB.scale.setScalar(44 + p*30); fanA.material.opacity = .14 + p*.42 + speak*.08; fanB.material.opacity = .1 + p*.3;
    sigil.material.rotation -= dt*.02; sigil.material.opacity = .1 + speak*.18 + p*.08;
    lattice.material.opacity = .1 + p*.18 + speak*.12;
    rings.forEach(r => { r.ring.rotation.z += dt*r.spd*(.25 + speak*.8 + p*.2); });
    band.rotation.y += dt*.03*(1 + speak*3); orbit.rotation.y += dt*.045;
    slots.forEach(s => { s.lit += (s.target - s.lit)*(1 - Math.exp(-dt*(reduceMotion ? 30 : 1.4)));
      s.mat.emissiveIntensity = .04 + s.lit*1.6; s.glow.material.opacity = s.lit*.85; s.shard.rotation.y += dt*(.4 + s.lit*.8);
      const ru = s.rayMat.uniforms; ru.grow.value = s.lit; ru.t.value = T; ru.ang.value += dt*.012; ru.len.value = (30 + p*8 + finale*14)*(1 + Math.sin(T*.7 + ru.seed.value)*.05); });
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
    /* a relic's light has arrived: grow its ray, light its shard and flare */
    receive(r){ const s = slots.find(x => x.relic === r); if (s) s.target = 1; flash = 1; ripple(r.color, 60); },
    speakPulse(){ ripple('#9FE8FF', 34); },
    bloom(){ finale = .001; flash = 1.4; ripple('#F4D58D', 90); },
  };
}
