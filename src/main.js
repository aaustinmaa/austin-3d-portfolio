import * as THREE from 'three';
import './styles.css';
import { rand, hash, vnoise, fbm, sstep, lerp, ease, C, mixHex, randUnit } from './noise.js';
import { radialTex, glowTex, softTex, coronaTex, runeTex, eyeTex } from './textures.js';
import { ABOUT, RELICS, INTENTS, FALLBACK } from './content.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const V3 = THREE.Vector3, UP = new V3(0,1,0), ZAX = new V3(0,0,1);

/* ---------- world constants ---------- */
const LAKE_R = 7.5, LAKE_BLOCK = 9.6, WORLD_R = 29.5, WATER_Y = -.55, ORACLE_Y = 52;
const SP = { R:12.5, rise:.42, ang:.2, a0:.25, N:78, base:.5 };
const BRAZIER_AT = [16, 36, 56, 76];
function groundH(x,z){ const r = Math.hypot(x,z); let h = (fbm(x*.07+3.1, z*.07+7.3) - .5) * 1.7;
  if (r < LAKE_R+3.2) h -= sstep(0,1,(LAKE_R+3.2-r)/3.2) * 2.6;
  if (r > 26) h += Math.min(Math.pow((r-26)/10,2)*6, 34); return h; }
function spiralPt(i){ const a = SP.a0 + i*SP.ang; return { x:Math.sin(a)*SP.R, z:Math.cos(a)*SP.R, y:SP.base + i*SP.rise, a }; }

const byId = Object.fromEntries(RELICS.map(r => [r.id, r]));
const MAIN = RELICS.filter(r => !r.secret);

/* ---------- renderer ---------- */
const canvas = document.getElementById('world');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' }); }
catch(e){ document.body.insertAdjacentHTML('beforeend','<div class="fallback">This browser could not start WebGL. Use the links above for the résumé, GitHub and LinkedIn.</div>'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0E1426, 26, 150);
const camera = new THREE.PerspectiveCamera(60, 1, .08, 900);
let baseFov = 60;
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w,h,false); camera.aspect = w/h; baseFov = w < h ? 72 : 60; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

/* ---------- night sky ---------- */
const skyGroup = new THREE.Group(); scene.add(skyGroup);
skyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(600,48,24), new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false,
  vertexShader:'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader:`varying vec3 vD;
    float h3(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
      return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x), f.y), mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x), f.y), f.z); }
    float fb(vec3 p){ float a=.5, t=0.; for (int i=0;i<5;i++){ t += a*n3(p); p *= 2.03; a *= .5; } return t; }
    void main(){ vec3 d = normalize(vD); float h = d.y;
      vec3 zen = vec3(.015,.022,.06), mid = vec3(.035,.05,.12), hor = vec3(.075,.085,.17);
      vec3 c = h > 0. ? mix(hor, mid, smoothstep(0.,.28,h)) : mix(hor, vec3(.02,.025,.05), smoothstep(0.,-.3,h));
      c = mix(c, zen, smoothstep(.3,1.,h));
      float n = fb(d*2.6 + 4.);
      c += vec3(.16,.12,.34)*pow(n,3.2)*1.4*smoothstep(-.05,.6,h);
      c += vec3(.04,.22,.26)*pow(max(fb(d*4.4 - 9.) - .5, 0.), 1.4)*1.6*smoothstep(.1,.8,h);
      gl_FragColor = vec4(c,1.); }` })));
{ const N = 2600, g = new THREE.BufferGeometry(), p = new Float32Array(N*3), c = new Float32Array(N*3);
  for (let i=0;i<N;i++){ const v = randUnit(); v.y = Math.abs(v.y)*.95 + .03; v.normalize().multiplyScalar(520); p.set([v.x,v.y,v.z], i*3); const b = .35+rand()*.65, tint = rand(); c.set([b*(tint<.2?.8:1), b*(tint<.2?.9:1), b], i*3); }
  g.setAttribute('position', new THREE.BufferAttribute(p,3)); g.setAttribute('color', new THREE.BufferAttribute(c,3));
  skyGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ size:2.2, map:softTex, vertexColors:true, transparent:true, depthWrite:false, fog:false }))); }

/* ---------- light ---------- */
scene.add(new THREE.HemisphereLight(0x3A4878, 0x0A0E16, .62));
const moon = new THREE.DirectionalLight(0x9DB4FF, .42); moon.position.set(-60,100,40);
moon.castShadow = true; moon.shadow.mapSize.set(2048,2048); Object.assign(moon.shadow.camera, { left:-50, right:50, top:50, bottom:-50, near:20, far:300 });
moon.shadow.bias = -.0005; moon.shadow.normalBias = .04; scene.add(moon, moon.target);
const eclipseLight = new THREE.PointLight(0x9FE8FF, .8, 150, 1); eclipseLight.position.set(0, ORACLE_Y, 0); scene.add(eclipseLight);
const relicLight = new THREE.PointLight(0xffffff, 0, 11, 2); scene.add(relicLight);

/* ---------- helpers ---------- */
const tmpC = new THREE.Color();
function rockify(geo, amp, sd, colorAt, yAmp=.6){
  geo.computeBoundingBox(); const bb = geo.boundingBox, p = geo.attributes.position, col = new Float32Array(p.count*3);
  for (let i=0;i<p.count;i++){
    let x=p.getX(i), y=p.getY(i), z=p.getZ(i); const r=Math.hypot(x,z);
    if (r > .001){ const ux=x/r, uz=z/r; const k = 1 + (fbm(ux*1.5+sd+y*.11, uz*1.5-sd+y*.23)-.5)*amp; x*=k; z*=k; }
    y += (fbm(x*.3+sd, z*.3-sd)-.5)*amp*yAmp; p.setXYZ(i,x,y,z);
    colorAt(Math.min(1,Math.max(0,(y-bb.min.y)/((bb.max.y-bb.min.y)||1))), tmpC, fbm(x*.6+sd, y*.6-sd), y);
    col[i*3]=tmpC.r; col[i*3+1]=tmpC.g; col[i*3+2]=tmpC.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col,3)); geo.computeVertexNormals(); return geo;
}
const rockMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, metalness:0, flatShading:true });
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion();
function inst(geo, mat, items, opts={}){ if (!items.length) return null; const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it,i) => { M4.compose(it.p, it.q || Q.identity(), it.s || new V3(1,1,1)); m.setMatrixAt(i, M4); if (it.c) m.setColorAt(i, it.c); });
  m.frustumCulled = false; m.castShadow = !!opts.cast; m.receiveShadow = !!opts.receive; scene.add(m); return m; }
const pines = [], spirits = [], glowPlants = [], tufts = [];
const pickables = [];

/* ---------- ground ---------- */
{
  const g = new THREE.PlaneGeometry(130,130,150,150); g.rotateX(-Math.PI/2);
  const p = g.attributes.position, col = new Float32Array(p.count*3);
  for (let i=0;i<p.count;i++){ const x=p.getX(i), z=p.getZ(i), h=groundH(x,z); p.setY(i,h); const r=Math.hypot(x,z); const n = fbm(x*.18+11, z*.18-4);
    if (h < WATER_Y + .35) tmpC.set('#2B3140');
    else if (r > 29) tmpC.copy(mixHex('#1E2A2C','#262B3A', sstep(29,40,r)));
    else tmpC.copy(mixHex('#17262A','#24382F', n)).lerp(C('#2E3446'), sstep(LAKE_R+2.6, LAKE_R+1.4, r)*.8);
    col.set([tmpC.r,tmpC.g,tmpC.b], i*3); }
  g.setAttribute('color', new THREE.BufferAttribute(col,3)); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, flatShading:true })); ground.receiveShadow = true; scene.add(ground); pickables.push(ground);
  for (let i=0;i<2400;i++){ const a=rand()*6.283, d=LAKE_BLOCK+.4+rand()*(WORLD_R-LAKE_BLOCK); const x=Math.cos(a)*d, z=Math.sin(a)*d; tufts.push([x, groundH(x,z), z]); }
  for (let i=0;i<520;i++){ const a=rand()*6.283, d=LAKE_BLOCK+.5+rand()*(WORLD_R-LAKE_BLOCK); const x=Math.cos(a)*d, z=Math.sin(a)*d; glowPlants.push([x, groundH(x,z), z]); }
  for (let i=0;i<70;i++){ const a=rand()*6.283, d=15+rand()*14; const x=Math.cos(a)*d, z=Math.sin(a)*d;
    if ((z > 13 && Math.abs(x) < 8) || Math.hypot(x+3.5, z-18.5) < 3.5) continue; (rand() < .14 ? spirits : pines).push({ x, y:groundH(x,z)-.1, z, s:.9+rand()*.8 }); }
}

/* ---------- lake ---------- */
const lakeMat = new THREE.ShaderMaterial({ transparent:true, uniforms:{ t:{value:0}, energy:{value:0} },
  vertexShader:'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader:`uniform float t; uniform float energy; varying vec3 vW;
    void main(){ float r = length(vW.xz);
      vec3 c = mix(vec3(.02,.04,.07), vec3(.05,.10,.14), smoothstep(${(LAKE_R-3).toFixed(1)}, ${(LAKE_R+2).toFixed(1)}, r));
      float ring = exp(-pow(r-2.6,2.)*3.)*(.35+energy*.5); c += vec3(.55,.92,1.)*ring*.5;
      c += vec3(.4,.85,1.)*exp(-r*r/2.)*(.25+energy*.4);
      float rip = pow(.5+.5*sin(r*2.4 - t*1.2), 16.); c += vec3(.4,.7,1.)*rip*.06*(1.-smoothstep(3.,9.,r));
      float sp = step(.988, fract(sin(dot(floor(vW.xz*3.), vec2(12.9898,78.233)))*43758.5453 + t*.12)); c += sp*vec3(.5,.8,1.)*.35;
      gl_FragColor = vec4(c,.95); }` });
{ const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE_R+3.4, 72), lakeMat); lake.rotation.x = -Math.PI/2; lake.position.y = WATER_Y; scene.add(lake); }

/* ---------- basalt walls ---------- */
const cliffCol = (t,c,n,y) => {
  if (t > .985) { c.copy(mixHex('#1E2F2B','#26392F',n)); return; }
  c.copy(mixHex('#1B2030','#272C40', sstep(0,.6,t))).lerp(C('#343A52'), Math.max(0,(n-.5)*.6 + .12*Math.sin(y*1.15)));
};
const cliffs = [], veins = [];
function addCliff(a, R, rb, rt, h, top=true){
  const g = new THREE.CylinderGeometry(rt, rb, h, 11, 14, false); g.translate(0,h/2,0); rockify(g, .34, a*3.7+R, cliffCol, 0);
  const m = new THREE.Mesh(g, rockMat); const x=Math.sin(a)*R, z=Math.cos(a)*R, by=groundH(x*.82,z*.82)-2;
  m.position.set(x,by,z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  if (top){ const n = 2 + Math.floor(rand()*3); for (let i=0;i<n;i++){ const aa=rand()*6.283, d=rand()*rt*.55; pines.push({ x:x+Math.cos(aa)*d, y:by+h-.15, z:z+Math.sin(aa)*d, s:1.1+rand()*.9 }); }
    for (let i=0;i<6;i++){ const yy = by + h*(.15+rand()*.75), rr = lerp(rb, rt, (yy-by)/h)*.92; const aa = a + Math.PI + (rand()-.5)*1.2;
      veins.push({ p:new V3(x+Math.sin(aa)*rr, yy, z+Math.cos(aa)*rr), q:new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(),rand()*6,rand())), s:new V3(.25,.7+rand()*.8,.25), c:C(rand()<.7?'#5FD9E6':'#8C7BFF') }); } }
  cliffs.push({a,R,rb,rt,h,by}); return m;
}
for (let i=0;i<28;i++){ const a = i/28*Math.PI*2 + (rand()-.5)*.12; const rb = 8+rand()*3; addCliff(a, 51+rand()*4, rb, rb*(.42+rand()*.22), 34+rand()*50); }
for (let i=0;i<18;i++){ const a = (i+.5)/18*Math.PI*2 + (rand()-.5)*.2; const rb = 11+rand()*4; addCliff(a, 74+rand()*10, rb, rb*(.4+rand()*.2), 56+rand()*50, false); }

/* moonlit falls */
const fallMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:{ t:{value:0} },
  vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader:`uniform float t; varying vec2 vUv;
    void main(){ float x = vUv.x; float edge = smoothstep(0.,.22,x)*smoothstep(1.,.78,x); float n = fract(sin(floor(x*26.)*91.7)*437.1);
      float s = .5+.5*sin(vUv.y*(14.+n*10.) + t*(3.+n*3.) + n*30.); float a = edge*(.35+.35*s)*smoothstep(0.,.06,vUv.y)*smoothstep(1.,.97,vUv.y);
      gl_FragColor = vec4(mix(vec3(.45,.62,.85), vec3(.85,.95,1.), s), a*.7); }` });
[2, 11, 20].forEach(ci => { const c = cliffs[ci]; const dir = new V3(Math.sin(c.a),0,Math.cos(c.a)), tan = new V3(Math.cos(c.a),0,-Math.sin(c.a));
  const topY = c.by + c.h*.92, topR = c.R - lerp(c.rb,c.rt,.92) - 1.9, botR = c.R - c.rb*.86 - 2.2, w = 2.6; const bx = dir.x*botR, bz = dir.z*botR, botY = groundH(bx,bz) - .3;
  const pts = [ dir.clone().multiplyScalar(botR).addScaledVector(tan,-w/2).setY(botY), dir.clone().multiplyScalar(botR).addScaledVector(tan,w/2).setY(botY),
    dir.clone().multiplyScalar(topR).addScaledVector(tan,-w*.4).setY(topY), dir.clone().multiplyScalar(topR).addScaledVector(tan,w*.4).setY(topY) ];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(v=>[v.x,v.y,v.z]),3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2)); g.setIndex([0,1,2,2,1,3]); scene.add(new THREE.Mesh(g, fallMat)); });

/* ruined pillars */
{
  const stoneMat = new THREE.MeshStandardMaterial({ color:0x3A4054, roughness:.95, flatShading:true });
  const runeRingMat = new THREE.MeshBasicMaterial({ color:0x78E6F0, transparent:true, opacity:.55 });
  for (let i=0;i<14;i++){
    const a = i/14*Math.PI*2 + .12, r = 23 + (i%2)*2.5, x = Math.sin(a)*r, z = Math.cos(a)*r; if (z > 15 && Math.abs(x) < 6) continue;
    const broken = rand() < .45, h = broken ? 2 + rand()*3 : 6 + rand()*3;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.55,.7,h,8).translate(0,h/2,0), stoneMat); p.position.set(x, groundH(x,z)-.2, z);
    if (broken) p.rotation.set((rand()-.5)*.25, rand(), (rand()-.5)*.25); p.castShadow = p.receiveShadow = true; scene.add(p);
    if (!broken){ const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7,.4,1.7), stoneMat); cap.position.y = h+.2; p.add(cap);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,.12,24,1,true), runeRingMat); band.position.y = h*.62; p.add(band); }
  }
}

/* ---------- spiral stair, landings, braziers ---------- */
const surfaces = [], pathLights = [];
const islandUnder = (t,c,n) => c.copy(mixHex('#151A28','#2A3044', sstep(0,1,t))).offsetHSL(0,0,(n-.5)*.05);
function makeIsland(cx, top, cz, r){
  const grp = new THREE.Group(); grp.position.set(cx, top, cz);
  const topM = new THREE.Mesh(new THREE.CylinderGeometry(r, r*.95, .55, 20).translate(0,-.275,0), new THREE.MeshStandardMaterial({ color:0x323848, roughness:1, flatShading:true }));
  const under = new THREE.Mesh(rockify(new THREE.ConeGeometry(r*.95, r*1.9, 11, 4).rotateX(Math.PI).translate(0,-.55-r*.95,0), .32, cx+cz, islandUnder, .35), rockMat);
  [topM, under].forEach(o => { o.castShadow = o.receiveShadow = true; grp.add(o); }); scene.add(grp); return { grp, topM };
}
const braziers = [];
{
  const n = SP.N+1; const topG = new THREE.CylinderGeometry(1.45,1.32,.42,9); topG.translate(0,-.21,0);
  const botG = rockify(new THREE.ConeGeometry(1.3,1.6,8,2).rotateX(Math.PI).translate(0,-1.2,0), .3, 2.2, (t,c,nn)=>c.copy(mixHex('#141826','#2A3044',t)).offsetHSL(0,0,(nn-.5)*.05));
  const stoneTop = new THREE.InstancedMesh(topG, new THREE.MeshStandardMaterial({ roughness:.95, flatShading:true }), n), stoneBot = new THREE.InstancedMesh(botG, rockMat, n);
  let k = 0;
  for (let i=0;i<=SP.N;i++){ if (BRAZIER_AT.includes(i)) continue; const p = spiralPt(i);
    M4.compose(new V3(p.x,p.y,p.z), Q.setFromAxisAngle(UP, rand()*6.28), new V3(1,1,1)); stoneTop.setMatrixAt(k,M4); stoneBot.setMatrixAt(k,M4);
    stoneTop.setColorAt(k, mixHex('#3D4458','#4A5168', rand())); k++; surfaces.push({ x:p.x, z:p.z, r:1.45, top:p.y });
    if (i % 4 === 2) pathLights.push(p); }
  stoneTop.count = stoneBot.count = k;
  [stoneTop, stoneBot].forEach(o => { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; scene.add(o); }); pickables.push(stoneTop);
  const plG = new THREE.BufferGeometry(); plG.setAttribute('position', new THREE.Float32BufferAttribute(pathLights.flatMap(p => [p.x, p.y+.18, p.z]), 3));
  scene.add(new THREE.Points(plG, new THREE.PointsMaterial({ size:.9, map:glowTex, color:0x78E6F0, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })));
  const bowlMat = new THREE.MeshStandardMaterial({ color:0x4A4F62, roughness:.7, metalness:.3, flatShading:true });
  BRAZIER_AT.forEach(idx => { const p = spiralPt(idx), out = new V3(Math.sin(p.a),0,Math.cos(p.a)), c = new V3(p.x,0,p.z).addScaledVector(out, 2), r = 3;
    const isl = makeIsland(c.x, p.y, c.z, r); pickables.push(isl.topM); surfaces.push({ x:c.x, z:c.z, r, top:p.y });
    const b = new THREE.Group(); b.position.set(c.x + out.x*.8, p.y, c.z + out.z*.8);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.12,.3,.8,6).translate(0,.4,0), bowlMat), bowl = new THREE.Mesh(new THREE.CylinderGeometry(.55,.25,.4,10).translate(0,1,0), bowlMat);
    stem.castShadow = bowl.castShadow = true;
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFB062, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); fire.position.y = 1.45; fire.scale.set(2.2,2.8,1);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.22,.6,6).translate(0,1.45,0), new THREE.MeshBasicMaterial({ color:0xFFD08A, transparent:true, opacity:0 }));
    b.add(stem, bowl, fire, flame); scene.add(b); braziers.push({ pos:b.position.clone(), top:p.y, fire, flame, lit:false });
    pines.push({ x:c.x - out.x*1.6 + out.z*1.4, y:p.y-.05, z:c.z - out.z*1.6 - out.x*1.4, s:.8 }); });
}

/* about monolith near spawn */
const ABOUT_POS = new V3(-3.5, 0, 18.5); ABOUT_POS.y = groundH(ABOUT_POS.x, ABOUT_POS.z);
{ const g = new THREE.Group(); g.position.copy(ABOUT_POS);
  const ob = new THREE.Mesh(new THREE.BoxGeometry(1.1,3.2,.5).translate(0,1.6,0), new THREE.MeshStandardMaterial({ color:0x2E3446, roughness:.9, flatShading:true })); ob.rotation.y = .5; ob.castShadow = true;
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(.7,2.2), new THREE.MeshBasicMaterial({ map:runeTex, color:0x78E6F0, transparent:true, opacity:.8, blending:THREE.AdditiveBlending, depthWrite:false }));
  glyph.position.set(0,1.7,.26); glyph.rotation.z = Math.PI/2; ob.add(glyph); g.add(ob); scene.add(g); ob.userData.about = true; pickables.push(ob); }

/* ---------- vegetation ---------- */
{
  const trunkG = new THREE.CylinderGeometry(.08,.16,1.2,5).translate(0,.6,0);
  const all = pines.concat(spirits);
  inst(trunkG, new THREE.MeshStandardMaterial({ color:0x2A2222, roughness:1, flatShading:true }), all.map(t => ({ p:new V3(t.x,t.y,t.z), s:new V3(t.s,t.s,t.s) })), { cast:true });
  const coneG = new THREE.ConeGeometry(.75,1.7,6).translate(0,1.9,0), cone2 = new THREE.ConeGeometry(.55,1.3,6).translate(0,2.75,0);
  const pineMat = new THREE.MeshStandardMaterial({ roughness:1, flatShading:true });
  const pi = pines.map(t => ({ p:new V3(t.x,t.y,t.z), q:new THREE.Quaternion().setFromAxisAngle(UP, rand()*6), s:new V3(t.s,t.s*(.9+rand()*.4),t.s), c:mixHex('#14211F','#1E302A',rand()) }));
  inst(coneG, pineMat, pi, { cast:true, receive:true }); inst(cone2, pineMat, pi, { cast:true, receive:true });
  const sp = []; spirits.forEach(t => { const col = rand() < .5 ? '#7FE9F2' : '#A493FF'; [[0,1.9,0,.95],[.55,1.55,.2,.6],[-.45,1.65,-.3,.55]].forEach(o => sp.push({ p:new V3(t.x+o[0]*t.s, t.y+o[1]*t.s, t.z+o[2]*t.s), q:new THREE.Quaternion().setFromEuler(new THREE.Euler(rand()*3,rand()*3,0)), s:new V3(1,1,1).multiplyScalar(o[3]*t.s), c:C(col).offsetHSL(0,0,(rand()-.5)*.1) })); });
  inst(new THREE.IcosahedronGeometry(1,0), new THREE.MeshBasicMaterial({ transparent:true, opacity:.85 }), sp);
  spirits.forEach(t => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x7FE9F2, transparent:true, opacity:.35, depthWrite:false, blending:THREE.AdditiveBlending })); s.position.set(t.x, t.y+1.8*t.s, t.z); s.scale.setScalar(5*t.s); scene.add(s); });
  inst(new THREE.ConeGeometry(.06,.5,3).translate(0,.24,0), new THREE.MeshStandardMaterial({ roughness:1, flatShading:true }), tufts.map(p => ({ p:new V3(p[0],p[1]-.05,p[2]), q:new THREE.Quaternion().setFromEuler(new THREE.Euler((rand()-.5)*.5, rand()*6, (rand()-.5)*.5)), s:new V3(1,.7+rand()*.9,1).multiplyScalar(.6+rand()*.8), c:mixHex('#1A2C27','#2C4434',rand()) })), { receive:true });
  inst(new THREE.OctahedronGeometry(.09,0), new THREE.MeshBasicMaterial(), glowPlants.map((p,i) => ({ p:new V3(p[0],p[1]+.12+rand()*.15,p[2]), s:new V3(1,1.8,1), c:C(['#5FE6D6','#9C86FF','#7FE9F2','#C9F7FF'][i%4]) })));
  inst(new THREE.OctahedronGeometry(1,0), new THREE.MeshBasicMaterial(), veins);
}

/* wisps drifting low over the valley */
const WISP = 360, wispG = new THREE.BufferGeometry(), wispP = new Float32Array(WISP*3), wispV = [];
for (let i=0;i<WISP;i++){ const a=rand()*6.283, d=6+Math.sqrt(rand())*24; wispP.set([Math.sin(a)*d, .3+rand()*7, Math.cos(a)*d], i*3); wispV.push([rand()*6.28, .2+rand()*.5]); }
wispG.setAttribute('position', new THREE.BufferAttribute(wispP,3));
const wisps = new THREE.Points(wispG, new THREE.PointsMaterial({ map:softTex, size:.32, color:0x9FF2FF, transparent:true, opacity:.85, depthWrite:false, blending:THREE.AdditiveBlending })); wisps.frustumCulled = false; scene.add(wisps);
const MIST = 26; const mists = []; for (let i=0;i<MIST;i++){ const a=rand()*6.283, d=10+rand()*20; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:softTex, color:0x5A6A96, transparent:true, opacity:.12, depthWrite:false }));
  s.position.set(Math.sin(a)*d, groundH(Math.sin(a)*d, Math.cos(a)*d)+1.2, Math.cos(a)*d); s.scale.set(16,4,1); scene.add(s); mists.push({ s, a, d, sp:(rand()-.5)*.02 }); }

/* ---------- the eclipse (the Oracle) ---------- */
const oracle = new THREE.Group(); oracle.position.set(0, ORACLE_Y, 0); scene.add(oracle);
const oracleState = { energy:0, target:0, eye:0, eyeTarget:0 };
oracle.add(new THREE.Mesh(new THREE.SphereGeometry(5,48,32), new THREE.MeshBasicMaterial({ color:0x020308, fog:false })));
const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map:coronaTex, color:0xffffff, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false })); corona.scale.set(23,23,1); oracle.add(corona);
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x4A5BC8, transparent:true, opacity:.45, depthWrite:false, blending:THREE.AdditiveBlending, fog:false })); halo.scale.set(80,80,1); oracle.add(halo);
const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map:eyeTex, color:0xffffff, transparent:true, depthWrite:false, depthTest:false, blending:THREE.AdditiveBlending, fog:false })); scene.add(eye);
const oRingMat = new THREE.MeshBasicMaterial({ color:0xC9A86A, transparent:true, opacity:.55, fog:false });
const oRings = [[8,.05,.5,.5],[10,.035,-.35,1.3],[12.5,.03,.25,2.2]].map(([R,th,spd,tilt]) => { const piv = new THREE.Group(); piv.rotation.set(tilt*.5+.45, tilt, 0);
  const tor = new THREE.Mesh(new THREE.TorusGeometry(R,th,6,180), oRingMat); piv.add(tor); oracle.add(piv); return { tor, spd }; });
const runeBand = new THREE.Mesh(new THREE.CylinderGeometry(15,15,1.2,96,1,true), new THREE.MeshBasicMaterial({ map:runeTex, color:0x78E6F0, transparent:true, opacity:.4, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
runeTex.repeat.set(4,1); runeBand.rotation.x = .18; oracle.add(runeBand);
const beamVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }';
const beamFrag = `uniform float t; uniform float fade; uniform float rep; uniform vec3 col; varying vec2 vUv;
  void main(){ float f = smoothstep(0.,.1,vUv.y)*smoothstep(1.,.8,vUv.y); float s = .55 + .45*sin(vUv.y*rep - t*4.); float a = f*s*fade; gl_FragColor = vec4(col*a, a); }`;
const columnMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false,
  uniforms:{ t:{value:0}, fade:{value:.1}, rep:{value:40}, col:{value:C('#9FE8FF')} }, vertexShader:beamVert, fragmentShader:beamFrag });
{ const h = ORACLE_Y - 5 - WATER_Y; const col = new THREE.Mesh(new THREE.CylinderGeometry(.35, 1.2, h, 24, 1, true), columnMat); col.position.y = WATER_Y + h/2; scene.add(col); }
const beamMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false,
  uniforms:{ t:{value:0}, fade:{value:0}, rep:{value:30}, col:{value:C('#BFF6FF')} }, vertexShader:beamVert, fragmentShader:beamFrag });
const beam = new THREE.Mesh(new THREE.CylinderGeometry(.12,.45,1,12,1,true), beamMat); beam.visible = false; scene.add(beam);
let beamState = { life:0, relic:null };
function beamTo(r){ beamState = { life:3.2, relic:r }; beamMat.uniforms.col.value.set(r.color).lerp(C('#FFFFFF'), .4); beam.visible = true; oracleState.eyeTarget = 1; }

/* ---------- relics ---------- */
const relicMats = {};
function std(c, o={}){ return new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.5, metalness:.2, flatShading:true }, o)); }
function buildForm(r){
  const g = new THREE.Group(), col = C(r.color);
  if (r.form === 'letter'){
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.8,1.2,.08), std(0xD6E2E8, { emissive:0x24414A, emissiveIntensity:.6 })));
    const flap = new THREE.Mesh(new THREE.CylinderGeometry(.66,.66,.06,3).rotateX(Math.PI/2), std(0xC2D2DA, { emissive:0x1C3640, emissiveIntensity:.6 })); flap.scale.x = 1.36; flap.position.set(0,.26,.06); g.add(flap);
    const sealM = new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.07,16).rotateX(Math.PI/2), std(r.color, { emissive:r.color, emissiveIntensity:1 })); sealM.position.set(0,-.04,.12); g.add(sealM);
  } else if (r.form === 'cocoon'){
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1,1), std(r.color, { transparent:true, opacity:.32, emissive:r.color, emissiveIntensity:.35, depthWrite:false })); shell.scale.set(.95,1.35,.95); g.add(shell);
    const pet = new THREE.InstancedMesh(new THREE.BoxGeometry(.15,.15,.15), std(0xFFD6E6, { emissive:0xFF7FB0, emissiveIntensity:.7 }), 25); let k = 0;
    ['X...X','XXXXX','X.X.X','XXXXX','.XXX.'].forEach((row,y) => [...row].forEach((ch,x) => { if (ch==='X'){ M4.makeTranslation((x-2)*.16, (2-y)*.16, 0); pet.setMatrixAt(k++, M4); } })); pet.count = k; g.add(pet); g.userData.spin = pet;
  } else if (r.form === 'hourglass'){
    const glass = std(r.color, { transparent:true, opacity:.38, emissive:r.color, emissiveIntensity:.3, depthWrite:false });
    const top = new THREE.Mesh(new THREE.ConeGeometry(.55,.75,16).rotateX(Math.PI).translate(0,.38,0), glass), bot = new THREE.Mesh(new THREE.ConeGeometry(.55,.75,16).translate(0,-.38,0), glass);
    const goldM = std(0xC9A86A, { metalness:.7, roughness:.3, emissive:0x3A2A10, emissiveIntensity:.5 });
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.09,24), goldM), c2 = c1.clone(); c1.position.y = .8; c2.position.y = -.8;
    for (let i=0;i<3;i++){ const a = i/3*Math.PI*2; const pl = new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.6,5), goldM); pl.position.set(Math.cos(a)*.64,0,Math.sin(a)*.64); g.add(pl); }
    const sand = new THREE.Mesh(new THREE.ConeGeometry(.36,.3,16).translate(0,-.6,0), std(0xFFE1A0, { emissive:0xFFC060, emissiveIntensity:.9 }));
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.75,4).translate(0,-.2,0), new THREE.MeshBasicMaterial({ color:0xFFE1A0 }));
    g.add(top, bot, c1, c2, sand, stream);
  } else if (r.form === 'book'){
    const cover = std(0x22305E, { emissive:0x101A44, emissiveIntensity:.6 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.3,.08,1.7), cover), b2 = b1.clone(); b1.position.y = .16; b2.position.y = -.16; b1.rotation.z = .1; b2.rotation.z = -.1;
    const pages = new THREE.Mesh(new THREE.BoxGeometry(1.2,.26,1.6), std(0xE8E2D2, { emissive:0x3A3628, emissiveIntensity:.5 }));
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(.9,.3), new THREE.MeshBasicMaterial({ map:runeTex, color:r.color, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false })); glyph.rotation.x = -Math.PI/2; glyph.position.y = .21;
    g.add(b1, b2, pages, glyph);
    const chainM = std(0x8A90A8, { metalness:.8, roughness:.3 });
    for (let i=0;i<14;i++){ const a = i/14*Math.PI*2; const l = new THREE.Mesh(new THREE.TorusGeometry(.1,.025,5,10), chainM); l.position.set(Math.cos(a)*1.1, Math.sin(a*2)*.08, Math.sin(a)*1.1); l.rotation.set(i%2 ? Math.PI/2 : 0, -a, 0); g.add(l); }
    g.rotation.x = .5;
  } else if (r.form === 'ledger'){
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5,1.5,1.5)), new THREE.LineBasicMaterial({ color:r.color }));
    const inner = new THREE.Mesh(new THREE.BoxGeometry(.75,.75,.75), std(r.color, { emissive:r.color, emissiveIntensity:.75 })); inner.rotation.set(.6,.6,0);
    g.add(edges, inner); g.userData.spin = inner;
    const orb = new THREE.Group(); for (let i=0;i<10;i++){ const a = i/10*Math.PI*2; const c = new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.12), new THREE.MeshBasicMaterial({ color:i%2 ? 0xFFE7B0 : 0x9FE8FF })); c.position.set(Math.cos(a)*1.25, Math.sin(a*3)*.2, Math.sin(a)*1.25); orb.add(c); } g.add(orb); g.userData.orb = orb;
  } else if (r.form === 'astrolabe'){
    const goldM = std(0xD8B46E, { metalness:.8, roughness:.25, emissive:0x4A3510, emissiveIntensity:.6 });
    const rings = [1.05,.82,.6].map((R,i) => { const t = new THREE.Mesh(new THREE.TorusGeometry(R,.04,6,64), goldM); t.rotation.set(i*.9, i*.5, 0); g.add(t); return t; }); g.userData.rings = rings;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.22,16,12), new THREE.MeshBasicMaterial({ color:0xFFF0C8 })));
    const needle = new THREE.Mesh(new THREE.BoxGeometry(1.7,.04,.04), goldM); g.add(needle);
  } else if (r.form === 'die'){
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.9,0), std(0x184A44, { emissive:0x0E3A34, emissiveIntensity:.6 })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(.91,0)), new THREE.LineBasicMaterial({ color:r.color })));
  }
  const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:r.color, transparent:true, opacity:.55, depthWrite:false, blending:THREE.AdditiveBlending })); gl.scale.set(5,5,1); g.add(gl);
  return g;
}
const sealMatBase = new THREE.MeshBasicMaterial({ map:runeTex, transparent:true, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending });
const hitMat = new THREE.MeshBasicMaterial({ visible:false });
RELICS.forEach(r => {
  r.group = new THREE.Group(); scene.add(r.group); r.model = buildForm(r); r.group.add(r.model);
  r.seal = new THREE.Group(); r.group.add(r.seal);
  [[1.55,.0],[1.75,1.1],[1.4,-1.0]].forEach(([R,tilt],i) => { const m = sealMatBase.clone(); m.color = C(r.color).lerp(C('#FFFFFF'), .25); m.opacity = .85;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R,R,.34,64,1,true), m); band.rotation.set(tilt,0,tilt*.6); band.userData.spd = (i%2 ? -1 : 1)*(.6+i*.25); r.seal.add(band); });
  r.free = new THREE.Mesh(new THREE.TorusGeometry(1.7,.025,6,96), new THREE.MeshBasicMaterial({ color:0xE2BE7A, transparent:true, opacity:.7 })); r.free.rotation.x = Math.PI/2; r.free.visible = false; r.group.add(r.free);
  r.hit = new THREE.Mesh(new THREE.SphereGeometry(2.1,10,8), hitMat); r.hit.userData.relic = r; r.group.add(r.hit); pickables.push(r.hit);
  r.pos = new V3(); r.state = r.secret ? 'hidden' : 'orbit'; r.discovered = false; r.t = 0; r.group.visible = !r.secret;
});
function orbitPos(r, out){ const o = r.orbit, a = o.phase + T*o.speed; return out.set(Math.cos(a)*o.R, o.y + Math.sin(T*.5 + o.phase*3)*.9, Math.sin(a)*o.R); }

/* bursts */
const bursts = [];
function burst(pos, color){
  const N = 70, g = new THREE.BufferGeometry(), p = new Float32Array(N*3), v = [];
  for (let i=0;i<N;i++){ p.set([pos.x,pos.y,pos.z], i*3); v.push(randUnit().multiplyScalar(3+rand()*7)); }
  g.setAttribute('position', new THREE.BufferAttribute(p,3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map:softTex, size:.45, color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })); pts.frustumCulled = false; scene.add(pts);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.9,1.1,48), new THREE.MeshBasicMaterial({ color, transparent:true, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending }));
  ring.position.copy(pos); ring.lookAt(camera.position); scene.add(ring);
  bursts.push({ pts, v, life:1.4, ring });
}

/* ---------- the wanderer ---------- */
const hero = new THREE.Group(); scene.add(hero);
const HM = (c,o={}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.85, flatShading:true }, o));
const cloak = new THREE.Mesh(new THREE.CylinderGeometry(.22,.48,1.0,10).translate(0,.8,0), HM(0x2C3548));
const head = new THREE.Mesh(new THREE.SphereGeometry(.25,14,10), HM(0x10131C)); head.position.y = 1.48;
const hood = new THREE.Mesh(new THREE.ConeGeometry(.33,.7,10).translate(0,.2,0), HM(0x323C52)); hood.position.set(0,1.56,-.06); hood.rotation.x = -.35;
const eyeM = new THREE.MeshBasicMaterial({ color:0xBFF6FF }); const e1 = new THREE.Mesh(new THREE.SphereGeometry(.035,6,5), eyeM), e2 = e1.clone(); e1.position.set(-.08,1.5,.22); e2.position.set(.08,1.5,.22);
const scarfM = HM(0xC9974A); const wrap = new THREE.Mesh(new THREE.TorusGeometry(.2,.07,6,14).rotateX(Math.PI/2), scarfM); wrap.position.y = 1.22;
const tail = []; for (let i=0;i<6;i++){ const b = new THREE.Mesh(new THREE.BoxGeometry(.12,.04,.16), scarfM); hero.add(b); tail.push(b); b.castShadow = true; }
const legM = HM(0x1C2230); const legL = new THREE.Mesh(new THREE.CylinderGeometry(.07,.065,.4,6).translate(0,-.2,0), legM), legR = legL.clone(); legL.position.set(-.12,.4,0); legR.position.set(.12,.4,0);
[cloak, head, hood, wrap, legL, legR].forEach(o => { o.castShadow = true; hero.add(o); }); hero.add(e1, e2);
const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(.1,0), new THREE.MeshBasicMaterial({ color:0xFFD28A })); lantern.position.set(.4,.85,.08); hero.add(lantern);
const lanternGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFB86B, transparent:true, opacity:.7, depthWrite:false, blending:THREE.AdditiveBlending })); lanternGlow.scale.set(1.3,1.3,1); lanternGlow.position.copy(lantern.position); hero.add(lanternGlow);
const lanternLight = new THREE.PointLight(0xFFB86B, 1.4, 9, 2); lanternLight.position.set(.4,1,.2); hero.add(lanternLight);
const flyGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x7FE9F2, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); flyGlow.position.set(0,1,-.4); flyGlow.scale.set(3,3,1); hero.add(flyGlow);
/* bow */
const bow = new THREE.Group(); hero.add(bow);
const bowArc = new THREE.Mesh(new THREE.TorusGeometry(.5,.025,5,24,Math.PI*.9), HM(0xD2C3A0, { emissive:0x3A3020, emissiveIntensity:.5 })); bowArc.rotation.z = -Math.PI*.45; bow.add(bowArc);
const strGeo = new THREE.BufferGeometry(); strGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0, 0,0,0],3));
const string = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color:0xBFF6FF, transparent:true, opacity:.9 })); bow.add(string);
const nock = new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.85,4).rotateZ(Math.PI/2), new THREE.MeshBasicMaterial({ color:0xE8F8FF })); nock.visible = false; bow.add(nock);
const nockGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x9FF2FF, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); nockGlow.scale.set(.6,.6,1); bow.add(nockGlow);
const BOW_REST = new V3(-.42,.95,.1), BOW_AIM = new V3(-.05,1.25,.42);
bow.position.copy(BOW_REST);
/* the arc bulges toward bow-local +x; its tips sit at x = TIP_X */
const TIP_X = Math.cos(Math.PI*.45)*.5, TIP_Y = Math.sin(Math.PI*.45)*.5;
const BOW_TURN = new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI/2), bowEuler = new THREE.Euler();

/* ---------- player ---------- */
const P = { pos:new V3(0,0,21.5), vel:new V3(), onGround:true, facing:Math.PI, target:null, flight:null, walk:0, speed:0, draw:0, drawing:false, auto:null,
  energy:1, flying:false, soared:false, jumpT:-9 };
P.pos.y = groundH(P.pos.x, P.pos.z);
const SPEED = 7, GRAV = 26, JUMP = 9.6, STEP_UP = .6, ASCEND = 7.5, CEILING = 47, AIR_R = 33, FLY_SECONDS = 7.5;
function jumpPress(){ if (P.flight) return; skipIntro(); if (P.onGround){ P.vel.y = JUMP; P.onGround = false; P.jumpT = T; } else P.jumpT = T - 1; }
function supportAt(x,z,y){ let best = -Infinity; const g = groundH(x,z); if (g <= y + STEP_UP) best = g;
  for (const s of surfaces){ const dx=x-s.x, dz=z-s.z; if (dx*dx+dz*dz < s.r*s.r && s.top <= y+STEP_UP && s.top > best) best = s.top; } return { h:best, onPlatform: best !== g }; }
function flyTo(dest){ const from = P.pos.clone(), dist = from.distanceTo(dest); P.flight = { from, to:dest.clone(), t:0, dur:Math.min(3.6, Math.max(1.2, dist/12)), arc:2 + dist*.12 }; P.target = null; P.vel.set(0,0,0); }

/* ---------- arrows ---------- */
const arrows = [];
const arrowShaft = new THREE.CylinderGeometry(.018,.018,1,5).rotateX(Math.PI/2);
function bowWorld(){ return hero.localToWorld(bow.position.clone()); }
function fireArrow(from, dir, speed, target){
  const g = new THREE.Group(); const sh = new THREE.Mesh(arrowShaft, new THREE.MeshBasicMaterial({ color:0xE8F8FF })); g.add(sh);
  const tipS = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x9FF2FF, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })); tipS.position.z = .5; tipS.scale.set(.9,.9,1); g.add(tipS);
  const TL = 14, tg = new THREE.BufferGeometry(), tp = new Float32Array(TL*3); for (let i=0;i<TL;i++) tp.set([from.x,from.y,from.z], i*3); tg.setAttribute('position', new THREE.BufferAttribute(tp,3));
  const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color:0x9FF2FF, transparent:true, opacity:.7, blending:THREE.AdditiveBlending, depthWrite:false })); trail.frustumCulled = false; scene.add(trail);
  g.position.copy(from); scene.add(g); arrows.push({ g, trail, pos:from.clone(), vel:dir.clone().normalize().multiplyScalar(speed), target, life: target ? 4 : 3.2, stuck:false, age:0 });
}
function updateArrows(dt){
  for (let i = arrows.length-1; i >= 0; i--){
    const a = arrows[i]; a.life -= dt; a.age += dt;
    if (!a.stuck){
      if (a.target){ const want = a.target.pos.clone().sub(a.pos); const d = want.length(); want.normalize().multiplyScalar(Math.max(50, a.vel.length())); a.vel.lerp(want, Math.min(1, dt*(6 + a.age*10))); if (d < 1.2 || a.age > 2.5){ hitRelic(a.target, a.pos); a.life = 0; } }
      else a.vel.y -= 6*dt;
      a.pos.addScaledVector(a.vel, dt);
      if (!a.target){ for (const r of RELICS){ if ((r.state === 'orbit') && r.group.visible && a.pos.distanceTo(r.pos) < 1.9){ hitRelic(r, a.pos); a.life = 0; break; } } }
      if (a.life > 0 && a.pos.y < groundH(a.pos.x, a.pos.z) + .05 && Math.hypot(a.pos.x,a.pos.z) < 40){ a.stuck = true; a.life = Math.min(a.life, 2.5); }
      a.g.position.copy(a.pos); a.g.quaternion.setFromUnitVectors(ZAX, a.vel.clone().normalize());
      const tp = a.trail.geometry.attributes.position.array; tp.copyWithin(3, 0, tp.length-3); tp[0]=a.pos.x; tp[1]=a.pos.y; tp[2]=a.pos.z; a.trail.geometry.attributes.position.needsUpdate = true;
    }
    a.trail.material.opacity = Math.max(0, Math.min(.7, a.life*.5));
    if (a.life <= 0){ scene.remove(a.g); scene.remove(a.trail); a.g.children.forEach(c => c.material && c.material.dispose()); a.trail.geometry.dispose(); arrows.splice(i,1); }
  }
}

/* ---------- relic logic ---------- */
let openRelic = null;
function hoverSpot(){ const f = new V3(-Math.sin(camS.yaw), 0, -Math.cos(camS.yaw)); const h = P.pos.clone().addScaledVector(f, 3.6); h.y = Math.max(P.pos.y, groundH(h.x,h.z)) + 2.3; return h; }
function hitRelic(r, at){ burst(at || r.pos, C(r.color)); bringDown(r); }
function bringDown(r){
  if (r.state === 'hidden') return;
  if (openRelic && openRelic !== r) sendBack(openRelic);
  if (r.state === 'open' || r.state === 'falling'){ showRelicCard(r); return; }
  r.state = 'falling'; r.t = 0; r.from = r.pos.clone(); r.to = hoverSpot(); openRelic = r;
  if (!r.discovered){ r.discovered = true; updateTracker(); }
  hideCard();
}
function summon(r){ if (r.state === 'hidden'){ oracleSay(r.secret ? "That relic is still asleep beneath the lake. Light the four braziers on the stairs and it will wake." : '', null); return; } beamTo(r); setTimeout(() => { burst(r.pos.clone(), C(r.color)); bringDown(r); }, reduceMotion ? 0 : 650); }
function sendBack(r){ if (!r || (r.state !== 'open' && r.state !== 'falling')) return; r.state = 'rising'; r.t = 0; r.from = r.pos.clone(); if (openRelic === r){ openRelic = null; hideCard(); } }
const tmpV = new V3();
function updateRelics(dt){
  RELICS.forEach(r => {
    switch (r.state){
      case 'hidden': break;
      case 'waking': r.t += dt/4; orbitPos(r, tmpV); r.pos.lerpVectors(r.from, tmpV, ease(Math.min(1,r.t))); if (r.t >= 1) r.state = 'orbit'; break;
      case 'orbit': orbitPos(r, r.pos); break;
      case 'falling': { r.t += dt/2.3; const e = ease(Math.min(1, r.t)); r.pos.lerpVectors(r.from, r.to, e); const sw = (1-e)*2.2; r.pos.x += Math.cos(e*7)*sw; r.pos.z += Math.sin(e*7)*sw;
        if (r.t >= 1){ r.state = 'open'; showRelicCard(r); } break; }
      case 'open': r.pos.copy(r.to); r.pos.y += Math.sin(T*1.4)*.12; if (P.pos.distanceTo(r.to) > 16) sendBack(r); break;
      case 'rising': r.t += dt/2.2; orbitPos(r, tmpV); r.pos.lerpVectors(r.from, tmpV, ease(Math.min(1, r.t))); if (r.t >= 1) r.state = 'orbit'; break;
    }
    r.group.position.copy(r.pos);
    const near = r.state === 'open' || r.state === 'falling';
    r.model.rotation.y += dt*(near ? .55 : .3);
    if (r.model.userData.spin) r.model.userData.spin.rotation.y += dt*1.2;
    if (r.model.userData.orb) r.model.userData.orb.rotation.y -= dt*.9;
    if (r.model.userData.rings) r.model.userData.rings.forEach((t,i) => { t.rotation.x += dt*(.3+i*.2); t.rotation.y += dt*(.2-i*.1); });
    const sealOn = !r.discovered; r.seal.visible = sealOn; r.seal.children.forEach(b => b.rotation.y += dt*b.userData.spd);
    r.free.visible = r.discovered && !near; r.free.rotation.z += dt*.5;
    const sc = near ? 1.25 : 1; r.model.scale.lerp(tmpV.set(sc,sc,sc), 1 - Math.exp(-dt*3));
  });
  if (openRelic && openRelic.state === 'open'){ relicLight.color.set(openRelic.color); relicLight.position.copy(openRelic.pos); relicLight.intensity = lerp(relicLight.intensity, 1.8, 1 - Math.exp(-dt*3)); }
  else relicLight.intensity = lerp(relicLight.intensity, 0, 1 - Math.exp(-dt*4));
}

/* ---------- input ---------- */
const keys = {};
let mode = 'auto';
const isTyping = e => e.target && e.target.tagName === 'INPUT';
addEventListener('keydown', e => {
  if (isTyping(e)) return; keys[e.code] = true;
  if (e.code === 'Space'){ e.preventDefault(); if (!e.repeat) jumpPress(); }
  if (/^(Arrow|Key[WASD])/.test(e.code)){ e.preventDefault(); skipIntro(); }
  if (e.code === 'KeyF') setMode(mode === 'aim' ? 'auto' : 'aim');
  if (e.code === 'Escape'){ indexEl.hidden = true; if (openRelic) sendBack(openRelic); if (P.drawing){ P.drawing = false; } }
  const d = /^Digit([1-7])$/.exec(e.code); if (d){ const r = RELICS.find(x => x.key === +d[1]); if (r) summon(r); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; P.drawing = false; });
const camS = { yaw:0, pitch:-.12, dist:9 };
let drag = null; const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); skipIntro();
  drag = { x:e.clientX, y:e.clientY, moved:false, button:e.button };
  if (mode === 'aim' && e.button === 0){ P.drawing = true; P.draw = 0; } });
canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx,dy) > 6){ drag.moved = true; if (mode !== 'aim') canvas.classList.add('dragging'); }
  if (drag.moved || mode === 'aim'){ const k = mode === 'aim' ? .0032 : .0055; camS.yaw -= dx*k; camS.pitch = Math.min(1.32, Math.max(-.62, camS.pitch - dy*k*.8)); drag.x = e.clientX; drag.y = e.clientY; } });
canvas.addEventListener('pointerup', e => { if (!drag) return; const was = drag.moved; drag = null; canvas.classList.remove('dragging');
  if (mode === 'aim'){ if (P.drawing){ P.drawing = false; if (P.draw > .12) fireManual(); else P.draw = 0; } return; }
  if (!was) clickAt(e.clientX, e.clientY); });
canvas.addEventListener('pointercancel', () => { drag = null; P.drawing = false; canvas.classList.remove('dragging'); });
canvas.addEventListener('wheel', e => { e.preventDefault(); camS.dist = Math.min(20, Math.max(4, camS.dist*(1 + e.deltaY*.0011))); }, { passive:false });
function clickAt(cx, cy){
  ndc.set(cx/innerWidth*2-1, -(cy/innerHeight)*2+1); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(pickables, false); if (!hits.length) return;
  const relicHit = hits.find(h => h.object.userData.relic && h.object.parent.visible);
  if (relicHit){ const r = relicHit.object.userData.relic; if (r.state === 'open' || r.state === 'falling') showRelicCard(r); else if (r.state === 'orbit' || r.state === 'rising') autoShoot(r); return; }
  const h = hits.find(x => !x.object.userData.relic); if (!h) return;
  if (h.object.userData.about){ P.target = ABOUT_POS.clone().add(new V3(.6,0,1.6)); return; }
  const p = h.point.clone(); if (Math.abs(p.y - P.pos.y) > 2.4) flyTo(p); else P.target = p;
}
function autoShoot(r){ if (P.auto || P.flight) return; P.auto = { r, t:0 }; P.target = null; }
function fireManual(){
  const from = bowWorld(); ray.setFromCamera(ndc.set(0,0), camera);
  let aimPt = camera.position.clone().addScaledVector(ray.ray.direction, 140);
  const hit = ray.intersectObjects(pickables, false).find(h => !h.object.userData.relic && h.distance > 2); if (hit) aimPt = hit.point;
  const relicAim = RELICS.filter(r => r.state === 'orbit' && r.group.visible).map(r => ({ r, d: ray.ray.distanceToPoint(r.pos), t: r.pos.clone().sub(camera.position).dot(ray.ray.direction) })).filter(o => o.d < 1.9 && o.t > 0).sort((a,b) => a.t - b.t)[0];
  if (relicAim) aimPt = camera.position.clone().addScaledVector(ray.ray.direction, relicAim.t);
  fireArrow(from, aimPt.sub(from), 26 + 52*P.draw, null); P.draw = 0;
}
function setMode(m){ mode = m; document.getElementById('modeAuto').setAttribute('aria-pressed', m === 'auto'); document.getElementById('modeAim').setAttribute('aria-pressed', m === 'aim');
  document.getElementById('cross').hidden = m !== 'aim'; canvas.classList.toggle('aiming', m === 'aim'); P.drawing = false; P.draw = 0; renderHint(); skipIntro();
  if (m === 'aim' && camS.pitch < .25) camS.pitch = .35; }
document.getElementById('modeAuto').addEventListener('click', () => setMode('auto'));
document.getElementById('modeAim').addEventListener('click', () => setMode('aim'));
const hintEl = document.getElementById('hint');
function renderHint(){ hintEl.innerHTML = mode === 'aim'
  ? '<kbd>Hold</kbd> draw · drag aim · release shoot<br>draw in the air to hover · <kbd>F</kbd> auto'
  : '<kbd>Space</kbd> jump, hold to fly · <kbd>Shift</kbd> dive<br>drag to look · click a relic to shoot · <kbd>1</kbd>–<kbd>6</kbd>'; }
renderHint();

/* ---------- camera ---------- */
let intro = reduceMotion ? null : { t:0, dur:6.5, from:new V3(5, 5, 36), look:new V3(0, ORACLE_Y-4, 0) };
function skipIntro(){ if (intro && intro.t < intro.dur - 1.1) intro.t = intro.dur - 1.1; }
const camPos = new V3(), camLook = new V3(), wantPos = new V3(), wantLook = new V3();
function followPose(){
  const aim = mode === 'aim';
  const head = P.pos.clone().add(new V3(0, 1.55, 0));
  const L = new V3(-Math.sin(camS.yaw)*Math.cos(camS.pitch), Math.sin(camS.pitch), -Math.cos(camS.yaw)*Math.cos(camS.pitch));
  const right = new V3(Math.cos(camS.yaw), 0, -Math.sin(camS.yaw));
  const pivot = head.clone().addScaledVector(right, aim ? 1.05 : 0).add(new V3(0, aim ? .45 : .2, 0));
  const dist = aim ? 4.4 : camS.dist;
  let d = dist; for (let k=0;k<12;k++){ const p = pivot.clone().addScaledVector(L, -d); const g = groundH(p.x,p.z); if (p.y > g + .35 && Math.hypot(p.x,p.z) < 42) break; d *= .82; }
  wantPos.copy(pivot).addScaledVector(L, -d);
  if (wantPos.y < groundH(wantPos.x, wantPos.z) + .3) wantPos.y = groundH(wantPos.x, wantPos.z) + .3;
  wantLook.copy(pivot).addScaledVector(L, 30);
}
followPose(); camPos.copy(intro ? intro.from : wantPos); camLook.copy(intro ? intro.look : wantLook);
function updateCamera(dt){
  followPose();
  if (intro){ intro.t += dt; const e = ease(Math.min(1, Math.max(0, (intro.t-1.6)/(intro.dur-1.6))));
    camPos.lerpVectors(intro.from, wantPos, e); camLook.lerpVectors(intro.look, wantLook, e); if (intro.t >= intro.dur) intro = null; }
  else { const k = 1 - Math.exp(-dt*(mode === 'aim' ? 14 : 7)); camPos.lerp(wantPos, k); camLook.lerp(wantLook, 1 - Math.exp(-dt*(mode === 'aim' ? 20 : 10))); }
  camera.position.copy(camPos); camera.lookAt(camLook); skyGroup.position.copy(camera.position);
  const fov = mode === 'aim' ? baseFov - 6 - P.draw*12 : baseFov; if (Math.abs(camera.fov - fov) > .05){ camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt*8)); camera.updateProjectionMatrix(); }
}

/* ---------- simulation ---------- */
function updatePlayer(dt){
  if (P.flight){ const f = P.flight; f.t += dt/f.dur; const t = Math.min(1,f.t), e = t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
    const prev = P.pos.clone(); P.pos.lerpVectors(f.from, f.to, e); P.pos.y += Math.sin(Math.PI*e)*f.arc; const d = P.pos.clone().sub(prev); if (d.x*d.x+d.z*d.z > 1e-6) P.facing = Math.atan2(d.x,d.z);
    if (t >= 1){ P.flight = null; P.vel.set(0,0,0); P.onGround = true; } P.speed = 0; return; }
  let mx = 0, mz = 0;
  const fwd = (keys.KeyW||keys.ArrowUp?1:0) - (keys.KeyS||keys.ArrowDown?1:0), side = (keys.KeyD||keys.ArrowRight?1:0) - (keys.KeyA||keys.ArrowLeft?1:0);
  if (fwd || side){ const fx = -Math.sin(camS.yaw), fz = -Math.cos(camS.yaw), rx = Math.cos(camS.yaw), rz = -Math.sin(camS.yaw); mx = fx*fwd + rx*side; mz = fz*fwd + rz*side; P.target = null; }
  else if (P.target){ mx = P.target.x - P.pos.x; mz = P.target.z - P.pos.z; if (Math.hypot(mx,mz) < .25){ P.target = null; mx = mz = 0; } }
  const ml = Math.hypot(mx,mz); if (ml > 0){ mx/=ml; mz/=ml; }
  const spd = SPEED * (mode === 'aim' ? (P.drawing ? .35 : .6) : 1) * (P.flying ? 1.2 : 1);
  const k = 1 - Math.exp(-dt*(P.onGround ? 14 : P.soared ? 6 : 4)); P.vel.x = lerp(P.vel.x, mx*spd, k); P.vel.z = lerp(P.vel.z, mz*spd, k);
  let nx = P.pos.x + P.vel.x*dt, nz = P.pos.z + P.vel.z*dt; const nr = Math.hypot(nx,nz);
  const lim = P.onGround ? WORLD_R : AIR_R; if (nr > lim){ nx *= lim/nr; nz *= lim/nr; }
  const s0 = supportAt(nx, nz, P.pos.y); if (!s0.onPlatform && P.pos.y < 2 && nr < LAKE_BLOCK){ const s = LAKE_BLOCK/Math.max(nr,.001); nx *= s; nz *= s; P.target = null; }
  const dive = keys.ShiftLeft || keys.ShiftRight;
  P.flying = !!keys.Space && !P.onGround && (T - P.jumpT > .2) && P.energy > .005;
  if (P.flying){ P.soared = true; P.vel.y = lerp(P.vel.y, ASCEND, 1 - Math.exp(-dt*5)); P.energy = Math.max(0, P.energy - dt/FLY_SECONDS); }
  else {
    P.vel.y -= GRAV*dt*(dive ? 1.6 : 1);
    if (!P.onGround && !dive){ if (mode === 'aim' && P.drawing) P.vel.y = Math.max(P.vel.y, -1.1); else if (P.soared) P.vel.y = Math.max(P.vel.y, -5); }
  }
  let ny = P.pos.y + P.vel.y*dt; const sup = supportAt(nx, nz, P.pos.y);
  if (ny > CEILING){ ny = CEILING; P.vel.y = Math.min(P.vel.y, 0); }
  if (ny <= sup.h){ ny = sup.h; P.vel.y = 0; P.onGround = true; } else P.onGround = ny - sup.h < .05;
  if (P.onGround){ P.soared = false; P.energy = Math.min(1, P.energy + dt/1.4); }
  P.pos.set(nx, ny, nz); P.speed = Math.hypot(P.vel.x, P.vel.z);
  let want = null;
  if (mode === 'aim') want = camS.yaw + Math.PI;
  else if (P.auto){ const d = P.auto.r.pos.clone().sub(P.pos); want = Math.atan2(d.x, d.z); }
  else if (P.speed > .3) want = Math.atan2(P.vel.x, P.vel.z);
  if (want !== null){ let d = want - P.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); P.facing += d*Math.min(1, dt*12); }
  if (P.auto){ P.auto.t += dt; P.draw = Math.min(1, P.auto.t/.42);
    if (P.auto.t > .48){ const r = P.auto.r; const from = bowWorld(); fireArrow(from, r.pos.clone().sub(from), 48, r); P.auto = null; P.draw = 0; } }
  else if (P.drawing) P.draw = Math.min(1, P.draw + dt/.85);
}
let T = 0;
function updateHero(dt){
  hero.position.copy(P.pos); hero.rotation.y = P.facing;
  const moving = Math.min(1, P.speed/SPEED); P.walk += dt*P.speed*1.9; const sw = Math.sin(P.walk)*.7*moving*(P.onGround ? 1 : .2);
  legL.rotation.x = sw; legR.rotation.x = -sw; cloak.position.y = Math.abs(Math.sin(P.walk))*.05*moving;
  const airborne = P.flying || (P.soared && !P.onGround);
  if (airborne){ legL.rotation.x = .5; legR.rotation.x = .15; }
  scarfM.emissive.set(0x5FE6F0); scarfM.emissiveIntensity = lerp(scarfM.emissiveIntensity, P.flying ? 1.1 : airborne ? .35 : 0, 1 - Math.exp(-dt*6));
  flyGlow.material.opacity = lerp(flyGlow.material.opacity, P.flying ? .75 : 0, 1 - Math.exp(-dt*6));
  const stream = P.flight || airborne ? 1 : moving;
  tail.forEach((b,i) => { const k = i+1; b.position.set(Math.sin(T*7+i*.9)*.035*k*(.3+stream), 1.18 - k*(.035 + (1-stream)*.07), -.2 - k*(.06 + stream*.09)); b.rotation.set(-.25 + (1-stream)*.9, Math.sin(T*6+i)*.3, 0); });
  const aiming = mode === 'aim' || P.auto || P.draw > 0;
  bow.position.lerp(aiming ? BOW_AIM : BOW_REST, 1 - Math.exp(-dt*12));
  const pitch = mode === 'aim' ? camS.pitch : (P.auto ? Math.atan2(P.auto.r.pos.y - P.pos.y - 1.2, Math.hypot(P.auto.r.pos.x-P.pos.x, P.auto.r.pos.z-P.pos.z)) : 0);
  bow.quaternion.setFromEuler(bowEuler.set(aiming ? -pitch : .15, 0, 0)).multiply(BOW_TURN);
  const midX = TIP_X - P.draw*.38;
  strGeo.attributes.position.array.set([TIP_X, TIP_Y, 0, midX, 0, 0, TIP_X, -TIP_Y, 0]); strGeo.attributes.position.needsUpdate = true;
  nock.visible = P.draw > .02; nock.position.set(midX + .42, 0, 0);
  nockGlow.position.set(midX + .85, 0, 0); nockGlow.material.opacity = P.draw*.9;
  lanternGlow.material.opacity = .55 + Math.sin(T*3)*.12; lanternLight.intensity = 1.25 + Math.sin(T*3)*.15;
}
let litCount = 0;
function updateWorld(dt){
  oracleState.energy = lerp(oracleState.energy, oracleState.target, 1 - Math.exp(-dt*3));
  oracleState.eye = lerp(oracleState.eye, Math.max(oracleState.eyeTarget, oracleState.target*.8), 1 - Math.exp(-dt*(oracleState.eyeTarget ? 6 : 2)));
  const en = oracleState.energy, ey = oracleState.eye;
  oracle.position.y = ORACLE_Y + Math.sin(T*.4)*.5;
  corona.material.opacity = .85 + Math.sin(T*1.1)*.08 + en*.15; corona.scale.setScalar(23 + Math.sin(T*.8)*.4 + ey*1.5);
  halo.material.opacity = .38 + en*.2 + ey*.15;
  const toCam = camera.position.clone().sub(oracle.position).normalize();
  eye.position.copy(oracle.position).addScaledVector(toCam, 5.4); eye.scale.set(7.5, .25 + ey*4.2, 1); eye.material.opacity = .25 + ey*.75;
  oRings.forEach(r => r.tor.rotation.z += dt*r.spd*.3*(1+en*3)); runeBand.rotation.y += dt*.04*(1+en*4);
  eclipseLight.intensity = .8 + ey*.6;
  columnMat.uniforms.t.value = T; columnMat.uniforms.fade.value = .12 + ey*.25; lakeMat.uniforms.t.value = T; lakeMat.uniforms.energy.value = ey; fallMat.uniforms.t.value = T; beamMat.uniforms.t.value = T;
  if (beamState.life > 0){ beamState.life -= dt; const from = oracle.position.clone(), to = beamState.relic.pos.clone(); const dir = to.clone().sub(from), len = dir.length(); dir.normalize();
    beam.scale.set(1,len,1); beam.position.copy(from).addScaledVector(dir, len/2); beam.quaternion.setFromUnitVectors(UP, dir.clone().negate());
    beamMat.uniforms.rep.value = len/1.5; beamMat.uniforms.fade.value = Math.min(1, beamState.life/.8)*Math.min(1,(3.2-beamState.life)/.25)*1.3;
    if (beamState.life <= 0){ beam.visible = false; oracleState.eyeTarget = 0; } }
  if (!reduceMotion){ const wp = wispG.attributes.position.array; for (let i=0;i<WISP;i++){ const v = wispV[i]; wp[i*3] += Math.sin(T*v[1] + v[0])*dt*.4; wp[i*3+1] += Math.cos(T*v[1]*.7 + v[0])*dt*.25; wp[i*3+2] += Math.cos(T*v[1] + v[0]*2)*dt*.4; } wispG.attributes.position.needsUpdate = true; }
  mists.forEach(m => { m.a += m.sp*dt; m.s.position.x = Math.sin(m.a)*m.d; m.s.position.z = Math.cos(m.a)*m.d; });
  for (let i = bursts.length-1; i >= 0; i--){ const b = bursts[i]; b.life -= dt; const p = b.pts.geometry.attributes.position.array;
    b.v.forEach((v,k) => { v.multiplyScalar(1 - dt*1.6); p[k*3] += v.x*dt; p[k*3+1] += v.y*dt; p[k*3+2] += v.z*dt; }); b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, b.life/1.4); b.ring.scale.setScalar(1 + (1.4-b.life)*4); b.ring.material.opacity = Math.max(0, b.life/1.4)*.9;
    if (b.life <= 0){ scene.remove(b.pts); scene.remove(b.ring); b.pts.geometry.dispose(); bursts.splice(i,1); } }
  braziers.forEach(b => { if (!b.lit && !P.flight && Math.hypot(P.pos.x-b.pos.x, P.pos.z-b.pos.z) < 2.8 && Math.abs(P.pos.y - b.top) < 2){ b.lit = true; litCount++; updateTracker();
      showToast(litCount < 4 ? `Brazier lit · ${litCount} of 4` : 'All four braziers burn. Something stirs in the lake.'); if (litCount === 4) wakeSecret(); }
    b.fire.material.opacity = b.lit ? .75 + Math.sin(T*9 + b.top)*.15 : 0; b.flame.material.opacity = b.lit ? .9 : 0; b.flame.scale.y = b.lit ? 1 + Math.sin(T*12 + b.top)*.15 : 1; });
}
function wakeSecret(){ const r = byId.offclock; r.state = 'waking'; r.t = 0; r.from = new V3(0, -3, 0); r.pos.copy(r.from); r.group.visible = true; beamTo(r);
  oracleSay("The lake has given up its relic. Shoot it down, or press 7.", null); }

/* ---------- UI ---------- */
const labelsEl = document.getElementById('labels');
RELICS.forEach(r => { const d = document.createElement('div'); d.className = 'plabel'; d.innerHTML = `<kbd>${r.key}</kbd><b>${r.name}</b>`; labelsEl.appendChild(d); r.label = d; });
const pv = new V3();
function updateLabels(){ const w = innerWidth, h = innerHeight;
  RELICS.forEach(r => { const show = (r.state === 'orbit' || r.state === 'rising' || r.state === 'waking') && r.group.visible && mode !== 'aim';
    if (!show){ r.label.style.visibility = 'hidden'; return; }
    pv.copy(r.pos); pv.y += 2.4; const d = camera.position.distanceTo(pv); pv.project(camera);
    if (pv.z > 1 || Math.abs(pv.x) > 1.1 || Math.abs(pv.y) > 1.1){ r.label.style.visibility = 'hidden'; return; }
    r.label.style.visibility = 'visible'; r.label.style.opacity = Math.min(1, Math.max(.3, (80-d)/40));
    r.label.style.transform = `translate(${((pv.x*.5+.5)*w).toFixed(1)}px,${((-pv.y*.5+.5)*h).toFixed(1)}px) translate(-50%,-100%)`; }); }
const relicList = document.getElementById('relicList'), relicCount = document.getElementById('relicCount');
RELICS.forEach(r => { const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.addEventListener('click', () => summon(r)); li.appendChild(b); relicList.appendChild(li); r.row = b; });
function updateTracker(){
  RELICS.forEach(r => { const hiddenNow = r.state === 'hidden';
    r.row.className = (r.discovered ? 'open' : '') + (r.secret && hiddenNow ? ' secret' : '');
    r.row.style.color = r.color;
    r.row.innerHTML = `<kbd>${r.key}</kbd><span class="gem" style="background:${r.color};color:${r.color}"></span><span class="nm" style="color:var(--text)">${r.secret && hiddenNow ? '???' : r.name}</span><span class="st">${r.secret && hiddenNow ? `${litCount}/4 fires` : r.discovered ? 'opened' : 'sealed'}</span>`;
    r.row.title = r.secret && hiddenNow ? 'Light the four braziers on the stairs' : `Summon ${r.name}`; });
  relicCount.textContent = `${MAIN.filter(r => r.discovered).length} / ${MAIN.length}`;
}
updateTracker();
const card = document.getElementById('card');
let cardFor = null;
function hideCard(){ card.hidden = true; cardFor = null; }
function renderCard(o, isRelic){
  card.innerHTML = `<button class="x" type="button" aria-label="Close">×</button>
    <div class="kicker"><span class="gem" style="background:${o.color};color:${o.color}"></span>${o.kicker}</div>
    <h2>${o.title || o.name}</h2>${o.meta ? `<div class="meta">${o.meta}</div>` : ''}<p>${o.body}</p>
    <div class="tags">${o.tags.map(t => `<span>${t}</span>`).join('')}</div>
    <div class="row"><button class="pill ask-about" type="button">Ask the Oracle</button>${isRelic ? '<button class="pill back" type="button">Release it</button>' : ''}</div>`;
  card.querySelector('.x').addEventListener('click', () => { if (isRelic) sendBack(o); else { hideCard(); aboutDismissed = true; } });
  card.querySelector('.ask-about').addEventListener('click', () => ask(o.id === 'about' ? 'Who is Austin?' : o.id === 'signal' ? 'What are his skills?' : `Tell me about ${o.name}`));
  if (isRelic) card.querySelector('.back').addEventListener('click', () => sendBack(o));
  card.hidden = false; card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; cardFor = o;
}
function showRelicCard(r){ renderCard(r, true); }
let aboutDismissed = false;
function updateNear(){ if (openRelic) return; const near = Math.hypot(P.pos.x - ABOUT_POS.x, P.pos.z - ABOUT_POS.z) < 4.2;
  if (near && cardFor !== ABOUT && !aboutDismissed) renderCard(ABOUT, false); else if (!near){ aboutDismissed = false; if (cardFor === ABOUT) hideCard(); } }
const cross = document.getElementById('cross'), crossRing = document.getElementById('crossRing');
const stamEl = document.getElementById('stamina'), stamFg = document.getElementById('stamFg');
function updateStamina(){
  const show = P.energy < .995 || P.flying; stamEl.toggleAttribute('hidden', !show); if (!show) return;
  pv.copy(P.pos); pv.y += 1.9; pv.project(camera); if (pv.z > 1){ stamEl.toggleAttribute('hidden', true); return; }
  stamEl.style.transform = `translate(${((pv.x*.5+.5)*innerWidth + 26).toFixed(1)}px,${((-pv.y*.5+.5)*innerHeight - 15).toFixed(1)}px)`;
  stamFg.style.strokeDashoffset = (94.25*(1 - P.energy)).toFixed(2); stamEl.classList.toggle('low', P.energy < .25);
}
const flyBtn = document.getElementById('flyBtn');
flyBtn.addEventListener('pointerdown', e => { e.preventDefault(); flyBtn.setPointerCapture(e.pointerId); jumpPress(); keys.Space = true; flyBtn.classList.add('on'); });
['pointerup','pointercancel'].forEach(t => flyBtn.addEventListener(t, () => { keys.Space = false; flyBtn.classList.remove('on'); }));
function updateCross(){ if (mode !== 'aim') return; crossRing.style.transform = `scale(${(1.35 - P.draw*.75).toFixed(3)})`; cross.classList.toggle('full', P.draw >= .98); }
const toastEl = document.getElementById('toast'); let toastT;
function showToast(t){ toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => toastEl.hidden = true, 2600); }

/* ---------- the Oracle's voice (scripted for the prototype) ---------- */
function match(q){ const s = q.toLowerCase(); return INTENTS.find(it => it.k.some(k => /^[a-z]+$/.test(k) && k.length <= 3 ? new RegExp(`\\b${k}\\b`).test(s) : s.includes(k))) || FALLBACK; }
const logEl = document.getElementById('log'), eyeEl = document.getElementById('eye');
function addMsg(who, text){ const d = document.createElement('div'); d.className = 'msg ' + who; if (who === 'oracle') d.innerHTML = '<span class="who">The Oracle</span><span class="txt"></span>'; else d.textContent = text;
  logEl.appendChild(d); while (logEl.children.length > 8) logEl.firstChild.remove(); logEl.scrollTop = logEl.scrollHeight; return d; }
function oracleSay(text){ if (!text) return; const d = addMsg('oracle'), span = d.querySelector('.txt'); oracleState.target = 1; eyeEl.classList.add('busy'); let i = 0;
  const done = () => { span.textContent = text; oracleState.target = 0; eyeEl.classList.remove('busy'); logEl.scrollTop = logEl.scrollHeight; };
  if (reduceMotion){ done(); return; }
  const step = () => { i += 2 + Math.floor(Math.random()*2); span.textContent = text.slice(0,i); logEl.scrollTop = logEl.scrollHeight; if (i < text.length) setTimeout(step, 16); else done(); }; setTimeout(step, 480); }
function ask(q){ q = q.trim(); if (!q) return; addMsg('you', q); const it = match(q); const r = it.to ? byId[it.to] : null;
  if (r && r.state === 'hidden'){ oracleSay("That relic is still asleep beneath the lake. Light the four braziers on the stairs and it will wake."); return; }
  if (r) setTimeout(() => summon(r), 350); oracleSay(it.a); }
document.getElementById('ask').addEventListener('submit', e => { e.preventDefault(); const q = document.getElementById('q'); ask(q.value); q.value = ''; });
const chipsEl = document.getElementById('chips');
['What has he built?','Show me WatApply','His internship','Skills','How do I reach him?'].forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.addEventListener('click', () => ask(t)); chipsEl.appendChild(b); });

/* ---------- index + links ---------- */
const indexEl = document.getElementById('index'), indexList = document.getElementById('indexList');
MAIN.forEach(r => { const li = document.createElement('li'); li.innerHTML = `<span class="gem" style="display:block;width:10px;height:10px;transform:rotate(45deg);background:${r.color}"></span><span class="t"><b>${r.name}</b><span>${r.kicker} · ${r.meta}</span></span>`;
  const b = document.createElement('button'); b.className = 'pill'; b.type = 'button'; b.textContent = 'Bring it down'; b.addEventListener('click', () => { indexEl.hidden = true; summon(r); }); li.appendChild(b); indexList.appendChild(li); });
document.getElementById('allWork').addEventListener('click', () => { indexEl.hidden = false; });
document.getElementById('closeIndex').addEventListener('click', () => { indexEl.hidden = true; });
indexEl.addEventListener('click', e => { if (e.target === indexEl) indexEl.hidden = true; });
document.querySelectorAll('[data-placeholder]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); showToast(`${a.dataset.placeholder} link goes here in the real site`); }));

/* ---------- loop ---------- */
let last = performance.now();
function frame(now){
  const dt = Math.min(.05, (now-last)/1000); last = now; T += dt;
  updatePlayer(dt); updateHero(dt); updateRelics(dt); updateArrows(dt); updateNear(); updateCamera(dt); updateWorld(dt); updateLabels(); updateCross(); updateStamina();
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
RELICS.forEach(r => { if (r.state === 'orbit') orbitPos(r, r.pos); });
requestAnimationFrame(frame);
setTimeout(() => oracleSay("Six relics drift above this valley, each sealing a piece of Austin's work. Click one and your bow will bring it down, draw the bow yourself with F, or name one and I'll call it."), reduceMotion ? 200 : 2000);
