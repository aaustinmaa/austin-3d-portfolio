import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import './styles.css';
import { rand, hash, vnoise, fbm, sstep, lerp, ease, C, mixHex, randUnit } from './noise.js';
import { radialTex, glowTex, softTex, runeTex } from './textures.js';
import { ABOUT, RELICS, INTENTS, FALLBACK, SKILLS, LINES, FINALE, starLine } from './content.js';
import { colliders, addFrustum, addBox, floorAt, ceilingAt, pushOut, solidAt } from './colliders.js';
import { createOracle } from './oracle.js';
import { createConstellation } from './constellation.js';
import { buildForm } from './relics.js';
import { buildHero, animateHero } from './hero.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const V3 = THREE.Vector3, UP = new V3(0,1,0), ZAX = new V3(0,0,1);
const merge = gs => BufferGeometryUtils.mergeBufferGeometries(gs);

/* ---------- world constants ---------- */
const LAKE_R = 7.5, LAKE_BLOCK = 9.6, WORLD_R = 29.5, WATER_Y = -.55, ORACLE_Y = 52;
const SP = { R:12.5, rise:.42, ang:.2, a0:.25, N:78, base:.5 };
const BRAZIER_AT = [16, 36, 56, 76];
function groundH(x,z){ const r = Math.hypot(x,z); let h = (fbm(x*.07+3.1, z*.07+7.3) - .5) * 1.7;
  if (r < LAKE_R+3.2) h -= sstep(0,1,(LAKE_R+3.2-r)/3.2) * 2.6;
  if (r > 26) h += Math.min(Math.pow((r-26)/10,2)*6, 34); return h; }
function spiralPt(i){ const a = SP.a0 + i*SP.ang; return { x:Math.sin(a)*SP.R, z:Math.cos(a)*SP.R, y:SP.base + i*SP.rise, a }; }
const onPath = (x,z) => z > 12 && Math.abs(x) < 6.5;
/* the ring of wish pillars: fixed spots, so trees, rocks and grass can keep clear of them */
const PILLARS = []; for (let i=0;i<14;i++){ const a = i/14*Math.PI*2 + .12, r = 23 + (i%2)*2.5, x = Math.sin(a)*r, z = Math.cos(a)*r; if (!onPath(x,z)) PILLARS.push({ x, z }); }
const nearPillar = (x,z,d) => PILLARS.some(p => Math.hypot(x - p.x, z - p.z) < d);

const byId = Object.fromEntries(RELICS.map(r => [r.id, r]));
const MAIN = RELICS.filter(r => !r.secret);

/* ---------- renderer ---------- */
const canvas = document.getElementById('world');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' }); }
catch(e){ document.body.insertAdjacentHTML('beforeend','<div class="fallback">This browser could not start WebGL. Use the links above for the résumé, GitHub and LinkedIn.</div>'); throw e; }
const PIXEL = Math.min(devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(PIXEL);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0A0E22, 16, 100);
const camera = new THREE.PerspectiveCamera(60, 1, .08, 900);
let baseFov = 60;
const wispScale = { value:1 };
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w,h,false); camera.aspect = w/h; baseFov = w < h ? 72 : 60; camera.updateProjectionMatrix(); wispScale.value = h*PIXEL/2; }
addEventListener('resize', resize); resize();

/* ---------- night sky: darker at first, lifting toward a deep blue with a warm horizon as the star's light returns ---------- */
const skyGroup = new THREE.Group(); scene.add(skyGroup);
const skyMat = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false, uniforms:{ glow:{value:0}, dawn:{value:0} },
  vertexShader:'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader:`uniform float glow; uniform float dawn; varying vec3 vD;
    float h3(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
      return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x), f.y), mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x), f.y), f.z); }
    float fb(vec3 p){ float a=.5, t=0.; for (int i=0;i<5;i++){ t += a*n3(p); p *= 2.03; a *= .5; } return t; }
    void main(){ vec3 d = normalize(vD); float h = d.y;
      vec3 zen = mix(vec3(.01,.013,.042), vec3(.022,.03,.09), glow), mid = mix(vec3(.022,.026,.075), vec3(.05,.055,.15), glow), hor = mix(vec3(.045,.045,.115), vec3(.1,.09,.22), glow);
      hor = mix(hor, vec3(.24,.15,.3), dawn*.5); mid = mix(mid, vec3(.1,.07,.18), dawn*.3);
      vec3 c = h > 0. ? mix(hor, mid, smoothstep(0.,.28,h)) : mix(hor, vec3(.012,.015,.03), smoothstep(0.,-.3,h));
      c = mix(c, zen, smoothstep(.3,1.,h));
      float n = fb(d*2.6 + 4.);
      c += vec3(.2,.13,.42)*pow(n,3.)*(1.15 + glow*.8)*smoothstep(-.05,.6,h);
      c += vec3(.04,.22,.26)*pow(max(fb(d*4.4 - 9.) - .5, 0.), 1.4)*(1. + glow)*smoothstep(.1,.8,h);
      gl_FragColor = vec4(c,1.); }` });
skyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(600,48,24), skyMat));
/* a small seeded generator for decoration added later, so the shared sequence (and the valley layout) stays unchanged */
const seq = sd => { let s = sd; return () => (s = s*16807 % 2147483647)/2147483647; };
/* the star field: the original stars plus a fainter dust of small ones, tinted white, blue and violet, each twinkling on its own */
const starU = { t:{value:0}, glow:{value:0}, px:{value:PIXEL} };
{ const N = 2600, M = 2400, sq = seq(29), g = new THREE.BufferGeometry(), p = new Float32Array((N+M)*3), c = new Float32Array((N+M)*3), z = new Float32Array(N+M);
  const tints = [[.78,.72,1],[.72,.84,1],[1,1,1],[.9,.86,1]];
  for (let i=0;i<N+M;i++){ const old = i < N, v = old ? randUnit() : new V3(sq()*2-1, sq()*2-1, sq()*2-1); v.y = Math.abs(v.y)*.95 + .03; v.normalize().multiplyScalar(520); p.set([v.x,v.y,v.z], i*3);
    const b = old ? .3+rand()*.6 : .25+sq()*.4, tint = old ? rand() : sq(), tc = tints[Math.min(3, Math.floor(tint*4))]; c.set([b*tc[0], b*tc[1], b*tc[2]], i*3); z[i] = old ? 1.8 + (b > .8 ? 2.2 : b*1.4) : 1.1 + sq()*.8; }
  g.setAttribute('position', new THREE.BufferAttribute(p,3)); g.setAttribute('col', new THREE.BufferAttribute(c,3)); g.setAttribute('sz', new THREE.BufferAttribute(z,1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, uniforms:starU,
    vertexShader:`attribute vec3 col; attribute float sz; uniform float t; uniform float glow; uniform float px; varying vec3 vC;
      void main(){ float h = fract(sin(dot(position.xz, vec2(12.9898,78.233)))*43758.5453); float tw = .65 + .35*sin(t*(.8 + h*2.2) + h*40.);
        vC = col*tw*(1. + glow*.35); gl_PointSize = sz*px*(.85 + .15*tw); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`varying vec3 vC; void main(){ vec2 q = gl_PointCoord - .5; float d = dot(q,q); float a = exp(-d*22.) + exp(-d*6.)*.2; gl_FragColor = vec4(vC*a, a); }` }));
  pts.frustumCulled = false; skyGroup.add(pts); }

/* ---------- light: the valley starts dark; the star overhead and the lantern carry it ---------- */
const hemi = new THREE.HemisphereLight(0x34407A, 0x0A0C1C, .1); scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9DB4FF, .06); moon.position.set(-60,100,40);
moon.castShadow = true; moon.shadow.mapSize.set(2048,2048); Object.assign(moon.shadow.camera, { left:-50, right:50, top:50, bottom:-50, near:20, far:300 });
moon.shadow.bias = -.0005; moon.shadow.normalBias = .04; scene.add(moon, moon.target);
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
/* bake a colour into every vertex of a geometry from its position */
function paint(geo, f){ const p = geo.attributes.position, c = new Float32Array(p.count*3);
  for (let i=0;i<p.count;i++){ f(p.getX(i), p.getY(i), p.getZ(i), tmpC); c[i*3]=tmpC.r; c[i*3+1]=tmpC.g; c[i*3+2]=tmpC.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c,3)); return geo; }
const rockMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, metalness:0, flatShading:true });
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion();
function inst(geo, mat, items, opts={}){ if (!items.length) return null; const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it,i) => { M4.compose(it.p, it.q || Q.identity(), it.s || new V3(1,1,1)); m.setMatrixAt(i, M4); if (it.c) m.setColorAt(i, it.c); });
  m.frustumCulled = false; m.castShadow = !!opts.cast; m.receiveShadow = !!opts.receive; scene.add(m); return m; }
const yawQ = a => new THREE.Quaternion().setFromAxisAngle(UP, a);
const pines = [], grass = [];
const pickables = [];

/* ---------- ground ---------- */
{
  const g = new THREE.PlaneGeometry(130,130,150,150); g.rotateX(-Math.PI/2);
  const p = g.attributes.position, col = new Float32Array(p.count*3);
  for (let i=0;i<p.count;i++){ const x=p.getX(i), z=p.getZ(i), h=groundH(x,z); p.setY(i,h); const r=Math.hypot(x,z); const n = fbm(x*.18+11, z*.18-4);
    if (h < WATER_Y + .35) tmpC.set('#2B3148');
    else if (r > 29) tmpC.copy(mixHex('#1A2234','#252A44', sstep(29,40,r)));
    else tmpC.copy(mixHex('#142030','#1E2C3E', n)).lerp(C('#2E3450'), sstep(LAKE_R+2.6, LAKE_R+1.4, r)*.8);
    col.set([tmpC.r,tmpC.g,tmpC.b], i*3); }
  g.setAttribute('color', new THREE.BufferAttribute(col,3)); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, flatShading:true })); ground.receiveShadow = true; scene.add(ground); pickables.push(ground);
  /* grass grows in soft meadows, thinning toward the lake and kept off the path */
  for (let i=0;i<7000 && grass.length<3600;i++){ const a=rand()*6.283, d=LAKE_BLOCK+.3+rand()*(WORLD_R+.5-LAKE_BLOCK), x=Math.cos(a)*d, z=Math.sin(a)*d, gy=groundH(x,z);
    if (gy < WATER_Y + .3 || (onPath(x,z) && Math.abs(x - Math.sin(z*.35)*.8) < 1.7) || fbm(x*.12+5, z*.12-2) < .34 - Math.max(0, 22 - d)*.012) continue; grass.push([x, gy, z]); }
  for (let i=0;i<70;i++){ const a=rand()*6.283, d=15+rand()*14; const x=Math.cos(a)*d, z=Math.sin(a)*d;
    if (onPath(x,z) || Math.hypot(x, z-21.5) < 4) continue; pines.push({ x, y:groundH(x,z)-.1, z, s:.9+rand()*.8, valley:true }); }

  /* a worn flagstone path from the spawn point down toward the lake */
  const stones = []; for (let z=21.5; z>10.4; z-=.95){ const sway = Math.sin(z*.35)*.8;
    for (let k=-1;k<=1;k++){ if (k && rand() < .35) continue; const x = sway + k*.95 + (rand()-.5)*.25, zz = z + (rand()-.5)*.2;
      stones.push({ p:new V3(x, groundH(x,zz) - .02, zz), q:yawQ(rand()*6), s:new V3(.75+rand()*.3, 1, .7+rand()*.3), c:mixHex('#2A3042','#3A4156', rand()) }); } }
  inst(rockify(new THREE.CylinderGeometry(.5,.54,.14,7,1), .25, 5.1, (t,c) => c.setRGB(1,1,1), .1), new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.95, flatShading:true }), stones, { receive:true });

  /* scattered boulders, some big enough to stand on */
  const bGeo = rockify(new THREE.IcosahedronGeometry(1,1), .55, 3.3, (t,c,n) => c.copy(mixHex('#191E2C','#2C3244', t)).lerp(C('#283252'), t > .78 ? .55 : 0), .4), boulders = [];
  for (let i=0;i<34;i++){ const a = rand()*6.283, d = 11 + rand()*17, x = Math.cos(a)*d, z = Math.sin(a)*d; if (onPath(x,z) || Math.hypot(x, z-21.5) < 4) continue;
    const s = .35 + Math.pow(rand(),1.6)*1.3, gy = groundH(x,z), q = yawQ(rand()*6), sz = s*(.8+rand()*.4); if (nearPillar(x, z, 1.5 + s)) continue;
    boulders.push({ p:new V3(x, gy - s*.2, z), q, s:new V3(s, s*.72, sz) }); addFrustum(x, z, gy - .5, gy + s*.48, s*.9, s*.62, { stand: s > .55 }); }
  inst(bGeo, rockMat, boulders, { cast:true, receive:true });
}

/* ---------- lake ---------- */
const lakeMat = new THREE.ShaderMaterial({ transparent:true, uniforms:{ t:{value:0}, energy:{value:0}, glow:{value:0} },
  vertexShader:'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader:`uniform float t; uniform float energy; uniform float glow; varying vec3 vW;
    void main(){ float r = length(vW.xz);
      vec3 c = mix(vec3(.012,.025,.05), vec3(.04,.08,.12), smoothstep(${(LAKE_R-3).toFixed(1)}, ${(LAKE_R+2).toFixed(1)}, r));
      float ring = exp(-pow(r-2.6,2.)*3.)*(.3+energy*.5+glow*.25); c += vec3(.55,.92,1.)*ring*.5;
      c += vec3(.4,.85,1.)*exp(-r*r/2.)*(.22+energy*.4+glow*.3);
      float rip = pow(.5+.5*sin(r*2.4 - t*1.2), 16.); c += vec3(.4,.7,1.)*rip*.06*(1.-smoothstep(3.,9.,r));
      float sp = step(.988, fract(sin(dot(floor(vW.xz*3.), vec2(12.9898,78.233)))*43758.5453 + t*.12)); c += sp*vec3(.5,.8,1.)*(.25+glow*.2);
      gl_FragColor = vec4(c,.95); }` });
{ const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE_R+3.4, 72), lakeMat); lake.rotation.x = -Math.PI/2; lake.position.y = WATER_Y; scene.add(lake); }

/* ---------- basalt walls ---------- */
const cliffCol = (t,c,n,y) => {
  if (t > .985) { c.copy(mixHex('#1E2F2B','#26392F',n)); return; }
  c.copy(mixHex('#1B2030','#272C40', sstep(0,.6,t))).lerp(C('#343A52'), Math.max(0,(n-.5)*.6 + .12*Math.sin(y*1.15)));
};
const cliffs = [];
function addCliff(a, R, rb, rt, h, top=true){
  const g = new THREE.CylinderGeometry(rt, rb, h, 11, 14, false); g.translate(0,h/2,0); rockify(g, .34, a*3.7+R, cliffCol, 0);
  const m = new THREE.Mesh(g, rockMat); const x=Math.sin(a)*R, z=Math.cos(a)*R, by=groundH(x*.82,z*.82)-2;
  m.position.set(x,by,z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  addFrustum(x, z, by, by+h, rb*.9, rt*.9);
  if (top){ const n = 2 + Math.floor(rand()*3); for (let i=0;i<n;i++){ const aa=rand()*6.283, d=rand()*rt*.55; pines.push({ x:x+Math.cos(aa)*d, y:by+h-.15, z:z+Math.sin(aa)*d, s:1.1+rand()*.9 }); } }
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
      gl_FragColor = vec4(mix(vec3(.45,.62,.85), vec3(.85,.95,1.), s), a*.6); }` });
[2, 11, 20].forEach(ci => { const c = cliffs[ci]; const dir = new V3(Math.sin(c.a),0,Math.cos(c.a)), tan = new V3(Math.cos(c.a),0,-Math.sin(c.a));
  const topY = c.by + c.h*.92, topR = c.R - lerp(c.rb,c.rt,.92) - 1.9, botR = c.R - c.rb*.86 - 2.2, w = 2.6; const bx = dir.x*botR, bz = dir.z*botR, botY = groundH(bx,bz) - .3;
  const pts = [ dir.clone().multiplyScalar(botR).addScaledVector(tan,-w/2).setY(botY), dir.clone().multiplyScalar(botR).addScaledVector(tan,w/2).setY(botY),
    dir.clone().multiplyScalar(topR).addScaledVector(tan,-w*.4).setY(topY), dir.clone().multiplyScalar(topR).addScaledVector(tan,w*.4).setY(topY) ];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(v=>[v.x,v.y,v.z]),3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2)); g.setIndex([0,1,2,2,1,3]); scene.add(new THREE.Mesh(g, fallMat)); });

/* ---------- wish pillars: tall stone pillars ringing the meadow, each with a glowing band; you can stand on their caps ---------- */
const bandMat = new THREE.MeshBasicMaterial({ color:0x78E6F0, transparent:true, opacity:.55 });
{
  const sq = seq(53), stone = new THREE.MeshStandardMaterial({ color:0x3A4054, roughness:.95, flatShading:true });
  PILLARS.forEach(o => { const h = 6 + sq()*3, gy = groundH(o.x, o.z) - .2, rot = sq()*Math.PI;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.55,.7,h,8).translate(0,h/2,0), stone); shaft.position.set(o.x, gy, o.z); shaft.rotation.y = rot; scene.add(shaft);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7,.4,1.7), stone); cap.position.y = h + .2; shaft.add(cap);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,.12,24,1,true), bandMat); band.position.y = h*.62; shaft.add(band);
    [shaft, cap].forEach(m => { m.castShadow = m.receiveShadow = true; m.userData.perch = new V3(o.x, gy + h + .4, o.z); pickables.push(m); });
    addFrustum(o.x, o.z, gy - .3, gy + h, .7, .55, { stand:false }); addBox(o.x, o.z, gy + h, gy + h + .4, .85, .85, rot); });
}

/* ---------- spiral stair, landings, braziers ---------- */
const pathLights = [];
const islandUnder = (t,c,n) => c.copy(mixHex('#151A28','#2A3044', sstep(0,1,t))).offsetHSL(0,0,(n-.5)*.05);
function makeIsland(cx, top, cz, r){
  const grp = new THREE.Group(); grp.position.set(cx, top, cz);
  const topM = new THREE.Mesh(new THREE.CylinderGeometry(r, r*.95, .55, 20).translate(0,-.275,0), new THREE.MeshStandardMaterial({ color:0x323848, roughness:1, flatShading:true }));
  const under = new THREE.Mesh(rockify(new THREE.ConeGeometry(r*.95, r*1.9, 11, 4).rotateX(Math.PI).translate(0,-.55-r*.95,0), .32, cx+cz, islandUnder, .35), rockMat);
  [topM, under].forEach(o => { o.castShadow = o.receiveShadow = true; grp.add(o); }); scene.add(grp);
  addFrustum(cx, cz, top-.55, top, r*.95, r); addFrustum(cx, cz, top-.55-r*1.9, top-.55, 0, r*.9, { stand:false, ceil:true });
  return { grp, topM };
}
const braziers = [];
{
  const n = SP.N+1; const topG = new THREE.CylinderGeometry(1.45,1.32,.42,9); topG.translate(0,-.21,0);
  const botG = rockify(new THREE.ConeGeometry(1.3,1.6,8,2).rotateX(Math.PI).translate(0,-1.2,0), .3, 2.2, (t,c,nn)=>c.copy(mixHex('#141826','#2A3044',t)).offsetHSL(0,0,(nn-.5)*.05));
  const stoneTop = new THREE.InstancedMesh(topG, new THREE.MeshStandardMaterial({ roughness:.95, flatShading:true }), n), stoneBot = new THREE.InstancedMesh(botG, rockMat, n);
  let k = 0;
  for (let i=0;i<=SP.N;i++){ if (BRAZIER_AT.includes(i)) continue; const p = spiralPt(i);
    M4.compose(new V3(p.x,p.y,p.z), Q.setFromAxisAngle(UP, rand()*6.28), new V3(1,1,1)); stoneTop.setMatrixAt(k,M4); stoneBot.setMatrixAt(k,M4);
    stoneTop.setColorAt(k, mixHex('#3D4458','#4A5168', rand())); k++;
    addFrustum(p.x, p.z, p.y-.42, p.y, 1.3, 1.45); addFrustum(p.x, p.z, p.y-2, p.y-.42, 0, 1.25, { stand:false, ceil:true });
    if (i % 4 === 2) pathLights.push(p); }
  stoneTop.count = stoneBot.count = k;
  [stoneTop, stoneBot].forEach(o => { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; scene.add(o); }); pickables.push(stoneTop);
  const plG = new THREE.BufferGeometry(); plG.setAttribute('position', new THREE.Float32BufferAttribute(pathLights.flatMap(p => [p.x, p.y+.18, p.z]), 3));
  scene.add(new THREE.Points(plG, new THREE.PointsMaterial({ size:.9, map:glowTex, color:0x78E6F0, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })));
  const bowlMat = new THREE.MeshStandardMaterial({ color:0x4A4F62, roughness:.7, metalness:.3, flatShading:true });
  BRAZIER_AT.forEach(idx => { const p = spiralPt(idx), out = new V3(Math.sin(p.a),0,Math.cos(p.a)), c = new V3(p.x,0,p.z).addScaledVector(out, 2), r = 3;
    const isl = makeIsland(c.x, p.y, c.z, r); pickables.push(isl.topM);
    const b = new THREE.Group(); b.position.set(c.x + out.x*.8, p.y, c.z + out.z*.8);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.12,.3,.8,6).translate(0,.4,0), bowlMat), bowl = new THREE.Mesh(new THREE.CylinderGeometry(.55,.25,.4,10).translate(0,1,0), bowlMat);
    stem.castShadow = bowl.castShadow = true;
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFB062, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); fire.position.y = 1.45; fire.scale.set(2.2,2.8,1);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.22,.6,6).translate(0,1.45,0), new THREE.MeshBasicMaterial({ color:0xFFD08A, transparent:true, opacity:0 }));
    const light = new THREE.PointLight(0xFFA050, 0, 9, 2); light.position.y = 1.5;
    b.add(stem, bowl, fire, flame, light); scene.add(b); braziers.push({ pos:b.position.clone(), top:p.y, fire, flame, light, lit:false });
    addFrustum(b.position.x, b.position.z, p.y, p.y+1.2, .3, .55, { stand:false });
    pines.push({ x:c.x - out.x*1.6 + out.z*1.4, y:p.y-.05, z:c.z - out.z*1.6 - out.x*1.4, s:.8, valley:true }); });
}

/* ---------- lanterns along the path: a lit way in, from where you arrive down to the lake ---------- */
{
  const bronze = new THREE.MeshStandardMaterial({ color:0x3A3328, roughness:.55, metalness:.6, flatShading:true }), stone = new THREE.MeshStandardMaterial({ color:0x2E3446, roughness:.95, flatShading:true });
  const bronzeG = merge([new THREE.CylinderGeometry(.045,.06,1.3,8).translate(0,.75,0), new THREE.CylinderGeometry(.13,.11,.035,6).translate(0,1.42,0),
    new THREE.ConeGeometry(.19,.16,6).translate(0,1.72,0), new THREE.SphereGeometry(.035,6,4).translate(0,1.83,0), new THREE.CylinderGeometry(.118,.118,.025,6).translate(0,1.64,0)]);
  const footG = new THREE.CylinderGeometry(.2,.26,.16,8).translate(0,.08,0), glassG = new THREE.CylinderGeometry(.1,.1,.2,6).translate(0,1.54,0);
  const spots = [[22.6,-1],[22.6,1],[19.7,-1],[16.9,1],[14.1,-1],[11.4,-1],[11.4,1]].map(([z,sd]) => { const x = Math.sin(z*.35)*.8 + sd*1.75; return { x, z, y:groundH(x,z) }; });
  const items = spots.map(o => ({ p:new V3(o.x, o.y - .04, o.z), q:yawQ(o.x*3) }));
  inst(bronzeG, bronze, items, { cast:true }); inst(footG, stone, items, { cast:true, receive:true }); inst(glassG, new THREE.MeshBasicMaterial({ color:0xFFD6A0 }), items);
  spots.forEach(o => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFB86B, transparent:true, opacity:.6, depthWrite:false, blending:THREE.AdditiveBlending })); glow.position.set(o.x, o.y + 1.54, o.z); glow.scale.setScalar(1.5); scene.add(glow);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({ map:glowTex, color:0xFFB070, transparent:true, opacity:.16, depthWrite:false, blending:THREE.AdditiveBlending }));
    pool.position.set(o.x, o.y + .06, o.z); scene.add(pool);
    addFrustum(o.x, o.z, o.y - .3, o.y + .16, .26, .2, { stand:false }); addFrustum(o.x, o.z, o.y + .16, o.y + 1.85, .08, .08, { stand:false }); });
}

/* ---------- vegetation ---------- */
/* a pine: five drooping, ragged tiers over a short trunk, coloured darker inside and frosted at the tips */
function pineGeo(){
  const parts = [paint(new THREE.CylinderGeometry(.07,.14,1.3,6).translate(0,.65,0), (x,y,z,c) => c.set('#2A2220'))];
  for (let i=0;i<5;i++){ const R = 1.05 - i*.17, H = 1.0 - i*.08, yc = 1.0 + i*.52, g = new THREE.ConeGeometry(R, H, 18, 2), p = g.attributes.position;
    for (let k=0;k<p.count;k++){ const x=p.getX(k), y=p.getY(k), z=p.getZ(k); if (Math.hypot(x,z) < 1e-3) continue; const sp = Math.cos(Math.atan2(z,x)*9 + i);
      if (y < -H/2 + 1e-3){ const kk = 1 + sp*.12; p.setXYZ(k, x*kk, y - .12*(.5+.5*sp), z*kk); } else if (Math.abs(y) < 1e-3){ p.setX(k, x*.88); p.setZ(k, z*.88); } }
    g.translate(0, yc, 0);
    parts.push(paint(g, (x,y,z,c) => { const r = Math.hypot(x,z)/R; c.copy(mixHex('#0D1524','#1B2B3E', r)).lerp(C('#43588A'), Math.max(0, r - .86)*2.4); })); }
  return merge(parts); }
/* a clump of grass: curved blades that taper to a point, dark at the root and paler at the tip */
function grassGeo(){
  const parts = []; for (let b=0;b<5;b++){ const segs = 3, w = .045 + rand()*.02, h = .36 + rand()*.34, lean = .12 + rand()*.22, a = b/5*Math.PI*2 + rand()*.7, pos = [], uv = [], idx = [];
    for (let s=0;s<=segs;s++){ const t = s/segs, ww = w*(1 - t*.92); pos.push(-ww, h*t, lean*t*t, ww, h*t, lean*t*t); uv.push(0, t, 1, t); }
    for (let s=0;s<segs;s++){ const k = s*2; idx.push(k, k+1, k+2, k+2, k+1, k+3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v,i) => i%3 === 1 ? 1 : 0),3)); g.setIndex(idx);
    g.rotateY(a); g.translate(Math.sin(a)*.04, 0, Math.cos(a)*.04); parts.push(g); }
  return paint(merge(parts), (x,y,z,c) => c.copy(mixHex('#0D1426','#1A2A44', Math.min(1, y/.4))).lerp(C('#4A5F9C'), Math.max(0, y - .34)*1.8)); }
/* the grass sways in a slow wind, and its tips take on a faint glow as the star's light returns */
const grassU = { t:{ value:0 }, glow:{ value:0 } };
{
  const clear = t => !t.valley || !nearPillar(t.x, t.z, 1.2 + 1.1*t.s);
  inst(pineGeo(), new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, flatShading:true }), pines.map(t => ({ p:new V3(t.x,t.y,t.z), q:yawQ(rand()*6), s:new V3(t.s,t.s*(.9+rand()*.45),t.s), c:mixHex('#C4C8E4','#FFFFFF',rand()) })).filter((it,i) => clear(pines[i])), { cast:true, receive:true });
  pines.filter(t => t.valley && clear(t)).forEach(t => { addFrustum(t.x, t.z, t.y, t.y + 1.2*t.s, .17*t.s, .12*t.s, { stand:false }); addFrustum(t.x, t.z, t.y + .75*t.s, t.y + 3.6*t.s, .95*t.s, .05, { stand:false, ceil:false }); });
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, side:THREE.DoubleSide });
  grassMat.onBeforeCompile = sh => { sh.uniforms.gT = grassU.t; sh.uniforms.gGlow = grassU.glow;
    sh.vertexShader = 'uniform float gT;\nvarying float vTip;\n' + sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position); vTip = uv.y;
      vec4 root = instanceMatrix*vec4(0.,0.,0.,1.); float sway = sin(gT*1.1 + root.x*.23 + root.z*.17)*.6 + sin(gT*2.3 + root.x*.7 - root.z*.4)*.22;
      transformed.x += sway*uv.y*uv.y*.12; transformed.z += sway*uv.y*uv.y*.06;`);
    sh.fragmentShader = 'uniform float gGlow;\nvarying float vTip;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(.26,.34,.72)*smoothstep(.72,1.,vTip)*gGlow;'); };
  inst(grassGeo(), grassMat, grass.map(([x,y,z]) => ({ p:new V3(x, y - .03, z), q:yawQ(rand()*6.28), s:new V3(1, .7 + rand()*.7, 1).multiplyScalar(.75 + rand()*.6), c:mixHex('#B4C4F4','#E4D8FF', rand()) })).filter((it,i) => !nearPillar(grass[i][0], grass[i][2], .9)), { receive:true });
}

/* a few fireflies drifting over the meadows, blinking slowly; they keep their distance from the wanderer */
const WISP = 150, wispG = new THREE.BufferGeometry(), wispP = new Float32Array(WISP*3), wispPh = new Float32Array(WISP), wispV = [];
for (let i=0;i<WISP;i++){ const a=rand()*6.283, d=10+Math.sqrt(rand())*20; wispP.set([Math.sin(a)*d, .6+rand()*6, Math.cos(a)*d], i*3); wispPh[i] = rand()*40; wispV.push([rand()*6.28, .2+rand()*.5]); }
wispG.setAttribute('position', new THREE.BufferAttribute(wispP,3)); wispG.setAttribute('ph', new THREE.BufferAttribute(wispPh,1));
const wispMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, uniforms:{ t:{value:0}, glow:{value:.45}, scale:wispScale, hero:{value:new V3()} },
  vertexShader:`attribute float ph; uniform float t; uniform float scale; uniform vec3 hero; varying float vA; varying float vW;
    void main(){ float s = .5 + .5*sin(t*(.6 + fract(ph*.37)*1.1) + ph); vA = (.12 + .88*s*s*s)*smoothstep(3., 6., distance((modelMatrix*vec4(position,1.)).xyz, hero)); vW = fract(ph*.71);
      vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = (.5 + .3*vA)*scale/-mv.z; gl_Position = projectionMatrix*mv; }`,
  fragmentShader:`uniform float glow; varying float vA; varying float vW; void main(){ vec2 p = gl_PointCoord - .5; float a = exp(-dot(p,p)*28.)*vA*glow; vec3 c = mix(vec3(.55,.92,1.), vec3(.78,.66,1.), step(.55, vW)); gl_FragColor = vec4(c*a, a); }` });
const wisps = new THREE.Points(wispG, wispMat); wisps.frustumCulled = false; scene.add(wisps);
/* soft points of light: each pulses on its own rhythm, can drift, can keep clear of the wanderer, and brightens with the star's light */
const heroU = { value:new V3() }, lightPointMats = [];
function lightPoints(items, { size, near=0, drift=0, base=.6 }){
  const n = items.length, g = new THREE.BufferGeometry(), pos = new Float32Array(n*3), col = new Float32Array(n*3), ph = new Float32Array(n);
  items.forEach((o,i) => { pos.set([o.x,o.y,o.z], i*3); col.set([o.c.r,o.c.g,o.c.b], i*3); ph[i] = o.ph; });
  g.setAttribute('position', new THREE.BufferAttribute(pos,3)); g.setAttribute('col', new THREE.BufferAttribute(col,3)); g.setAttribute('ph', new THREE.BufferAttribute(ph,1));
  const mat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ t:{value:0}, glow:{value:.5}, scale:wispScale, hero:heroU, near:{value:near}, drift:{value:reduceMotion ? 0 : drift}, size:{value:size} },
    vertexShader:`attribute vec3 col; attribute float ph; uniform float t; uniform float glow; uniform float scale; uniform float near; uniform float drift; uniform float size; uniform vec3 hero;
      varying vec3 vC; varying float vA;
      void main(){ vec3 p = position + drift*vec3(sin(t*.13 + ph*6.3), sin(t*.09 + ph*9.1)*.5, cos(t*.11 + ph*4.7));
        float s = .5 + .5*sin(t*(.45 + fract(ph*3.7)*.9) + ph*40.); vA = (.3 + .7*s*s)*glow;
        if (near > 0.) vA *= smoothstep(near, near*2., distance((modelMatrix*vec4(p,1.)).xyz, hero));
        vC = col; vec4 mv = modelViewMatrix*vec4(p,1.); gl_PointSize = size*(.75 + .25*s)*scale/-mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord - .5; float d = dot(q,q); float a = (exp(-d*36.) + exp(-d*9.)*.3)*vA; gl_FragColor = vec4(vC*a, a); }` });
  const m = new THREE.Points(g, mat); m.frustumCulled = false; scene.add(m); mat.userData.base = base; lightPointMats.push(mat); return mat;
}
{ const sq = seq(71), palette = ['#7FE9F2','#8FA8FF','#B49CFF','#8FA8FF','#D8E2FF'].map(C), meadow = [], air = [];
  /* just above the grass tops, all across the meadow */
  for (let i=0; i<8000 && meadow.length<1300; i++){ const a = sq()*6.283, d = LAKE_BLOCK + .4 + sq()*(WORLD_R - LAKE_BLOCK), x = Math.cos(a)*d, z = Math.sin(a)*d, gy = groundH(x,z);
    if (gy < WATER_Y + .3 || (onPath(x,z) && Math.abs(x - Math.sin(z*.35)*.8) < 1.5)) continue;
    meadow.push({ x, y:gy + .55 + sq()*.6, z, c:palette[Math.floor(sq()*palette.length)], ph:sq() }); }
  /* higher up, drifting slowly across the valley */
  for (let i=0;i<420;i++){ const a = sq()*6.283, d = 3 + Math.sqrt(sq())*30, x = Math.cos(a)*d, z = Math.sin(a)*d;
    air.push({ x, y:Math.max(groundH(x,z), 0) + 1.6 + sq()*sq()*16, z, c:palette[Math.floor(sq()*palette.length)], ph:sq() }); }
  lightPoints(meadow, { size:.65, base:.85 }); lightPoints(air, { size:.85, near:3, drift:1.4, base:.7 });
  /* higher up, sparser: around the spiral stair as it climbs, and in the open air beneath the star */
  const sh = seq(83), high = [];
  for (let i=0;i<170;i++){ const a = sh()*6.283, d = 8 + sh()*8; high.push({ x:Math.cos(a)*d, y:5 + sh()*32, z:Math.sin(a)*d, c:palette[Math.floor(sh()*palette.length)], ph:sh() }); }
  for (let i=0;i<260;i++){ const a = sh()*6.283, d = Math.sqrt(sh())*34; high.push({ x:Math.cos(a)*d, y:16 + sh()*40, z:Math.sin(a)*d, c:palette[Math.floor(sh()*palette.length)], ph:sh() }); }
  lightPoints(high, { size:1.05, near:3, drift:2.2, base:.65 }); }
const MIST = 26; const mists = []; for (let i=0;i<MIST;i++){ const a=rand()*6.283, d=10+rand()*20; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:softTex, color:0x4A4E8E, transparent:true, opacity:.11, depthWrite:false }));
  s.position.set(Math.sin(a)*d, groundH(Math.sin(a)*d, Math.cos(a)*d)+1.2, Math.cos(a)*d); s.scale.set(16,4,1); scene.add(s); mists.push({ s, a, d, sp:(rand()-.5)*.02 }); }

/* ---------- the star (the Oracle) and its column of light down to the lake ---------- */
const oracle = createOracle(scene, { y:ORACLE_Y, main:MAIN, reduceMotion });
const oracleState = { energy:0, target:0, eye:0, eyeTarget:0 };
const beamVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }';
const beamFrag = `uniform float t; uniform float fade; uniform float rep; uniform vec3 col; varying vec2 vUv;
  void main(){ float f = smoothstep(0.,.1,vUv.y)*smoothstep(1.,.8,vUv.y); float s = .55 + .45*sin(vUv.y*rep - t*4.); float a = f*s*fade; gl_FragColor = vec4(col*a, a); }`;
const columnMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false,
  uniforms:{ t:{value:0}, fade:{value:.1}, rep:{value:40}, col:{value:C('#9FE8FF')} }, vertexShader:beamVert, fragmentShader:beamFrag });
{ const h = ORACLE_Y - 3 - WATER_Y; const col = new THREE.Mesh(new THREE.CylinderGeometry(.3, 1.2, h, 24, 1, true), columnMat); col.position.y = WATER_Y + h/2; scene.add(col); }
const beamMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false,
  uniforms:{ t:{value:0}, fade:{value:0}, rep:{value:30}, col:{value:C('#BFF6FF')} }, vertexShader:beamVert, fragmentShader:beamFrag });
const beam = new THREE.Mesh(new THREE.CylinderGeometry(.12,.45,1,12,1,true), beamMat); beam.visible = false; scene.add(beam);
let beamState = { life:0, relic:null };
function beamTo(r){ beamState = { life:3.2, relic:r }; beamMat.uniforms.col.value.set(r.color).lerp(C('#FFFFFF'), .4); beam.visible = true; oracleState.eyeTarget = 1; }

/* ---------- the skill constellation ---------- */
const starLabels = document.createElement('div'); starLabels.id = 'starLabels'; document.body.appendChild(starLabels);
const sky = createConstellation(scene, { skills:SKILLS, relics:RELICS, labelsEl:starLabels, reduceMotion });

/* ---------- relics ---------- */
const sealMatBase = new THREE.MeshBasicMaterial({ map:runeTex, transparent:true, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending });
const hitMat = new THREE.MeshBasicMaterial({ visible:false });
RELICS.forEach(r => {
  r.group = new THREE.Group(); scene.add(r.group); r.model = buildForm(r); r.group.add(r.model);
  r.seal = new THREE.Group(); r.group.add(r.seal);
  [[1.55,.0],[1.75,1.1],[1.4,-1.0]].forEach(([R,tilt],i) => { const m = sealMatBase.clone(); m.color = C(r.color).lerp(C('#FFFFFF'), .25); m.opacity = .85;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R,R,.34,9,1,true), m); band.rotation.set(tilt,0,tilt*.6); band.userData.spd = (i%2 ? -1 : 1)*(.6+i*.25); r.seal.add(band); });
  r.free = new THREE.Mesh(new THREE.TorusGeometry(1.7,.025,4,12), new THREE.MeshBasicMaterial({ color:0xE2BE7A, transparent:true, opacity:.7 })); r.free.rotation.x = Math.PI/2; r.free.visible = false; r.group.add(r.free);
  r.hit = new THREE.Mesh(new THREE.SphereGeometry(2.1,10,8), hitMat); r.hit.userData.relic = r; r.group.add(r.hit); pickables.push(r.hit);
  r.pos = new V3(); r.state = r.secret ? 'hidden' : 'orbit'; r.discovered = false; r.t = 0; r.openK = 0; r.group.visible = !r.secret;
});
function orbitPos(r, out){ const o = r.orbit, a = o.phase + T*o.speed; return out.set(Math.cos(a)*o.R, o.y + Math.sin(T*.5 + o.phase*3)*.9, Math.sin(a)*o.R); }

/* bursts */
const bursts = [];
function burst(pos, color, n=70, power=1){
  const g = new THREE.BufferGeometry(), p = new Float32Array(n*3), v = [];
  for (let i=0;i<n;i++){ p.set([pos.x,pos.y,pos.z], i*3); v.push(randUnit().multiplyScalar((3+rand()*7)*power)); }
  g.setAttribute('position', new THREE.BufferAttribute(p,3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map:softTex, size:.45*Math.sqrt(power), color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })); pts.frustumCulled = false; scene.add(pts);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.9,1.1,48), new THREE.MeshBasicMaterial({ color, transparent:true, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending }));
  ring.position.copy(pos); ring.lookAt(camera.position); ring.scale.setScalar(power); scene.add(ring);
  bursts.push({ pts, v, life:1.4, ring, power });
}

/* ---------- the wanderer ---------- */
const H = buildHero(scene), hero = H.root;

/* ---------- player ---------- */
const P = { pos:new V3(0,0,21.5), vel:new V3(), onGround:true, facing:Math.PI, target:null, flight:null, walk:0, speed:0, draw:0, drawing:false, auto:null,
  energy:1, flying:false, soared:false, jumpT:-9, stall:0 };
P.pos.y = groundH(P.pos.x, P.pos.z);
const SPEED = 7, GRAV = 26, JUMP = 9.6, STEP_UP = .6, ASCEND = 7.5, CEILING = 47, AIR_R = 33, FLY_SECONDS = 7.5, BODY_R = .32, HEAD = 1.7;
function jumpPress(){ if (P.flight) return; skipIntro(); if (P.onGround){ P.vel.y = JUMP; P.onGround = false; P.jumpT = T; } else P.jumpT = T - 1; }
function supportAt(x,z,y){ return floorAt(x, z, y, STEP_UP, groundH(x,z)); }
function flyTo(dest){ const from = P.pos.clone(), dist = from.distanceTo(dest); P.flight = { from, to:dest.clone(), t:0, dur:Math.min(3.6, Math.max(1.2, dist/12)), arc:2 + dist*.12 }; P.target = null; P.vel.set(0,0,0); }

/* ---------- arrows: guided arrows fly to their relic; drawn arrows stick in whatever they meet ---------- */
const arrows = [];
const arrowShaft = new THREE.CylinderGeometry(.018,.018,1,5).rotateX(Math.PI/2);
const fletchGeo = new THREE.ConeGeometry(.05,.14,3).rotateX(-Math.PI/2).translate(0,0,-.46);
function bowWorld(){ return hero.localToWorld(H.bow.position.clone()); }
function fireArrow(from, dir, speed, target){
  const g = new THREE.Group(); const sh = new THREE.Mesh(arrowShaft, new THREE.MeshBasicMaterial({ color:0xE8F8FF })); g.add(sh); g.add(new THREE.Mesh(fletchGeo, new THREE.MeshBasicMaterial({ color:0x78E6F0 })));
  const tipS = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x9FF2FF, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })); tipS.position.z = .5; tipS.scale.set(.9,.9,1); g.add(tipS);
  const TL = 14, tg = new THREE.BufferGeometry(), tp = new Float32Array(TL*3); for (let i=0;i<TL;i++) tp.set([from.x,from.y,from.z], i*3); tg.setAttribute('position', new THREE.BufferAttribute(tp,3));
  const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color:0x9FF2FF, transparent:true, opacity:.7, blending:THREE.AdditiveBlending, depthWrite:false })); trail.frustumCulled = false; scene.add(trail);
  g.position.copy(from); scene.add(g); arrows.push({ g, tipS, trail, pos:from.clone(), vel:dir.clone().normalize().multiplyScalar(speed), target, life: target ? 4 : 3.2, stuck:false, age:0 });
}
const aPrev = new V3(), aSeg = new V3(), aTip = new V3(), aDir = new V3();
/* first point along the segment where the arrow's tip enters something solid or the ground; null if it flies clear */
function arrowImpact(from, to){
  aSeg.subVectors(to, from); const len = aSeg.length(); if (len < 1e-5) return null; aDir.copy(aSeg).divideScalar(len);
  const n = Math.ceil(len/.18);
  for (let k=1;k<=n;k++){ aTip.copy(from).addScaledVector(aSeg, k/n).addScaledVector(aDir, .5);
    if (solidAt(aTip) || (aTip.y < groundH(aTip.x, aTip.z) + .02 && Math.hypot(aTip.x, aTip.z) < 64)) return aPrev.copy(from).addScaledVector(aSeg, k/n); }
  return null;
}
function updateArrows(dt){
  for (let i = arrows.length-1; i >= 0; i--){
    const a = arrows[i]; a.life -= dt; a.age += dt;
    if (!a.stuck){
      if (a.target){ const want = a.target.pos.clone().sub(a.pos); const d = want.length(); want.normalize().multiplyScalar(Math.max(50, a.vel.length())); a.vel.lerp(want, Math.min(1, dt*(6 + a.age*10))); if (d < 1.2 || a.age > 2.5){ hitRelic(a.target, a.pos); a.life = 0; } }
      else a.vel.y -= 6*dt;
      const from = a.pos.clone(); a.pos.addScaledVector(a.vel, dt);
      if (!a.target){ for (const r of RELICS){ if ((r.state === 'orbit') && r.group.visible && a.pos.distanceTo(r.pos) < 1.9){ hitRelic(r, a.pos); a.life = 0; break; } } }
      if (!a.target && a.life > 0){ const hit = arrowImpact(from, a.pos);
        if (hit){ a.pos.copy(hit); a.stuck = true; a.life = Math.min(a.life + 4, 7); a.tipS.material.opacity = .5; burst(aTip.clone(), C('#9FF2FF'), 14, .25); } }
      a.g.position.copy(a.pos); a.g.quaternion.setFromUnitVectors(ZAX, a.vel.clone().normalize());
      const tp = a.trail.geometry.attributes.position.array; tp.copyWithin(3, 0, tp.length-3); tp[0]=a.pos.x; tp[1]=a.pos.y; tp[2]=a.pos.z; a.trail.geometry.attributes.position.needsUpdate = true;
    } else a.tipS.material.opacity = Math.max(0, Math.min(.5, a.life*.3));
    a.trail.material.opacity = a.stuck ? Math.max(0, a.trail.material.opacity - dt*2) : Math.max(0, Math.min(.7, a.life*.5));
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
  hideCard();
}
function summon(r){ if (r.state === 'hidden'){ oracleSay(r.secret ? LINES.asleep : ''); return; } beamTo(r); setTimeout(() => { burst(r.pos.clone(), C(r.color)); bringDown(r); }, reduceMotion ? 0 : 650); }
function sendBack(r){ if (!r || (r.state !== 'open' && r.state !== 'falling')) return; r.state = 'rising'; r.t = 0; r.from = r.pos.clone(); if (openRelic === r){ openRelic = null; if (cardFor === r) hideCard(); } }

/* the first time a relic is opened its light flies back to the star, the star grows a ray, its stars wake and the valley brightens */
const world = { light:0, target:0, dawn:0, dawnTarget:0, finale:false };
function returnLight(r){
  if (r.lightSent) return; r.lightSent = true;
  oracle.sendLight(r.pos.clone(), r.color, () => {
    r.lightGiven = true; const fresh = sky.lightRelic(r.id);
    if (r.secret){ oracle.ripple(r.color, 50); if (fresh.length) showToast(LINES.hiddenStars(fresh.length)); }
    else { oracle.receive(r); const n = MAIN.filter(x => x.lightGiven).length; world.target = n/MAIN.length; showToast(LINES.lightBack(n, fresh.length)); if (n === MAIN.length) finale(); }
    updateTracker();
  });
}
function finale(){
  if (world.finale) return; world.finale = true; world.dawnTarget = 1; oracle.bloom();
  setTimeout(() => { oracleSay(LINES.finale); renderCard(FINALE, false, true); }, reduceMotion ? 0 : 2200);
}
const tmpV = new V3();
function updateRelics(dt){
  RELICS.forEach(r => {
    switch (r.state){
      case 'hidden': break;
      case 'waking': r.t += dt/4; orbitPos(r, tmpV); r.pos.lerpVectors(r.from, tmpV, ease(Math.min(1,r.t))); if (r.t >= 1) r.state = 'orbit'; break;
      case 'orbit': orbitPos(r, r.pos); break;
      case 'falling': { r.t += dt/2.3; const e = ease(Math.min(1, r.t)); r.pos.lerpVectors(r.from, r.to, e); const sw = (1-e)*2.2; r.pos.x += Math.cos(e*7)*sw; r.pos.z += Math.sin(e*7)*sw;
        if (r.t >= 1){ r.state = 'open'; if (!r.discovered){ r.discovered = true; updateTracker(); } showRelicCard(r); returnLight(r); } break; }
      case 'open': r.pos.copy(r.to); r.pos.y += Math.sin(T*1.4)*.12; if (P.pos.distanceTo(r.to) > 16) sendBack(r); break;
      case 'rising': r.t += dt/2.2; orbitPos(r, tmpV); r.pos.lerpVectors(r.from, tmpV, ease(Math.min(1, r.t))); if (r.t >= 1) r.state = 'orbit'; break;
    }
    r.group.position.copy(r.pos);
    const near = r.state === 'open' || r.state === 'falling';
    r.model.rotation.y += dt*(near ? .45 : .3);
    r.openK += ((r.state === 'open' ? 1 : 0) - r.openK)*(1 - Math.exp(-dt*(reduceMotion ? 30 : 1.8)));
    r.model.userData.tick(dt, T, ease(Math.min(1, r.openK)));
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
  if (/^(Arrow|Key[WASD])/.test(e.code)){ e.preventDefault(); skipIntro(); if (gaze) setGaze(false); }
  if (e.code === 'KeyF') setMode(mode === 'aim' ? 'auto' : 'aim');
  if (e.code === 'KeyC' && !e.repeat) setGaze(!gaze);
  if (e.code === 'Escape'){ indexEl.hidden = true; if (gaze) setGaze(false); if (openRelic) sendBack(openRelic); if (P.drawing){ P.drawing = false; } }
  const d = /^Digit([1-7])$/.exec(e.code); if (d){ const r = RELICS.find(x => x.key === +d[1]); if (r) summon(r); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; P.drawing = false; });
const camS = { yaw:0, pitch:-.12, dist:9 };
let drag = null, pointer = null; const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); skipIntro();
  drag = { x:e.clientX, y:e.clientY, moved:false, button:e.button };
  if (mode === 'aim' && e.button === 0){ P.drawing = true; P.draw = 0; } });
canvas.addEventListener('pointermove', e => { pointer = { x:e.clientX, y:e.clientY, dirty:true }; if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx,dy) > 6){ drag.moved = true; if (mode !== 'aim') canvas.classList.add('dragging'); }
  if (drag.moved || mode === 'aim'){ const k = mode === 'aim' ? .0032 : .0055; camS.yaw -= dx*k; camS.pitch = Math.min(gaze ? 1.5 : 1.32, Math.max(-.62, camS.pitch - dy*k*.8)); drag.x = e.clientX; drag.y = e.clientY; gazeT = 9; } });
canvas.addEventListener('pointerleave', () => { pointer = null; });
canvas.addEventListener('pointerup', e => { if (!drag) return; const was = drag.moved; drag = null; canvas.classList.remove('dragging');
  if (mode === 'aim'){ if (P.drawing){ P.drawing = false; if (P.draw > .12) fireManual(); else P.draw = 0; } return; }
  if (!was) clickAt(e.clientX, e.clientY); });
canvas.addEventListener('pointercancel', () => { drag = null; P.drawing = false; canvas.classList.remove('dragging'); });
canvas.addEventListener('wheel', e => { e.preventDefault(); camS.dist = Math.min(20, Math.max(4, camS.dist*(1 + e.deltaY*.0011))); }, { passive:false });
function clickAt(cx, cy){
  ndc.set(cx/innerWidth*2-1, -(cy/innerHeight)*2+1); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(pickables.concat(sky.hits), false); if (!hits.length) return;
  const relicHit = hits.find(h => h.object.userData.relic && h.object.parent.visible);
  if (relicHit){ const r = relicHit.object.userData.relic; if (r.state === 'open' || r.state === 'falling') showRelicCard(r); else if (r.state === 'orbit' || r.state === 'rising') autoShoot(r); return; }
  const h = hits.find(x => !x.object.userData.relic); if (!h) return;
  if (h.object.userData.star){ touchStar(h.object.userData.star); return; }
  if (h.object.userData.perch){ flyTo(h.object.userData.perch); return; }
  const p = h.point.clone(); if (Math.abs(p.y - P.pos.y) > 2.4) flyTo(p); else P.target = p;
}
/* which star the pointer is over, if any (checked once per frame) */
let hoverStar = null;
function updateHover(){
  if (!pointer || !pointer.dirty || drag) return; pointer.dirty = false;
  ndc.set(pointer.x/innerWidth*2-1, -(pointer.y/innerHeight)*2+1); ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(sky.hits, false)[0]; hoverStar = h ? h.object.userData.star : null; canvas.classList.toggle('pointing', !!hoverStar && mode !== 'aim');
}
/* a star touched (or a skill named in the chat): the Oracle says which relics use it */
function touchStar(s, asked){
  sky.pulse(s); addMsg('you', asked || `✦ ${s.skill.name}`);
  if (s.relics.every(id => byId[id].state === 'hidden')){ oracleSay(LINES.asleep); return; }
  if (s.lit < .5 && !asked){ oracleSay(LINES.darkStar); return; }
  const used = s.relics.filter(id => id !== 'signal').map(id => byId[id]).filter(r => !r.secret || r.state !== 'hidden');
  oracleSay(starLine(s.skill, used.map(r => r.name), used.filter(r => !r.discovered).length));
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
  if (m === 'aim'){ if (gaze) setGaze(false); if (camS.pitch < .25) camS.pitch = .35; } }
document.getElementById('modeAuto').addEventListener('click', () => setMode('auto'));
document.getElementById('modeAim').addEventListener('click', () => setMode('aim'));
const hintEl = document.getElementById('hint');
function renderHint(){ hintEl.innerHTML = mode === 'aim'
  ? '<kbd>Hold</kbd> draw · drag aim · release shoot<br>draw in the air to hover · <kbd>F</kbd> auto'
  : '<kbd>Space</kbd> jump, hold to fly · <kbd>Shift</kbd> dive<br>drag look · click a relic · <kbd>1</kbd>–<kbd>6</kbd> · <kbd>C</kbd> stars'; }
renderHint();

/* looking up at the constellation: the camera tilts to the sky and every lit star is labelled */
let gaze = false, gazeT = 0, gazePitch = -.12;
const lookBtn = document.getElementById('lookUp');
function setGaze(on){ if (on === gaze) return; gaze = on; skipIntro(); gazeT = 0;
  if (on){ gazePitch = camS.pitch; if (mode === 'aim') setMode('auto'); } else camS.pitch = Math.min(camS.pitch, gazePitch > .6 ? .2 : gazePitch);
  lookBtn.setAttribute('aria-pressed', on); lookBtn.textContent = on ? 'Back down · C' : 'Look up · C'; }
lookBtn.addEventListener('click', () => setGaze(!gaze));

/* ---------- camera ---------- */
let intro = reduceMotion ? null : { t:0, dur:6.5, from:new V3(5, 5, 36), look:new V3(0, ORACLE_Y-4, 0) };
function skipIntro(){ if (intro && intro.t < intro.dur - 1.1) intro.t = intro.dur - 1.1; }
const camPos = new V3(), camLook = new V3(), wantPos = new V3(), wantLook = new V3();
function followPose(){
  const aim = mode === 'aim';
  const head = P.pos.clone().add(new V3(0, 1.55, 0));
  const L = new V3(-Math.sin(camS.yaw)*Math.cos(camS.pitch), Math.sin(camS.pitch), -Math.cos(camS.yaw)*Math.cos(camS.pitch));
  /* looking up only tilts the view: the camera itself stays behind the wanderer instead of sinking under them */
  const pp = Math.min(camS.pitch, .28), Lp = new V3(-Math.sin(camS.yaw)*Math.cos(pp), Math.sin(pp), -Math.cos(camS.yaw)*Math.cos(pp));
  const right = new V3(Math.cos(camS.yaw), 0, -Math.sin(camS.yaw));
  const pivot = head.clone().addScaledVector(right, aim ? 1.05 : 0).add(new V3(0, aim ? .45 : .2, 0));
  const dist = aim ? 4.4 : gaze ? Math.min(camS.dist, 6) : camS.dist;
  let d = dist; for (let k=0;k<12;k++){ const p = pivot.clone().addScaledVector(Lp, -d); const g = groundH(p.x,p.z); if (p.y > g + .35 && Math.hypot(p.x,p.z) < 42) break; d *= .82; }
  wantPos.copy(pivot).addScaledVector(Lp, -d);
  if (wantPos.y < groundH(wantPos.x, wantPos.z) + .3) wantPos.y = groundH(wantPos.x, wantPos.z) + .3;
  wantLook.copy(pivot).addScaledVector(L, 30);
}
followPose(); camPos.copy(intro ? intro.from : wantPos); camLook.copy(intro ? intro.look : wantLook);
function updateCamera(dt){
  if (gaze && gazeT < 2.5){ gazeT += dt; camS.pitch = lerp(camS.pitch, 1.42, 1 - Math.exp(-dt*(reduceMotion ? 30 : 2.6))); }
  followPose();
  if (intro){ intro.t += dt; const e = ease(Math.min(1, Math.max(0, (intro.t-1.6)/(intro.dur-1.6))));
    camPos.lerpVectors(intro.from, wantPos, e); camLook.lerpVectors(intro.look, wantLook, e); if (intro.t >= intro.dur){ intro = null; welcome(); } }
  else { const k = 1 - Math.exp(-dt*(mode === 'aim' ? 14 : 7)); camPos.lerp(wantPos, k); camLook.lerp(wantLook, 1 - Math.exp(-dt*(mode === 'aim' ? 20 : 10))); }
  camera.position.copy(camPos); camera.lookAt(camLook); skyGroup.position.copy(camera.position);
  const fov = mode === 'aim' ? baseFov - 6 - P.draw*12 : gaze ? baseFov + 14 : baseFov; if (Math.abs(camera.fov - fov) > .05){ camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt*8)); camera.updateProjectionMatrix(); }
}

/* ---------- simulation ---------- */
const pushP = { x:0, z:0 };
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
  /* walls: anything taller than a step between the feet and the head pushes the body back out */
  pushP.x = nx; pushP.z = nz; if (pushOut(pushP, P.pos.y + STEP_UP, P.pos.y + HEAD, BODY_R)){ nx = pushP.x; nz = pushP.z; }
  const moved = Math.hypot(nx - P.pos.x, nz - P.pos.z);
  if (P.target && moved < spd*dt*.25){ if ((P.stall += dt) > .5){ P.target = null; P.stall = 0; } } else P.stall = 0;
  const dive = keys.ShiftLeft || keys.ShiftRight;
  P.flying = !!keys.Space && !P.onGround && (T - P.jumpT > .2) && P.energy > .005;
  if (P.flying){ P.soared = true; P.vel.y = lerp(P.vel.y, ASCEND, 1 - Math.exp(-dt*5)); P.energy = Math.max(0, P.energy - dt/FLY_SECONDS); }
  else {
    P.vel.y -= GRAV*dt*(dive ? 1.6 : 1);
    if (!P.onGround && !dive){ if (mode === 'aim' && P.drawing) P.vel.y = Math.max(P.vel.y, -1.1); else if (P.soared) P.vel.y = Math.max(P.vel.y, -5); }
  }
  let ny = P.pos.y + P.vel.y*dt;
  /* ceilings: platform undersides stop the head */
  if (P.vel.y > 0){ const ceil = ceilingAt(nx, nz, P.pos.y + HEAD); if (ny + HEAD > ceil){ ny = Math.max(P.pos.y, ceil - HEAD); P.vel.y = 0; } }
  const sup = supportAt(nx, nz, P.pos.y);
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
  hero.position.copy(P.pos); hero.rotation.y = P.facing; hero.updateMatrixWorld();
  const moving = Math.min(1, P.speed/SPEED); P.walk += dt*P.speed*1.9;
  const airborne = P.flying || (P.soared && !P.onGround), aiming = mode === 'aim' || !!P.auto || P.draw > 0;
  const pitch = mode === 'aim' ? camS.pitch : (P.auto ? Math.atan2(P.auto.r.pos.y - P.pos.y - 1.2, Math.hypot(P.auto.r.pos.x-P.pos.x, P.auto.r.pos.z-P.pos.z)) : 0);
  animateHero(H, { dt, T, walk:P.walk, moving, onGround:P.onGround, airborne, flying:P.flying, flight:!!P.flight, aiming, pitch, draw:P.draw, vel:P.vel, lantern:1.7 + (1 - world.light)*.6 });
}
let litCount = 0;
const hemiSky = [C('#34407A'), C('#4A4E98')], fogCol = [C('#0A0E22'), C('#10142E'), C('#1A1636')], oracleCol = [C('#9FE8FF'), C('#D6CCFF')], tmpCol = new THREE.Color();
function updateWorld(dt){
  oracleState.energy = lerp(oracleState.energy, oracleState.target, 1 - Math.exp(-dt*3));
  oracleState.eye = lerp(oracleState.eye, Math.max(oracleState.eyeTarget, oracleState.target*.8), 1 - Math.exp(-dt*(oracleState.eyeTarget ? 6 : 2)));
  /* the valley's light follows how much of the star's light has come back */
  world.light = lerp(world.light, world.target, 1 - Math.exp(-dt*(reduceMotion ? 30 : .7))); world.dawn = lerp(world.dawn, world.dawnTarget, 1 - Math.exp(-dt*(reduceMotion ? 30 : .35)));
  const L = world.light, D = world.dawn, ey = oracleState.eye;
  oracle.update(dt, T, { power:L, speak:Math.max(oracleState.energy, ey*.8) });
  oracle.light.intensity = lerp(.85, 1.6, L) + ey*.4 + D*.15; oracle.light.color.copy(oracleCol[0]).lerp(oracleCol[1], L*.55 + D*.2); oracle.light.distance = lerp(140, 200, L);
  hemi.intensity = lerp(.1, .27, L) + D*.05; hemi.color.copy(hemiSky[0]).lerp(hemiSky[1], L);
  moon.intensity = lerp(.06, .2, L) + D*.04;
  scene.fog.color.copy(fogCol[0]).lerp(fogCol[1], L).lerp(fogCol[2], D*.4); scene.fog.near = lerp(14, 26, L); scene.fog.far = lerp(95, 150, L);
  skyMat.uniforms.glow.value = L; skyMat.uniforms.dawn.value = D;
  columnMat.uniforms.t.value = T; columnMat.uniforms.fade.value = .1 + ey*.25 + L*.12; lakeMat.uniforms.t.value = T; lakeMat.uniforms.energy.value = ey; lakeMat.uniforms.glow.value = L; fallMat.uniforms.t.value = T; beamMat.uniforms.t.value = T;
  if (beamState.life > 0){ beamState.life -= dt; const from = oracle.position.clone(), to = beamState.relic.pos.clone(); const dir = to.clone().sub(from), len = dir.length(); dir.normalize();
    beam.scale.set(1,len,1); beam.position.copy(from).addScaledVector(dir, len/2); beam.quaternion.setFromUnitVectors(UP, dir.clone().negate());
    beamMat.uniforms.rep.value = len/1.5; beamMat.uniforms.fade.value = Math.min(1, beamState.life/.8)*Math.min(1,(3.2-beamState.life)/.25)*1.3;
    if (beamState.life <= 0){ beam.visible = false; oracleState.eyeTarget = 0; } }
  wispMat.uniforms.t.value = T; wispMat.uniforms.glow.value = .45 + L*.55; wispMat.uniforms.hero.value.copy(P.pos); heroU.value.copy(P.pos); starU.t.value = T; starU.glow.value = L;
  bandMat.opacity = .5 + L*.35 + Math.sin(T*1.3)*.05;
  lightPointMats.forEach(m => { m.uniforms.t.value = T; m.uniforms.glow.value = m.userData.base + L*(1 - m.userData.base); }); grassU.t.value = reduceMotion ? 0 : T; grassU.glow.value = .08 + L*.3;
  if (!reduceMotion){ const wp = wispG.attributes.position.array; for (let i=0;i<WISP;i++){ const v = wispV[i]; wp[i*3] += Math.sin(T*v[1] + v[0])*dt*.4; wp[i*3+1] += Math.cos(T*v[1]*.7 + v[0])*dt*.25; wp[i*3+2] += Math.cos(T*v[1] + v[0]*2)*dt*.4; } wispG.attributes.position.needsUpdate = true; }
  mists.forEach(m => { m.a += m.sp*dt; m.s.position.x = Math.sin(m.a)*m.d; m.s.position.z = Math.cos(m.a)*m.d; });
  for (let i = bursts.length-1; i >= 0; i--){ const b = bursts[i]; b.life -= dt; const p = b.pts.geometry.attributes.position.array;
    b.v.forEach((v,k) => { v.multiplyScalar(1 - dt*1.6); p[k*3] += v.x*dt; p[k*3+1] += v.y*dt; p[k*3+2] += v.z*dt; }); b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, b.life/1.4); b.ring.scale.setScalar((1 + (1.4-b.life)*4)*b.power); b.ring.material.opacity = Math.max(0, b.life/1.4)*.9;
    if (b.life <= 0){ scene.remove(b.pts); scene.remove(b.ring); b.pts.geometry.dispose(); bursts.splice(i,1); } }
  braziers.forEach(b => { if (!b.lit && !P.flight && Math.hypot(P.pos.x-b.pos.x, P.pos.z-b.pos.z) < 2.8 && Math.abs(P.pos.y - b.top) < 2){ b.lit = true; litCount++; updateTracker();
      showToast(litCount < 4 ? `Brazier lit · ${litCount} of 4` : 'All four braziers burn. Something stirs in the lake.'); if (litCount === 4) wakeSecret(); }
    b.fire.material.opacity = b.lit ? .75 + Math.sin(T*9 + b.top)*.15 : 0; b.flame.material.opacity = b.lit ? .9 : 0; b.flame.scale.y = b.lit ? 1 + Math.sin(T*12 + b.top)*.15 : 1;
    b.light.intensity = b.lit ? 1.2 + Math.sin(T*9 + b.top)*.2 : 0; });
}
function wakeSecret(){ const r = byId.offclock; r.state = 'waking'; r.t = 0; r.from = new V3(0, -3, 0); r.pos.copy(r.from); r.group.visible = true; beamTo(r);
  oracleSay(LINES.woke); }

/* ---------- UI ---------- */
const labelsEl = document.getElementById('labels');
RELICS.forEach(r => { const d = document.createElement('div'); d.className = 'plabel'; d.innerHTML = `<kbd>${r.key}</kbd><b>${r.name}</b>`; labelsEl.appendChild(d); r.label = d; });
const pv = new V3();
function updateLabels(){ const w = innerWidth, h = innerHeight;
  RELICS.forEach(r => { const show = (r.state === 'orbit' || r.state === 'rising' || r.state === 'waking') && r.group.visible && mode !== 'aim' && !gaze;
    if (!show){ r.label.style.visibility = 'hidden'; return; }
    pv.copy(r.pos); pv.y += 2.4; const d = camera.position.distanceTo(pv); pv.project(camera);
    if (pv.z > 1 || Math.abs(pv.x) > 1.1 || Math.abs(pv.y) > 1.1){ r.label.style.visibility = 'hidden'; return; }
    r.label.style.visibility = 'visible'; r.label.style.opacity = Math.min(1, Math.max(.3, (80-d)/40));
    r.label.style.transform = `translate(${((pv.x*.5+.5)*w).toFixed(1)}px,${((-pv.y*.5+.5)*h).toFixed(1)}px) translate(-50%,-100%)`; }); }
const relicList = document.getElementById('relicList'), relicCount = document.getElementById('relicCount'), starCount = document.getElementById('starCount');
RELICS.forEach(r => { const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.addEventListener('click', () => summon(r)); li.appendChild(b); relicList.appendChild(li); r.row = b; });
function updateTracker(){
  RELICS.forEach(r => { const hiddenNow = r.state === 'hidden';
    r.row.className = (r.discovered ? 'open' : '') + (r.secret && hiddenNow ? ' secret' : '');
    r.row.style.color = r.color;
    r.row.innerHTML = `<kbd>${r.key}</kbd><span class="gem" style="background:${r.color};color:${r.color}"></span><span class="nm" style="color:var(--text)">${r.secret && hiddenNow ? '???' : r.name}</span><span class="st">${r.secret && hiddenNow ? `${litCount}/4 fires` : r.discovered ? 'opened' : 'sealed'}</span>`;
    r.row.title = r.secret && hiddenNow ? 'Light the four braziers on the stairs' : `Summon ${r.name}`; });
  relicCount.textContent = `${MAIN.filter(r => r.discovered).length} / ${MAIN.length}`;
  const known = sky.stars.filter(s => s.relics.some(id => !byId[id].secret || byId[id].state !== 'hidden'));
  starCount.textContent = `${known.filter(s => s.on).length} / ${known.length}`;
}
updateTracker();
const card = document.getElementById('card');
let cardFor = null;
function hideCard(){ card.hidden = true; cardFor = null; }
function renderCard(o, isRelic, withLinks){
  card.innerHTML = `<button class="x" type="button" aria-label="Close">×</button>
    <div class="kicker"><span class="gem" style="background:${o.color};color:${o.color}"></span>${o.kicker}</div>
    <h2>${o.title || o.name}</h2>${o.meta ? `<div class="meta">${o.meta}</div>` : ''}<p>${o.body}</p>
    ${o.tags.length ? `<div class="tags">${o.tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
    <div class="row">${withLinks ? '' : '<button class="pill ask-about" type="button">Ask the Oracle</button>'}${isRelic ? '<button class="pill back" type="button">Release it</button>' : ''}</div>`;
  if (withLinks){ const row = card.querySelector('.row'); document.querySelectorAll('.links a').forEach(a => { const c = a.cloneNode(true); c.classList.add('pill'); if (a.classList.contains('primary')) c.classList.add('gold');
    if (c.dataset.placeholder) c.addEventListener('click', e => { e.preventDefault(); showToast(`${c.dataset.placeholder} link goes here in the real site`); }); row.appendChild(c); }); }
  card.querySelector('.x').addEventListener('click', () => { if (isRelic) sendBack(o); else hideCard(); });
  const askBtn = card.querySelector('.ask-about'); if (askBtn) askBtn.addEventListener('click', () => ask(o.id === 'about' ? 'Who is Austin?' : o.id === 'signal' ? 'What are his skills?' : `Tell me about ${o.name}`));
  if (isRelic) card.querySelector('.back').addEventListener('click', () => sendBack(o));
  card.hidden = false; card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; cardFor = o;
}
function showRelicCard(r){ renderCard(r, true); }
/* the introduction lives behind Austin's name in the top bar, and opens once on arrival */
function showAbout(){ if (openRelic) sendBack(openRelic); renderCard(ABOUT, false); }
document.getElementById('brand').addEventListener('click', () => cardFor === ABOUT && !card.hidden ? hideCard() : showAbout());
let welcomed = false;
function welcome(){ if (welcomed) return; welcomed = true; if (!cardFor && !openRelic) renderCard(ABOUT, false); }
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
function showToast(t){ toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => toastEl.hidden = true, 3200); }

/* ---------- the Oracle's voice (scripted for the prototype) ---------- */
function match(q){ const s = q.toLowerCase(); return INTENTS.find(it => it.k.some(k => /^[a-z]+$/.test(k) && k.length <= 3 ? new RegExp(`\\b${k}\\b`).test(s) : s.includes(k))) || FALLBACK; }
const logEl = document.getElementById('log'), eyeEl = document.getElementById('eye');
function addMsg(who, text){ const d = document.createElement('div'); d.className = 'msg ' + who; if (who === 'oracle') d.innerHTML = '<span class="who">The Oracle</span><span class="txt"></span>'; else d.textContent = text;
  logEl.appendChild(d); while (logEl.children.length > 8) logEl.firstChild.remove(); logEl.scrollTop = logEl.scrollHeight; return d; }
function oracleSay(text){ if (!text) return; const d = addMsg('oracle'), span = d.querySelector('.txt'); oracleState.target = 1; eyeEl.classList.add('busy'); oracle.speakPulse(); let i = 0;
  const done = () => { span.textContent = text; oracleState.target = 0; eyeEl.classList.remove('busy'); logEl.scrollTop = logEl.scrollHeight; };
  if (reduceMotion){ done(); return; }
  const step = () => { i += 2 + Math.floor(Math.random()*2); span.textContent = text.slice(0,i); logEl.scrollTop = logEl.scrollHeight; if (i < text.length) setTimeout(step, 16); else done(); }; setTimeout(step, 480); }
const RELIC_WORDS = RELICS.map(r => r.name.toLowerCase());
function ask(q){ q = q.trim(); if (!q) return;
  /* a skill named without a relic: answer from the constellation */
  const st = sky.find(q); if (st && !RELIC_WORDS.some(w => q.toLowerCase().includes(w))){ touchStar(st, q); return; }
  addMsg('you', q); const it = match(q); const r = it.to ? byId[it.to] : null;
  if (r && r.state === 'hidden'){ oracleSay(LINES.asleep); return; }
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
function simulate(dt){
  T += dt;
  updatePlayer(dt); updateHero(dt); updateRelics(dt); updateArrows(dt); updateCamera(dt); updateWorld(dt); updateHover();
  sky.update(dt, T, camera, { showAll:gaze, hover:hoverStar });
  updateLabels(); updateCross(); updateStamina();
}
function frame(now){
  const dt = Math.min(.05, (now-last)/1000); last = now;
  simulate(dt); renderer.render(scene, camera); requestAnimationFrame(frame);
}
RELICS.forEach(r => { if (r.state === 'orbit') orbitPos(r, r.pos); });
requestAnimationFrame(frame);
setTimeout(() => oracleSay(LINES.intro), reduceMotion ? 200 : 2000);
if (!intro) setTimeout(welcome, 600);

/* dev-only handle for poking at the scene from the browser console; stripped from production builds */
if (import.meta.env.DEV) window.__valley = { P, camS, RELICS, sky, oracle, world, colliders, summon, setGaze, scene, camera, renderer, keys, fireArrow, arrows,
  step(n=60, dt=1/60){ for (let i=0;i<n;i++) simulate(dt); renderer.render(scene, camera); } };
