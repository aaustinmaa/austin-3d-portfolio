import * as THREE from 'three';
import { glowTex, hazeTex, ringTex, rayTex, runeTex } from './textures.js';
import { withEdges, corners, icosidodecahedron, rhombicTriacontahedron, rhombicDodecahedron, cube, glass } from './polyhedra.js';

// The star above the valley (the Oracle): a heart of light inside a rhombic triacontahedron of clear glass, nested in
// six glass shells (octahedron, cube, icosahedron, dodecahedron, icosidodecahedron, rhombic dodecahedron), each
// turning on its own axis. Every solid is convex and every surface is translucent. Its light is sealed in the six main
// relics: each one opened sends a beam back, lights one shell in that relic's colour, grows a ray, and the star burns
// hotter while the valley brightens.
export function createOracle(scene, { y, main, reduceMotion }){
  const C = h => new THREE.Color(h);
  const group = new THREE.Group(); group.position.set(0, y, 0); scene.add(group);
  const sprite = (map, color, opacity, scale, parent=group) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent:true, opacity, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    s.scale.set(scale, scale, 1); parent.add(s); return s; };
  const px = Math.min(devicePixelRatio || 1, 1.75);

  /* soft light around everything: a wide haze, slow ray fans and a corona */
  const haze = sprite(hazeTex, 0x5A86C8, .32, 150);
  const fanA = sprite(rayTex, 0x9FE8FF, .2, 64), fanB = sprite(rayTex, 0xC9B8FF, .14, 50);
  const corona = sprite(glowTex, 0x9FE8FF, .7, 22), bloomS = sprite(glowTex, 0xE8FDFF, .55, 9);

  /* the core: a rhombic triacontahedron of clear glass around a smaller icosahedral heart, both lit from within */
  const core = new THREE.Group(), heart = new THREE.Group(); group.add(core); core.add(heart);
  const coreMat = glass({ color:'#BFF6FF', lit:1.1, edge:.25, halo:10 }), heartMat = glass({ color:'#F2FEFF', lit:1.5, edge:.35, halo:8 });
  core.add(new THREE.Mesh(withEdges(rhombicTriacontahedron(2.8)), coreMat));
  heart.add(new THREE.Mesh(withEdges(new THREE.IcosahedronGeometry(1.25, 0)), heartMat));

  /* six shells, one per main relic: ghostly until that relic's light returns, then lit in its colour */
  const SHAPES = [r => new THREE.OctahedronGeometry(r, 0), cube, r => new THREE.IcosahedronGeometry(r, 0), r => new THREE.DodecahedronGeometry(r, 0), icosidodecahedron, rhombicDodecahedron];
  const RADII = [4.1, 5.1, 6.2, 7.4, 8.7, 10.8], DORMANT = C('#4E6E96');
  const nodeMat = () => new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, uniforms:{ col:{value:C('#BFF6FF')}, lit:{value:.2}, px:{value:px} },
    vertexShader:'uniform float lit; uniform float px; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = (5. + 13.*lit)*px*60./-mv.z; gl_Position = projectionMatrix*mv; }',
    fragmentShader:`uniform vec3 col; uniform float lit; void main(){ vec2 p = gl_PointCoord - .5; float d2 = dot(p,p);
      float a = (exp(-d2*90.) + exp(-d2*16.)*.35 + (exp(-abs(p.x)*60.)*exp(-abs(p.y)*8.) + exp(-abs(p.y)*60.)*exp(-abs(p.x)*8.))*.4*lit)*(.35 + lit*.65);
      gl_FragColor = vec4(mix(col, vec3(1.), exp(-d2*90.))*a, a); }` });
  const slots = main.map((r, i) => {
    const geo = withEdges(SHAPES[i % SHAPES.length](RADII[i % RADII.length])), pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.rotation.set(i*1.3 + .4, i*2.1, i*.7); group.add(pivot); pivot.add(spin);
    const mat = glass({ color:DORMANT, lit:.3, edge:.14, halo:12 }); spin.add(new THREE.Mesh(geo, mat));
    const nm = nodeMat(), nodes = new THREE.Points(new THREE.BufferGeometry().setFromPoints(corners(geo)), nm); spin.add(nodes);
    /* the ray this relic gives back: a view-facing spike drawn in the vertex shader */
    const a = i/main.length*Math.PI*2;
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
    return { relic:r, spin, mat, nm, rayMat, color:C(r.color).lerp(C('#E8F6FF'), .12), spd:(i%2 ? -1 : 1)*(.05 + i*.012), lit:0, target:0, flash:0 };
  });

  /* a slow band of runes on a twelve-sided frame */
  runeTex.repeat.set(4, 1);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(12.8, 12.8, .9, 12, 1, true), new THREE.MeshBasicMaterial({ map:runeTex, color:0x78E6F0, transparent:true, opacity:.14, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
  band.rotation.x = .16; group.add(band);

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
  const hotA = C('#EFFFFF'), hotB = C('#FFF2D2'), rimA = C('#9FEAF5'), rimB = C('#F4D58D'), gold = C('#F4D58D');
  function update(dt, T, { power, speak }){
    flash = Math.max(0, flash - dt*.9); finale = Math.min(1, finale + (finale > 0 ? dt*.25 : 0));
    const p = Math.min(1, power + finale*.25), u = coreMat.uniforms, hu = heartMat.uniforms;
    u.col.value.copy(rimA).lerp(rimB, p*.55); u.lit.value = .8 + p*.15 + speak*.25 + flash*.5;
    hu.col.value.copy(hotA).lerp(hotB, p); hu.lit.value = .95 + p*.2 + speak*.3 + flash*.6;
    group.position.y = y + Math.sin(T*.4)*.5;
    core.rotation.y += dt*.09; core.rotation.x += dt*.031; heart.rotation.y -= dt*.22; heart.rotation.z += dt*.07;
    const pulse = 1 + Math.sin(T*1.3)*.03 + speak*.06 + flash*.12;
    corona.scale.setScalar((18 + p*8)*pulse); corona.material.color.copy(u.col.value).lerp(hotA, .35); corona.material.opacity = .3 + p*.08 + flash*.25;
    bloomS.scale.setScalar((7 + p*1.5)*pulse); bloomS.material.opacity = .26 + p*.03 + speak*.08;
    haze.scale.setScalar(130 + p*90); haze.material.opacity = .22 + p*.28; haze.material.color.set(0x5A86C8).lerp(gold, p*.45);
    fanA.material.rotation += dt*.012; fanB.material.rotation -= dt*.018;
    fanA.scale.setScalar(56 + p*44); fanB.scale.setScalar(44 + p*30); fanA.material.opacity = .12 + p*.3 + speak*.08; fanB.material.opacity = .08 + p*.2;
    band.rotation.y += dt*.03*(1 + speak*3);
    slots.forEach(s => { s.lit += (s.target - s.lit)*(1 - Math.exp(-dt*(reduceMotion ? 30 : 1.2))); s.flash = Math.max(0, s.flash - dt*.7);
      const m = s.mat.uniforms; m.col.value.copy(DORMANT).lerp(s.color, s.lit).lerp(gold, finale*.35); m.lit.value = .3 + s.lit*.4 + speak*.1 + s.flash*.7 + finale*.1;
      s.nm.uniforms.col.value.copy(m.col.value); s.nm.uniforms.lit.value = .2 + s.lit*.6 + s.flash;
      s.spin.rotation.y += dt*s.spd*(1 + speak*2.5 + s.flash*3);
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
    /* a relic's light has arrived: ignite its shell, grow its ray and flare */
    receive(r){ const s = slots.find(x => x.relic === r); if (s){ s.target = 1; s.flash = 1; } flash = 1; ripple(r.color, 60); },
    speakPulse(){ ripple('#9FE8FF', 34); },
    bloom(){ finale = .001; flash = 1.4; slots.forEach(s => s.flash = 1); ripple('#F4D58D', 90); },
  };
}
