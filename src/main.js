import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import './styles.css';
import { rand, hash, vnoise, fbm, sstep, lerp, ease, C, mixHex, randUnit } from './noise.js';
import { radialTex, glowTex, softTex, runeTex } from './textures.js';
import { ABOUT, RELICS, INTENTS, FALLBACK, SKILLS, LINES, FINALE, NOTE, starLine } from './content.js';
import { collisionWorld, colliders, addMesh, floorAt, ceilingAt, pushOut, slideVelocity } from './colliders.js';
import { guidedRelic, relicArrowHit, relicAimPoint } from './relic-targeting.js';
import { createOracle } from './oracle.js';
import { createConstellation } from './constellation.js';
import { buildForm } from './relics.js';
import { buildHero, animateHero } from './hero.js';
import { createPaperBird } from './paperbird.js';
import { createBrazier } from './braziers.js';

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
/* the sky's colour in a direction */
const SKY_GLSL = `
    float h3(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
      return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x), f.y), mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x), f.y), f.z); }
    float fb(vec3 p){ float a=.5, t=0.; for (int i=0;i<5;i++){ t += a*n3(p); p *= 2.03; a *= .5; } return t; }
    vec3 skyCol(vec3 d, float glow, float dawn){ float h = d.y;
      vec3 zen = mix(vec3(.01,.013,.042), vec3(.022,.03,.09), glow), mid = mix(vec3(.022,.026,.075), vec3(.05,.055,.15), glow), hor = mix(vec3(.045,.045,.115), vec3(.1,.09,.22), glow);
      hor = mix(hor, vec3(.24,.15,.3), dawn*.5); mid = mix(mid, vec3(.1,.07,.18), dawn*.3);
      vec3 c = h > 0. ? mix(hor, mid, smoothstep(0.,.28,h)) : mix(hor, vec3(.012,.015,.03), smoothstep(0.,-.3,h));
      c = mix(c, zen, smoothstep(.3,1.,h));
      float n = fb(d*2.6 + 4.);
      c += vec3(.2,.13,.42)*pow(n,3.)*(1.15 + glow*.8)*smoothstep(-.05,.6,h);
      c += vec3(.04,.22,.26)*pow(max(fb(d*4.4 - 9.) - .5, 0.), 1.4)*(1. + glow)*smoothstep(.1,.8,h);
      return c; }`;
const skyMat = new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false, uniforms:{ glow:{value:0}, dawn:{value:0} },
  vertexShader:'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader:`uniform float glow; uniform float dawn; varying vec3 vD;${SKY_GLSL}
    void main(){ gl_FragColor = vec4(skyCol(normalize(vD), glow, dawn), 1.); }` });
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
  m.frustumCulled = false; m.castShadow = !!opts.cast; m.receiveShadow = !!opts.receive; scene.add(m);
  if (opts.solid) addMesh(m, { name:opts.solid }); return m; }
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
  addMesh(ground, { name:'terrain', terrain:true });
  /* grass grows in soft meadows, thinning toward the lake and kept off the path */
  for (let i=0;i<7000 && grass.length<3600;i++){ const a=rand()*6.283, d=LAKE_BLOCK+.3+rand()*(WORLD_R+.5-LAKE_BLOCK), x=Math.cos(a)*d, z=Math.sin(a)*d, gy=groundH(x,z);
    if (gy < WATER_Y + .3 || (onPath(x,z) && Math.abs(x - Math.sin(z*.35)*.8) < 1.7) || fbm(x*.12+5, z*.12-2) < .34 - Math.max(0, 22 - d)*.012) continue; grass.push([x, gy, z]); }
  for (let i=0;i<70;i++){ const a=rand()*6.283, d=15+rand()*14; const x=Math.cos(a)*d, z=Math.sin(a)*d;
    if (onPath(x,z) || Math.hypot(x, z-21.5) < 4) continue; pines.push({ x, y:groundH(x,z)-.1, z, s:.9+rand()*.8, valley:true }); }

  /* a worn flagstone path from the spawn point down toward the lake */
  const stones = []; for (let z=21.5; z>10.4; z-=.95){ const sway = Math.sin(z*.35)*.8;
    for (let k=-1;k<=1;k++){ if (k && rand() < .35) continue; const x = sway + k*.95 + (rand()-.5)*.25, zz = z + (rand()-.5)*.2;
      stones.push({ p:new V3(x, groundH(x,zz) - .02, zz), q:yawQ(rand()*6), s:new V3(.75+rand()*.3, 1, .7+rand()*.3), c:mixHex('#2A3042','#3A4156', rand()) }); } }
  inst(rockify(new THREE.CylinderGeometry(.5,.54,.14,7,1), .25, 5.1, (t,c) => c.setRGB(1,1,1), .1), new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.95, flatShading:true }), stones, { receive:true, solid:'flagstones' });

  /* scattered boulders, some big enough to stand on */
  const bGeo = rockify(new THREE.IcosahedronGeometry(1,1), .55, 3.3, (t,c,n) => c.copy(mixHex('#191E2C','#2C3244', t)).lerp(C('#283252'), t > .78 ? .55 : 0), .4), boulders = [];
  for (let i=0;i<34;i++){ const a = rand()*6.283, d = 11 + rand()*17, x = Math.cos(a)*d, z = Math.sin(a)*d; if (onPath(x,z) || Math.hypot(x, z-21.5) < 4) continue;
    const s = .35 + Math.pow(rand(),1.6)*1.3, gy = groundH(x,z), q = yawQ(rand()*6), sz = s*(.8+rand()*.4); if (nearPillar(x, z, 1.5 + s)) continue;
    boulders.push({ p:new V3(x, gy - s*.2, z), q, s:new V3(s, s*.72, sz) }); }
  inst(bGeo, rockMat, boulders, { cast:true, receive:true, solid:'boulders' });
}

/* ---------- lake ---------- */
/* the lake: still, clear water. Its flat surface is a true mirror of the valley (see reflectLake below), with
   the star overhead and the path lanterns drawn out into soft paths of light the way calm water does. Through the water the
   shallows are clear, deeper water turns blue-violet, and a wide teal glow rises from the spring in the middle where the relic
   sleeps and the star's light comes down. The lake writes no depth, so the light can be drawn right down into it */
const LAKE_EDGE = LAKE_R + 3.4;
const lakeMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false,
  uniforms:{ t:{value:0}, energy:{value:0}, glow:{value:0}, star:{value:new V3(0, ORACLE_Y, 0)}, lamps:{value:[new V3(0,-99,0), new V3(0,-99,0), new V3(0,-99,0)]},
    mirror:{value:null}, mirrorM:{value:new THREE.Matrix4()}, now:{value:0},
    ripples:{value:[0,1,2,3].map(() => new THREE.Vector4(0, 0, -99, 0))},   /* x, z, start time, strength: see splashLake */
    drips:{value:Array.from({ length:32 }, () => new THREE.Vector4(0, 0, -99, 0))} },   /* the same for single drops: see dropRipple */
  vertexShader:`attribute float depth; uniform mat4 mirrorM; varying vec3 vW; varying float vDepth; varying vec4 vM;
    void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vDepth = depth; vM = mirrorM*w; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader:`uniform float t; uniform float energy; uniform float glow; uniform vec3 star; uniform vec3 lamps[3]; uniform sampler2D mirror; uniform float now; uniform vec4 ripples[4]; uniform vec4 drips[32]; varying vec3 vW; varying float vDepth; varying vec4 vM;
    /* a reflected light, drawn out into a vertical path toward the viewer the way calm water does */
    float streak(vec3 R, vec3 L, float w, float len){ float az = acos(clamp(dot(normalize(R.xz), normalize(L.xz)), -1., 1.)), el = asin(clamp(R.y, -1., 1.)) - asin(clamp(L.y, -1., 1.));
      return exp(-az*az*w - el*el*len); }
    void main(){ vec2 p = vW.xz; float r = length(p); if (vDepth < 0. || r > ${LAKE_EDGE.toFixed(2)}) discard;
      vec3 V = normalize(vW - cameraPosition), R = vec3(V.x, -V.y, V.z);
      float fres = .36 + .64*pow(1. - abs(V.y), 3.);
      /* the mirror: the valley drawn upside down under the water */
      float spring = exp(-r*r/(34. + energy*10.)), heart = exp(-r*r/7.);
      /* ripples from things falling into the water: rings spreading out, bending the reflection and catching a little light */
      vec2 bend = vec2(0.); float glint = 0.;
      for (int i = 0; i < 4; i++){ vec4 q = ripples[i]; float life = 2.4 + q.w*1.1, age = now - q.z; if (age < 0. || age > life) continue;
        float sc = .65 + .4*q.w; vec2 off = p - q.xy; float dd = length(off), front = age*1.8*sc, fade = q.w*(1. - age/life)*(1. - age/life);
        float wave = sin((dd - front)*9./sc)*exp(-pow((dd - front)/((.3 + age*.25)*sc), 2.))*smoothstep(0., .25, dd)*fade;
        bend += off/max(dd, 1e-3)*wave; glint += max(wave, 0.); }
      for (int i = 0; i < 32; i++){ vec4 q = drips[i]; float age = now - q.z, life = 1.4 + q.w*1.4; if (age < 0. || age > life) continue;
        vec2 off = p - q.xy; float dd = length(off), sc = .22 + .3*q.w, front = age*.9*sc + .03, fade = q.w*.7*(1. - age/life)*(1. - age/life);
        float wave = sin((dd - front)*16./sc)*exp(-pow((dd - front)/((.1 + age*.16)*sc), 2.))*fade;
        bend += off/max(dd, 1e-3)*wave; glint += max(wave, 0.); }
      vec4 m = vM; m.xy += bend*.035*m.w;
      vec3 col = texture2DProj(mirror, m).rgb*mix(vec3(1.3,1.38,1.55), vec3(1.05,1.6,1.55), spring) + vec3(.8,.87,1.)*glint*.22;
      /* soft paths of light under the star overhead and the lanterns */
      col += mix(vec3(.55,.9,1.), vec3(.8,.78,1.), glow)*streak(R, normalize(star - vW), 900., 50.)*(.3 + glow*.25 + energy*.3);
      for (int i = 0; i < 3; i++) col += vec3(1.,.76,.5)*streak(R, normalize(lamps[i] - vW), 2400., 60.)*.25;
      /* through the water: clear over the shallows, deep blue-violet further out, the spring glowing in the middle */
      float deep = smoothstep(0., 1.6, vDepth);
      vec3 body = mix(vec3(.03,.08,.12), vec3(.014,.02,.06), deep) + vec3(.16,.62,.66)*spring*.5;
      float hide = mix(.18, .52, deep), a = fres + (1. - fres)*hide;
      vec3 c = (col*fres + body*hide*(1. - fres))/a;
      /* the teal of the spring, glowing up through the water where the star's light comes down, seen from any angle */
      vec3 emit = vec3(.14,.62,.64)*(spring*.18 + heart*.12)*(1. + energy*.6 + glow*.3)*(.92 + .08*sin(t*.6));
      float a2 = min(1., a + max(emit.g, emit.b)*.5); c = (c*a + emit)/a2; a = a2;
      a *= smoothstep(0., .05, vDepth)*(1. - smoothstep(${(LAKE_EDGE - .6).toFixed(2)}, ${LAKE_EDGE.toFixed(2)}, r));
      gl_FragColor = vec4(c, a); }` });
let lake;
{ const g = new THREE.PlaneGeometry(LAKE_EDGE*2, LAKE_EDGE*2, 100, 100); g.rotateX(-Math.PI/2);
  const p = g.attributes.position, depth = new Float32Array(p.count); for (let i=0;i<p.count;i++) depth[i] = WATER_Y - groundH(p.getX(i), p.getZ(i));
  g.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
  lake = new THREE.Mesh(g, lakeMat); lake.position.y = WATER_Y; scene.add(lake); }
/* the lake's reflection: each frame the lake is in view, the scene is drawn again at three-quarter size (multisampled where WebGL2 allows)
   from a camera mirrored under the water, with an oblique near plane so nothing below the surface shows (three's Reflector approach) */
const mirror = { rt:renderer.capabilities.isWebGL2 ? new THREE.WebGLMultisampleRenderTarget(1, 1) : new THREE.WebGLRenderTarget(1, 1), cam:new THREE.PerspectiveCamera(), size:new THREE.Vector2(), frustum:new THREE.Frustum(), pv:new THREE.Matrix4(),
  rot:new THREE.Matrix4(), o:new V3(0, WATER_Y, 0), cp:new V3(), view:new V3(), look:new V3(), target:new V3(), plane:new THREE.Plane(), clip:new THREE.Vector4(), q:new THREE.Vector4() };
lakeMat.uniforms.mirror.value = mirror.rt.texture;
function reflectLake(){
  renderer.getDrawingBufferSize(mirror.size); const w = Math.max(1, Math.round(mirror.size.x*.75)), h = Math.max(1, Math.round(mirror.size.y*.75));
  if (mirror.rt.width !== w || mirror.rt.height !== h) mirror.rt.setSize(w, h);
  camera.updateMatrixWorld(); mirror.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); mirror.frustum.setFromProjectionMatrix(mirror.pv);
  if (camera.position.y < WATER_Y + .05 || !mirror.frustum.intersectsObject(lake)) return;
  const { o, cam:c } = mirror, cp = mirror.cp.setFromMatrixPosition(camera.matrixWorld);
  mirror.view.subVectors(o, cp).reflect(UP).negate().add(o);
  mirror.rot.extractRotation(camera.matrixWorld);
  mirror.look.set(0, 0, -1).applyMatrix4(mirror.rot).add(cp);
  mirror.target.subVectors(o, mirror.look).reflect(UP).negate().add(o);
  c.position.copy(mirror.view); c.up.set(0, 1, 0).applyMatrix4(mirror.rot).reflect(UP); c.lookAt(mirror.target);
  c.far = camera.far; c.updateMatrixWorld(); c.projectionMatrix.copy(camera.projectionMatrix);
  lakeMat.uniforms.mirrorM.value.set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
  mirror.plane.setFromNormalAndCoplanarPoint(UP, mirror.cp.set(0, WATER_Y + .02, 0)).applyMatrix4(c.matrixWorldInverse);
  const cl = mirror.clip.set(mirror.plane.normal.x, mirror.plane.normal.y, mirror.plane.normal.z, mirror.plane.constant), e = c.projectionMatrix.elements;
  mirror.q.set((Math.sign(cl.x) + e[8])/e[0], (Math.sign(cl.y) + e[9])/e[5], -1, (1 + e[10])/e[14]);
  cl.multiplyScalar(2/cl.dot(mirror.q)); e[2] = cl.x; e[6] = cl.y; e[10] = cl.z + 1; e[14] = cl.w;
  const shadows = renderer.shadowMap.autoUpdate; lake.visible = false; renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(mirror.rt); renderer.clear(); renderer.render(scene, c); renderer.setRenderTarget(null);
  renderer.shadowMap.autoUpdate = shadows; lake.visible = true;
}

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
  addMesh(m, { name:'cliff' });
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
    addMesh(shaft, { name:'wish-pillar', filter:m => m !== band }); });
}

/* ---------- spiral stair, landings, braziers ---------- */
const pathLights = [];
/* a stone cut to a given top outline (convex, in plan around its centre) and reaching down to the given points below it: a flat top with one
   clean edge over a few broad faces. It is the convex hull of the outline and those points.
   `top` is the face you walk on, `under` everything below it, `rim` the top's corners in order around it. */
function floatingStone(sd, outline, below, depth, topCol){
  const pts = outline.map(v => v.clone()).concat(below);
  /* the top is one even stone colour; each facet below takes its own shade, darkening toward the point */
  const g = new ConvexGeometry(pts), P = g.attributes.position, N = g.attributes.normal, top = { p:[], c:[] }, under = { p:[], c:[] }, c = new THREE.Color();
  for (let i=0;i<P.count;i+=3){ const up = N.getY(i) > .99, o = up ? top : under, shade = (hash(P.getX(i) + P.getZ(i+1), P.getY(i+2) + sd) - .5)*.08;
    for (let k=i;k<i+3;k++){ const x = P.getX(k), y = P.getY(k), z = P.getZ(k);
      if (up) c.copy(topCol).offsetHSL(0,0,(fbm(x*.7 + sd, z*.7 - sd) - .5)*.05); else c.copy(mixHex('#151926','#30364C', sstep(-depth, 0, y))).offsetHSL(0,0,shade);
      o.p.push(x,y,z); o.c.push(c.r,c.g,c.b); } }
  const geo = o => { const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.Float32BufferAttribute(o.p,3)); b.setAttribute('color', new THREE.Float32BufferAttribute(o.c,3)); b.computeVertexNormals(); return b; };
  return { top:geo(top), under:geo(under), rim:outline, depth };
}
/* the convex hull, in plan, of some points, as corners in order around it */
function planHull(ps){
  const cr = (o,a,b) => (a.x - o.x)*(b.z - o.z) - (a.z - o.z)*(b.x - o.x), chain = qs => qs.reduce((h,q) => { while (h.length > 1 && cr(h[h.length-2], h[h.length-1], q) <= 0) h.pop(); h.push(q); return h; }, []);
  const sorted = ps.slice().sort((a,b) => a.x - b.x || a.z - b.z); return chain(sorted).slice(0,-1).concat(chain(sorted.slice().reverse()).slice(0,-1));
}
/* every stone's top centre, so a click anywhere on a stone can set you down on it */
const stones = [];
const stoneAt = pt => stones.filter(s => pt.y > s.y - s.depth - .3 && pt.y < s.y + .1).reduce((b,s) => !b || Math.hypot(s.x - pt.x, s.z - pt.z) < Math.hypot(b.x - pt.x, b.z - pt.z) ? s : b, null);
/* Every stone's actual top and underside are registered together after merging. Keep centres for click-to-land. */
function placeStone(s, x, y, z){
  stones.push({ x, y, z, depth:s.depth, reach:Math.max(...s.rim.map(v => Math.hypot(v.x, v.z))) }); }
const braziers = [];
{
  /* the stair is a winding run of rock cracked into stones, with a slanted, upright cut between each step and the next. Each stone has its own
     width and sits a little in or out, so two neighbours meet along whatever stretch of the cut they both reach, long or short. Below the lower
     top they share that stretch as one face, down to a keel point, so they sit solid against each other; under that each runs on to its own
     point. Knocked-off corners and uneven bulges on the sides keep every outline its own, and each landing reaches far out. */
  const N = SP.N + 1, isLand = i => BRAZIER_AT.includes(i);
  /* how far each stone reaches along its back and front cuts, inward and outward of the path */
  const reach = [...Array(N)].map((_, i) => { const w = 1.9 + hash(i, 3.7)*1.1, o = (hash(i, 5.9) - .5)*.9, jit = k => (hash(i, 10 + k) - .5)*.5;
    return { bIn:w/2 - o + jit(0), bOut:isLand(i) ? 3.6 + hash(i, 7.3)*.6 : w/2 + o + jit(1), fIn:w/2 - o + jit(2), fOut:isLand(i) ? 3.6 + hash(i, 8.6)*.6 : w/2 + o + jit(3) }; });
  const cuts = [];   // cuts[j] runs between step j - 1 and step j
  for (let j=0; j<=N; j++){ const land = isLand(j - 1) ? 1 : isLand(j) ? -1 : 0;
    const a = SP.a0 + (j - .5)*SP.ang + (hash(j, 2.9) - .5)*.04 + land*.05, r = SP.R + (hash(j, 4.3) - .5)*.3, h = SP.base + (j - 1)*SP.rise;
    const d = new V3(Math.sin(a), 0, Math.cos(a)).applyAxisAngle(UP, (hash(j, 6.1) - .5)*(land ? .2 : .6)), c = new V3(Math.sin(a)*r, 0, Math.cos(a)*r), at = (t, y) => c.clone().addScaledVector(d, t).setY(y);
    const before = reach[j - 1], after = reach[j], sIn = Math.min(before ? before.fIn : 9, after ? after.bIn : 9), sOut = Math.min(before ? before.fOut : 9, after ? after.bOut : 9);
    /* the shared face: straight down from the lower top's corners, in to a point on each side, and down to the keel */
    const face = [at(-sIn, h), at(sOut, h), at(-sIn*(.7 + hash(j, 1.3)*.2), h - .35 - hash(j, 2.1)*.55), at(sOut*(.7 + hash(j, 4.1)*.2), h - .35 - hash(j, 5.3)*.55),
      at((hash(j, 6.7) - .5)*.6*Math.min(sIn, sOut), h - 1.2 - hash(j, 7.9)*.7)];
    cuts.push({ n:new V3(d.z, 0, -d.x), c, at, h, face }); }
  const outlineOf = i => { const A = cuts[i], B = cuts[i+1], e = reach[i], land = isLand(i);
    const corner = [A.at(-e.bIn, 0), A.at(e.bOut, 0), B.at(e.fOut, 0), B.at(-e.fIn, 0)];
    /* a corner knocked off here and there, cutting back along both of its edges */
    const pts = corner.flatMap((q, k) => { if (hash(i, 20 + k) > .45) return [q]; const s = .2 + hash(i, 24 + k)*.35;
      return [corner[(k+3)%4], corner[(k+1)%4]].map(o => q.clone().lerp(o, Math.min(.4, s/q.distanceTo(o)))); });
    /* an uneven corner pushed out of the outer side and of the inner side, wherever it stays clear of both cuts */
    const outer = hash(i, 8.3) < (land ? 1 : .7) ? (land ? .4 + hash(i, 1.9)*.6 : .15 + hash(i, 1.9)*.4) : 0, inner = hash(i, 2.3) < .55 ? .1 + hash(i, 3.3)*.3 : 0;
    [[1, 2, outer, 1], [3, 0, inner, -1]].forEach(([u, w, amt, dir]) => { if (!amt) return;
      const m = corner[u].clone().lerp(corner[w], .25 + hash(i + u, 8.8)*.5); m.addScaledVector(m.clone().normalize(), amt*dir);
      if (m.clone().sub(A.c).dot(A.n) > .25 && B.c.clone().sub(m).dot(B.n) > .25) pts.push(m); });
    return planHull(pts); };
  const tops = [], unders = [], landings = {};
  for (let i=0; i<N; i++){ const land = isLand(i), p = spiralPt(i), sd = i*13.7 + (land ? 0 : rand()*5), col = land ? C('#323848') : mixHex('#3D4458','#4A5168', rand());
    const A = cuts[i], B = cuts[i+1], e = reach[i], ring = outlineOf(i), cx = ring.reduce((t,v) => t + v.x, 0)/ring.length, cz = ring.reduce((t,v) => t + v.z, 0)/ring.length;
    const outline = ring.map(v => new V3(v.x - cx, 0, v.z - cz)), depth = land ? 5.8 + hash(i, 3.1)*.6 : p.y - Math.min(A.face[4].y, B.face[4].y) + .35 + hash(i, 3.1)*.5;
    /* its two cut faces (and a landing's far reach) below the top, and its own point under the keel */
    const far = land ? [A.at(e.bOut, A.h), A.at(e.bOut*(.7 + hash(i, 9.7)*.15), A.h - .5 - hash(i, 8.1)*.5), B.at(e.fOut, B.h), B.at(e.fOut*(.7 + hash(i, 9.9)*.15), B.h - .5 - hash(i, 8.4)*.5)] : [];
    const k = outline[Math.floor(hash(i, 4.9)*outline.length)], tip = new V3(k.x*(.15 + hash(i, 6.6)*.3), -depth, k.z*(.15 + hash(i, 6.6)*.3));
    const below = A.face.concat(B.face, far).map(v => new V3(v.x - cx, v.y - p.y, v.z - cz)).filter(v => v.y < -.01).concat([tip]);
    const s = floatingStone(sd, outline, below, depth, col);
    M4.makeTranslation(cx, p.y, cz); tops.push(s.top.applyMatrix4(M4)); unders.push(s.under.applyMatrix4(M4));
    placeStone(s, cx, p.y, cz);
    if (land) landings[i] = { p, x:cx, z:cz, rim:outline }; else if (i % 4 === 2) pathLights.push({ x:cx, y:p.y, z:cz }); }
  const stoneTop = new THREE.Mesh(merge(tops), rockMat), stoneBot = new THREE.Mesh(merge(unders), rockMat);
  [stoneTop, stoneBot].forEach(o => { o.castShadow = o.receiveShadow = true; o.userData.stone = true; scene.add(o); pickables.push(o); addMesh(o, { name:'stair-stone' }); });
  const plG = new THREE.BufferGeometry(); plG.setAttribute('position', new THREE.Float32BufferAttribute(pathLights.flatMap(p => [p.x, p.y+.18, p.z]), 3));
  scene.add(new THREE.Points(plG, new THREE.PointsMaterial({ size:.9, map:glowTex, color:0x78E6F0, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })));
  BRAZIER_AT.forEach(idx => { const { p, x, z, rim } = landings[idx], out = new V3(Math.sin(p.a),0,Math.cos(p.a)), c = new V3(p.x,0,p.z).addScaledVector(out, 2);
    const b = createBrazier(scene,new V3(c.x + out.x*.8,p.y,c.z + out.z*.8),{ seed:idx*.73, reduceMotion, pixelRatio:PIXEL }); braziers.push(b);
    b.solids.forEach(m => addMesh(m, { name:'brazier' }));
    /* a pine to one side, partway toward the corner of the landing nearest that side so it always stands on the rock */
    const side = new V3(out.z*1.4 - out.x*1.6, 0, -out.x*1.4 - out.z*1.6), k = rim.reduce((b,v) => v.dot(side) > b.dot(side) ? v : b);
    pines.push({ x:x + k.x*.6, y:p.y-.05, z:z + k.z*.6, s:.8, valley:true }); });
}

/* ---------- lanterns along the path: a lit way in, from where you arrive down to the lake ---------- */
{
  const bronze = new THREE.MeshStandardMaterial({ color:0x3A3328, roughness:.55, metalness:.6, flatShading:true }), stone = new THREE.MeshStandardMaterial({ color:0x2E3446, roughness:.95, flatShading:true });
  const bronzeG = merge([new THREE.CylinderGeometry(.045,.06,1.3,8).translate(0,.75,0), new THREE.CylinderGeometry(.13,.11,.035,6).translate(0,1.42,0),
    new THREE.ConeGeometry(.19,.16,6).translate(0,1.72,0), new THREE.SphereGeometry(.035,6,4).translate(0,1.83,0), new THREE.CylinderGeometry(.118,.118,.025,6).translate(0,1.64,0)]);
  const footG = new THREE.CylinderGeometry(.2,.26,.16,8).translate(0,.08,0), glassG = new THREE.CylinderGeometry(.1,.1,.2,6).translate(0,1.54,0);
  const spots = [[22.6,-1],[22.6,1],[19.7,-1],[16.9,1],[14.1,-1],[11.4,-1],[11.4,1]].map(([z,sd]) => { const x = Math.sin(z*.35)*.8 + sd*1.75; return { x, z, y:groundH(x,z) }; });
  const items = spots.map(o => ({ p:new V3(o.x, o.y - .04, o.z), q:yawQ(o.x*3) }));
  spots.slice(-3).forEach((o, i) => lakeMat.uniforms.lamps.value[i].set(o.x, o.y + 1.54, o.z));   // the lanterns closest to the lake show in it
  inst(bronzeG, bronze, items, { cast:true, solid:'lantern-frame' }); inst(footG, stone, items, { cast:true, receive:true, solid:'lantern-foot' }); inst(glassG, new THREE.MeshBasicMaterial({ color:0xFFD6A0 }), items, { solid:'lantern-glass' });
  spots.forEach(o => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFB86B, transparent:true, opacity:.6, depthWrite:false, blending:THREE.AdditiveBlending })); glow.position.set(o.x, o.y + 1.54, o.z); glow.scale.setScalar(1.5); scene.add(glow);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({ map:glowTex, color:0xFFB070, transparent:true, opacity:.16, depthWrite:false, blending:THREE.AdditiveBlending }));
    pool.position.set(o.x, o.y + .06, o.z); scene.add(pool); });
}

/* ---------- the paper crane: a way to leave Austin a note, on the last lantern on the right, where the path turns up to the stair ---------- */
const CRANE_LANTERN = { x:Math.sin(11.4*.35)*.8 + 1.75, z:11.4 };
const bird = createPaperBird(scene, { perch:new V3(CRANE_LANTERN.x, groundH(CRANE_LANTERN.x, CRANE_LANTERN.z) + 1.83, CRANE_LANTERN.z), star:() => oracle.position, hint:NOTE.crane, reduceMotion });
pickables.push(...bird.pick);
bird.solids.forEach(m => addMesh(m, { name:'paper-crane', dynamic:true, deforming:true, twoSided:true, stand:false }));

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
  inst(pineGeo(), new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, flatShading:true }), pines.map(t => ({ p:new V3(t.x,t.y,t.z), q:yawQ(rand()*6), s:new V3(t.s,t.s*(.9+rand()*.45),t.s), c:mixHex('#C4C8E4','#FFFFFF',rand()) })).filter((it,i) => clear(pines[i])), { cast:true, receive:true, solid:'pine' });
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
addMesh(oracle.group, { name:'oracle-crystal', dynamic:true, stand:false, filter:m => m.userData.solid });
const oracleState = { energy:0, target:0, eye:0, eyeTarget:0 };
const beamVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }';
const beamFrag = `uniform float t; uniform float fade; uniform float rep; uniform vec3 col; varying vec2 vUv;
  void main(){ float f = smoothstep(0.,.1,vUv.y)*smoothstep(1.,.8,vUv.y); float s = .55 + .45*sin(vUv.y*rep - t*4.); float a = f*s*fade; gl_FragColor = vec4(col*a, a); }`;
/* the star's light, let down onto the lake: it leaves the star narrow and opens out as it falls, a cone of light around a
   brighter inner cone. It is lit as a volume, not painted on a surface: for each pixel the shader finds the height where
   that line of sight passes closest to the axis and how far off it passes there, measured against the cone's width at that
   height, so the light is fullest down the middle and ends at a clean round edge from any angle (and in the lake's mirror).
   The same light spreads over more width as it falls, so it is densest and whitest under the star and thins to cyan over the
   water, gathering a little where it lands. Its colour is the star's own (hue), leaning to violet in the outer layer (veil).
   It breathes slowly brighter and dimmer (see updateWorld), and broad swells of light flow down it from the star to the water,
   with a fainter counter-current drifting up. Like the Oracle's glass, the light carries a soft blue-violet nebula that flows
   down with it (colour only, so the cone keeps its clean shape), and crystalline glitter and rare star glints sparkle inside it */
const shaftU = { t:{value:0}, power:{value:1}, hue:{value:C('#9FE8FF')}, veil:{value:C('#9484FF')} };
{ const top = ORACLE_Y - 3, h = top - WATER_Y;
  /* closed at the bottom, just under the water, so lines of sight that leave through the water still draw the light down to it */
  const m = new THREE.Mesh(new THREE.CylinderGeometry(2, 8.5, h + .3, 64, 1, false), new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.BackSide, fog:false,
    uniforms:shaftU,
    vertexShader:'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader:`uniform float t; uniform float power; uniform vec3 hue; uniform vec3 veil; varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), u = fract(p); u = u*u*(3. - 2.*u);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1.)), u.x), u.y); }
      float fbm(vec2 p){ return noise(p)*.57 + noise(p*2.03 + 7.)*.28 + noise(p*4.1 - 3.)*.15; }
      void main(){ vec3 d = normalize(vW - cameraPosition); vec2 o = cameraPosition.xz, k = d.xz; float kk = max(dot(k, k), 1e-6);
        /* the closest pass to the axis, but no further than where the line of sight enters the water */
        float s0 = -dot(o, k)/kk, sw = d.y < -1e-4 ? (${WATER_Y.toFixed(2)} - cameraPosition.y)/d.y : 1e9, s = min(s0, sw);
        float dist = length(o + k*s), y = cameraPosition.y + d.y*s;
        float f = clamp((${top.toFixed(1)} - y)/${h.toFixed(1)}, 0., 1.);            /* 0 under the star, 1 at the water */
        float rIn = mix(.45, 3.2, f), rOut = mix(.9, 6.2, f);
        float qi = dist/rIn, qo = dist/rOut;
        float inner = sqrt(max(0., 1. - qi*qi)), outer = sqrt(max(0., 1. - qo*qo));
        /* where the line of sight meets the water well before its closest pass, the light's footprint on the water settles
           softly; the two are blended over a few metres so there is no seam where one gives way to the other */
        float foot = smoothstep(0., 3., s0 - s);
        inner = mix(inner, (1. - smoothstep(.1, 1.15, qi))*.36, foot); outer = mix(outer, (1. - smoothstep(.2, 1.2, qo))*.32, foot);
        float along = smoothstep(${top.toFixed(1)} + .5, ${(top - 4).toFixed(1)}, y)*step(0., s);
        float spread = pow(.45/rIn, .3), gather = 1. + .35*exp(-(y - ${WATER_Y.toFixed(2)})*.3);
        vec3 tint = mix(vec3(.96,.98,1.), hue, smoothstep(0., .85, f)*.8), mist = mix(hue, veil, .55);
        float down = .5 + .5*sin(6.2832*(f*1.8 - t*.3)), up = .5 + .5*sin(6.2832*(f*2.7 + t*.05) + 1.3);
        float swell = .4 + 1.25*pow(down, 3.) + .1*up;
        /* the nebula: slow veils across the beam (offset from the axis as a share of its width), drawn long down its length
           and drifting down with the light; they move the colour between ice blue and violet and barely touch the brightness */
        float x = (o.x*k.y - o.y*k.x)/sqrt(kk)/rOut;
        vec2 q = vec2(x*2.3, f*1.7 - t*.07);
        float cloud = fbm(q + vec2(fbm(q*1.3 + vec2(t*.015, -t*.05)), fbm(q*1.1 - 4.))*.9);
        float violet = smoothstep(.4, .75, fbm(vec2(x*1.6 + 9., f*1.2 - t*.045)));
        vec3 flow = mix(mix(vec3(.66,.86,1.), hue, .3), vec3(.66,.52,1.), violet);
        float nebK = smoothstep(.04, .3, f)*(1. - foot*.6);
        tint = mix(tint, flow*(.88 + .3*cloud), .6*nebK); mist = mix(mist, mix(veil, flow, .45)*(.9 + .25*cloud), .55*nebK);
        /* a spectral profile: a fine white-hot core inside the ice body, and a faint luminous sheath at the cone's edge where the
           light turns violet, so the beam reads as a crafted column of light rather than a haze */
        float core = exp(-pow(dist/(rIn*.38), 2.))*(1. - foot);
        float sheath = exp(-pow((qo - .9)/.08, 2.))*(1. - foot)*(.6 + .4*violet);
        vec3 c = (tint*inner*.34 + mist*outer*.14)*spread*gather*swell*along*power;
        c += (vec3(.97,.99,1.)*core*.22*(.7 + .3*swell) + mix(vec3(.62,.8,1.), vec3(.7,.55,1.), .4 + .6*f)*sheath*.07)*spread*gather*along*power;
        c *= smoothstep(.8, 3., length(o));   /* fade if the camera is inside the light */
        gl_FragColor = vec4(c, 1.); }` }));   /* additive blending scales by alpha, so alpha 1 adds the light as shaded */
  m.position.y = WATER_Y - .3 + (h + .3)/2; m.renderOrder = 3; scene.add(m);
  /* crystalline light inside the beam, drawn like the Oracle's glints: a fine glitter of tiny points, gathered toward the
     axis and twinkling softly, and a few larger four-point stars that flash rarely and slowly, all drifting down with the
     light (a private seed keeps the valley's shared layout) */
  let sd = 53; const r = () => (sd = sd*16807 % 2147483647)/2147483647;
  const FINE = 720, HERO = 56, N = FINE + HERO, gp = new Float32Array(N*3), tier = new Float32Array(N);
  for (let i=0;i<N;i++){ const hero = i >= FINE; gp[i*3] = r(); gp[i*3+1] = r()*6.2832; gp[i*3+2] = Math.pow(r(), hero ? .8 : 1.2); tier[i] = hero ? 1 : 0; }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); gg.setAttribute('tier', new THREE.BufferAttribute(tier, 1));
  const glints = new THREE.Points(gg, new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, uniforms:shaftU,
    vertexShader:`attribute float tier; uniform float t; uniform float power; uniform vec3 hue; uniform vec3 veil; varying float vI; varying vec3 vCol; varying float vA; varying float vTier;
      void main(){ float seed = position.x*91.7 + position.y*13.1, c = fract(seed*.37); vTier = tier;
        float f = fract(position.x + t*(.18 + fract(seed)*.3)/${h.toFixed(1)});   /* 0 under the star, 1 at the water */
        float rad = mix(.8, 5.2, f)*position.z, a = position.y + t*.025;
        vec4 mv = modelViewMatrix*vec4(cos(a)*rad, ${top.toFixed(1)} - f*${h.toFixed(1)}, sin(a)*rad, 1.);
        float phase = sin(t*(tier > .5 ? .35 + fract(seed*3.1)*.5 : .9 + fract(seed*3.1)*1.6) + seed*6.2832);
        float flash = tier > .5 ? pow(.5 + .5*phase, 22.) : .25 + .75*pow(.5 + .5*phase, 5.);
        float edge = smoothstep(0., .06, f)*smoothstep(1., .92, f)*(1. - position.z*.55);
        vI = (tier > .5 ? flash*1.6 : flash*.7)*edge*power;
        vCol = c < .55 ? vec3(.92,.96,1.) : c < .85 ? mix(hue, vec3(1.), .45) : mix(veil, vec3(1.), .35);
        vA = fract(seed*.71)*.4 - .2;
        float size = tier > .5 ? (1.4 + flash*2.6)*${(PIXEL*330).toFixed(1)} : (.35 + flash*.35)*${(PIXEL*260).toFixed(1)};
        gl_PointSize = vI < .02 ? 0. : clamp(size/max(1., -mv.z), 1., ${(PIXEL*56).toFixed(1)});
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`varying float vI; varying vec3 vCol; varying float vA; varying float vTier;
      void main(){ vec2 p = gl_PointCoord - .5; float cs = cos(vA), sn = sin(vA); p = mat2(cs, -sn, sn, cs)*p;
        float core = exp(-dot(p, p)*(vTier > .5 ? 900. : 70.));
        float ray = exp(-abs(p.x)*80.)*exp(-abs(p.y)*4.5) + exp(-abs(p.y)*80.)*exp(-abs(p.x)*4.5);
        vec2 dg = mat2(.7071, -.7071, .7071, .7071)*p;
        float diag = (exp(-abs(dg.x)*110.)*exp(-abs(dg.y)*16.) + exp(-abs(dg.y)*110.)*exp(-abs(dg.x)*16.))*.3;
        float halo = exp(-dot(p, p)*40.)*.12;
        float a = vTier > .5 ? (ray + diag + halo + core*1.6)*min(vI, 1.5) : core*vI;
        /* the hero stars' horizontal rays lean ice blue and their vertical ones violet, a faint spectral split */
        vec3 tintRay = mix(vec3(.7,.88,1.), vec3(.78,.66,1.), step(abs(p.x), abs(p.y)));
        gl_FragColor = vec4(mix(vTier > .5 ? mix(vCol, tintRay, .35) : vCol, vec3(1.), min(1., core)), a); }` }));   /* additive blending scales by alpha */
  glints.frustumCulled = false; glints.renderOrder = 3; scene.add(glints); }
const beamMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false,
  uniforms:{ t:{value:0}, fade:{value:0}, rep:{value:30}, col:{value:C('#BFF6FF')} }, vertexShader:beamVert, fragmentShader:beamFrag });
const beam = new THREE.Mesh(new THREE.CylinderGeometry(.12,.45,1,12,1,true), beamMat); beam.visible = false; scene.add(beam);
let beamState = { life:0, relic:null };
function beamTo(r){ beamState = { life:3.2, relic:r }; beamMat.uniforms.col.value.set(r.color).lerp(C('#FFFFFF'), .4); beam.visible = true; oracleState.eyeTarget = 1; }

/* ---------- the skill constellation ---------- */
const starLabels = document.createElement('div'); starLabels.id = 'starLabels'; document.body.appendChild(starLabels);
/* is a direction from o blocked by a basalt wall? Stars behind rock are hidden by depth; their names hide with them */
function skyBlocked(o, d){ return !!collisionWorld.rayHit(o, d, 900, s => s.name === 'cliff'); }
const sky = createConstellation(scene, { skills:SKILLS, relics:RELICS, labelsEl:starLabels, reduceMotion, blocked:skyBlocked });

/* ---------- relics ---------- */
const sealMatBase = new THREE.MeshBasicMaterial({ map:runeTex, transparent:true, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending });
const hitMat = new THREE.MeshBasicMaterial({ visible:false });
RELICS.forEach(r => {
  r.group = new THREE.Group(); scene.add(r.group); r.model = buildForm(r); r.group.add(r.model);
  // Relics are intangible; their generous interaction targets never enter the physical collision world.
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
/* something falling into the lake: rings spread across the water and, unless motion is reduced, the water splashes up the way
   it really does: a crown of drops thrown up and out from a ring around the impact, a jet rising from the middle a moment
   later as the water closes in, drops of many sizes drawn with short streaks along their flight, low mist over the water and
   a ring of foam spreading on the surface. Everything is pale and translucent, not glowing, and drops vanish where they fall
   back in */
const splashes = []; let rippleNext = 0;
const overWater = (x, z) => Math.hypot(x, z) < LAKE_EDGE && groundH(x, z) < WATER_Y - .05;
const dropMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, uniforms:{ scale:wispScale },
  vertexShader:`attribute float size; attribute float alpha; uniform float scale; varying float vA;
    void main(){ vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*scale/-mv.z; gl_Position = projectionMatrix*mv; }`,
  /* a drop of clear water, a small solid lens: a faint, nearly colourless body, a small highlight on top from the star overhead, and a brighter
     crescent at the bottom where the light focuses through it */
  fragmentShader:`varying float vA; void main(){ vec2 q = gl_PointCoord - .5; float r = length(q)*2.; if (r > 1.) discard;
    float body = sqrt(1. - r*r)*.09*smoothstep(1., .8, r);
    vec2 h = q - vec2(0., -.2), b = q - vec2(0., .22); float spec = exp(-dot(h, h)*130.), focus = exp(-dot(b, b)*38.)*smoothstep(1., .75, r);
    gl_FragColor = vec4(mix(mix(vec3(.7,.76,.86), vec3(.9,.94,1.), focus), vec3(1.), spec), (body + focus*.1 + spec*.45)*vA); }` });
/* motion trails behind the drops: brightest at the drop, fading out behind it */
const streakMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false,
  vertexShader:'attribute float lineA; varying float vA; void main(){ vA = lineA; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader:'varying float vA; void main(){ gl_FragColor = vec4(vec3(.78,.84,.94), vA); }' });
/* small ripples where single drops land: real ripples in the water like the big ones (see the lake shader), only smaller and
   quicker, kept in a ring of 32 */
let dripNext = 0;
/* drops from the jet, bounced and carried up rather than flung aside, are bigger and leave bigger ripples */
function dropRipple(x, z, s, jet){ lakeMat.uniforms.drips.value[dripNext].set(x, z, T, jet ? Math.min(1.6, .8 + s*4) : Math.min(1, .35 + s*5)); dripNext = (dripNext + 1) % 32; }
function splashLake(at, power=1){
  lakeMat.uniforms.ripples.value[rippleNext].set(at.x, at.z, T, Math.min(2, .5 + power*.55)); rippleNext = (rippleNext + 1) % 4;
  if (reduceMotion) return;
  /* the crown is drops thrown up and out at random from around the impact; the jet is a single file of drops rising straight up
     from the middle one after another, smaller toward the top, with loose drops thrown off around it */
  const r0 = .08 + power*.2, crown = Math.round(18 + 30*power), jet = Math.round(4 + 4*power), loose = Math.round(6 + 8*power), n = crown + jet + loose;
  const pos = new Float32Array(n*3), size = new Float32Array(n), alpha = new Float32Array(n), line = new Float32Array(n*6), drops = [];
  for (let i=0;i<n;i++){ let p, v, wait;
    if (i < crown){ const a = rand()*6.283, rr = r0*(.8 + rand()*.4), out = (.7 + rand()*1.5)*(.6 + power*.4), up = (1.6 + rand()*2.4)*(.6 + power*.4);
      p = new V3(at.x + Math.cos(a)*rr, WATER_Y + .02, at.z + Math.sin(a)*rr); v = new V3(Math.cos(a)*out, up, Math.sin(a)*out); wait = rand()*.05;
      size[i] = .05 + rand()*rand()*.18*(.5 + power*.4); }
    else if (i < crown + jet){ const j = i - crown, f = j/Math.max(1, jet - 1);
      p = new V3(at.x + (rand() - .5)*.03, WATER_Y + .02, at.z + (rand() - .5)*.03); v = new V3((rand() - .5)*.12, (2.6 + 2.6*f)*(.7 + power*.3), (rand() - .5)*.12); wait = .14 + (1 - f)*.16;
      size[i] = (.19 + .08*power)*(1 - f*.45); }
    else { /* loose drops thrown off around the jet as it rises, at random */
      const a = rand()*6.283, rr = rand()*r0*.4, out = (.25 + rand()*.9)*(.6 + power*.3);
      p = new V3(at.x + Math.cos(a)*rr, WATER_Y + .02, at.z + Math.sin(a)*rr); v = new V3(Math.cos(a)*out, (1.8 + rand()*2.8)*(.7 + power*.3), Math.sin(a)*out); wait = .14 + rand()*.25;
      size[i] = (.04 + rand()*rand()*.09)*(.7 + power*.3); }
    drops.push({ p, v, wait, on:true, s:size[i], jet:i >= crown && i < crown + jet }); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const pts = new THREE.Points(g, dropMat); pts.frustumCulled = false; scene.add(pts);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(line, 3)); lg.setAttribute('lineA', new THREE.BufferAttribute(new Float32Array(n*2), 1));
  const streaks = new THREE.LineSegments(lg, streakMat); streaks.frustumCulled = false; scene.add(streaks);
  /* low mist over the water around the impact */
  const M = Math.round(4 + 6*power), mp = new Float32Array(M*3), mist = [];
  for (let i=0;i<M;i++){ const a = rand()*6.283, rr = r0*(.5 + rand()); mist.push({ p:new V3(at.x + Math.cos(a)*rr, WATER_Y + .1 + rand()*.2*power, at.z + Math.sin(a)*rr), v:new V3(Math.cos(a), .3 + rand()*.4, Math.sin(a)).multiplyScalar(.5 + power*.5) }); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const mistPts = new THREE.Points(mg, new THREE.PointsMaterial({ map:softTex, size:.5 + power*.35, color:0xD8EEFF, transparent:true, opacity:.22, depthWrite:false }));
  mistPts.frustumCulled = false; scene.add(mistPts);
  /* the foam: a soft pale ring on the water spreading from the impact */
  const fu = { a:{value:.5} };
  const foam = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI/2), new THREE.ShaderMaterial({ transparent:true, depthWrite:false, uniforms:fu,
    vertexShader:'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:`uniform float a; varying vec2 vP;
      void main(){ float d = length(vP), ring = exp(-pow((d - .8)/.12, 2.)) + exp(-d*d*6.)*.35; gl_FragColor = vec4(vec3(.88,.91,1.), ring*a); }` }));
  foam.position.set(at.x, WATER_Y + .012, at.z); foam.renderOrder = 2; scene.add(foam);
  splashes.push({ pts, streaks, drops, foam, fu, mistPts, mist, r0, age:0, power });
}
function updateSplashes(dt){
  for (let i = splashes.length-1; i >= 0; i--){ const s = splashes[i]; s.age += dt;
    const pos = s.pts.geometry.attributes.position.array, al = s.pts.geometry.attributes.alpha.array, ln = s.streaks.geometry.attributes.position.array, la = s.streaks.geometry.attributes.lineA.array; let live = 0;
    s.drops.forEach((d, k) => {
      if (d.on && s.age > d.wait){ d.v.y -= 9.8*1.3*dt; d.v.multiplyScalar(Math.exp(-dt*.4)); d.p.addScaledVector(d.v, dt);
        if (d.p.y < WATER_Y){ d.on = false; if (overWater(d.p.x, d.p.z) && (d.jet || rand() < .4)) dropRipple(d.p.x, d.p.z, d.s, d.jet); } }
      const shown = d.on && s.age > d.wait; if (shown) live++;
      pos.set([d.p.x, d.p.y, d.p.z], k*3); al[k] = shown ? Math.min(1, (s.age - d.wait)*12) : 0;
      const tail = shown ? .05 : 0; ln.set([d.p.x, d.p.y, d.p.z, d.p.x - d.v.x*tail, d.p.y - d.v.y*tail, d.p.z - d.v.z*tail], k*6); la[k*2] = al[k]*.18; la[k*2 + 1] = 0; });
    s.pts.geometry.attributes.position.needsUpdate = true; s.pts.geometry.attributes.alpha.needsUpdate = true; s.streaks.geometry.attributes.position.needsUpdate = true; s.streaks.geometry.attributes.lineA.needsUpdate = true;
    const f = Math.min(1, s.age/1.4); s.foam.scale.setScalar(s.r0 + (.9 + s.power*.5)*Math.sqrt(f)); s.fu.a.value = .45*(1 - f)*(1 - f);
    const mp = s.mistPts.geometry.attributes.position.array, ml = Math.min(1, s.age/1.3);
    s.mist.forEach((m, k) => { m.v.multiplyScalar(Math.exp(-dt*2.5)); m.p.addScaledVector(m.v, dt); mp.set([m.p.x, m.p.y, m.p.z], k*3); });
    s.mistPts.geometry.attributes.position.needsUpdate = true; s.mistPts.material.opacity = .22*Math.min(1, s.age*10)*(1 - ml);
    if (!live && s.age > 1.4){ [s.pts, s.streaks, s.foam, s.mistPts].forEach(o => scene.remove(o)); s.pts.geometry.dispose(); s.streaks.geometry.dispose(); s.foam.geometry.dispose(); s.foam.material.dispose();
      s.mistPts.geometry.dispose(); s.mistPts.material.dispose(); splashes.splice(i,1); } }
}
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
collisionWorld.build();
const H = buildHero(scene), hero = H.root;

/* ---------- player ---------- */
const P = { pos:new V3(0,0,21.5), vel:new V3(), onGround:true, facing:Math.PI, target:null, flight:null, walk:0, speed:0, draw:0, drawing:false, auto:null,
  energy:1, flying:false, soared:false, jumpT:-9, stall:0 };
P.pos.y = floorAt(P.pos.x, P.pos.z, groundH(P.pos.x, P.pos.z), .6, groundH(P.pos.x, P.pos.z)).h;
const SPEED = 7, GRAV = 26, JUMP = 9.6, STEP_UP = .6, ASCEND = 7.5, CEILING = 47, AIR_R = 33, FLY_SECONDS = 7.5, BODY_R = .46, HEAD = 1.7;
function jumpPress(){ if (P.flight) return; skipIntro(); if (P.onGround){ P.vel.y = JUMP; P.onGround = false; P.jumpT = T; } else P.jumpT = T - 1; }
function supportAt(x,z,y){ return floorAt(x, z, y, STEP_UP, groundH(x,z)); }
function flyTo(dest){ P.dip = null; const from = P.pos.clone(), dist = from.distanceTo(dest);
  // Approach a higher perch from above, with room for the whole robe before reaching its edge.
  const arc = Math.max(2 + dist*.12, (dest.y - from.y)/Math.PI + HEAD + BODY_R);
  P.flight = { from, to:dest.clone(), t:0, dur:Math.min(3.6, Math.max(1.2, dist/12)), arc }; P.target = null; P.vel.set(0,0,0); }
/* Leave the lake for dry ground: a low glide off the bank, or with a higher arc, a hop back out after touching the water. */
function dipIn(power){ P.dip = { t:0 }; P.target = null; P.flying = false; splashLake(P.pos, power); }
function glideToShore(arc=.35){
  const r = Math.hypot(P.pos.x, P.pos.z), angle = r > .1 ? Math.atan2(P.pos.x, P.pos.z) : camS.yaw;
  const radius = LAKE_BLOCK + .6;
  for (let i=0;i<24;i++){
    // Try the nearest bank first, then nearby directions if a rock or stair blocks the landing.
    const a = angle + (i%2 ? 1 : -1)*Math.ceil(i/2)*Math.PI/12;
    const to = new V3(Math.sin(a)*radius, 0, Math.cos(a)*radius), ground = groundH(to.x,to.z);
    to.y = floorAt(to.x, to.z, ground, STEP_UP, ground).h;
    const check = { x:to.x, z:to.z };
    if (to.y < WATER_Y + .15 || pushOut(check, to.y + STEP_UP, to.y + HEAD, BODY_R)) continue;
    const from = P.pos.clone(), dist = from.distanceTo(to);
    P.flight = { from, to, t:0, dur:Math.max(.6, dist/(arc > .5 ? 9 : 7)), arc, shore:true };
    P.target = null; P.vel.set(0,0,0); P.onGround = false; P.flying = false; P.soared = true; P.speed = 0;
    return;
  }
}

/* ---------- arrows: guided arrows fly to their relic; drawn arrows stick in whatever they meet ---------- */
const arrows = [];
const ARROW_TRAIL_POINTS = 14;
// Match the original trail at a fixed 200 FPS reference: 14 samples span 13 frame intervals.
// Keep this reference fixed so slower frames or a different display cannot stretch the tail.
const ARROW_TRAIL_SECONDS = (ARROW_TRAIL_POINTS - 1)/200;
const arrowShaft = new THREE.CylinderGeometry(.018,.018,1,5).rotateX(Math.PI/2);
const fletchGeo = new THREE.ConeGeometry(.05,.14,3).rotateX(-Math.PI/2).translate(0,0,-.46);
function bowWorld(){ return hero.localToWorld(H.bow.position.clone()); }
function fireArrow(from, dir, speed, target){
  const g = new THREE.Group(); const sh = new THREE.Mesh(arrowShaft, new THREE.MeshBasicMaterial({ color:0xE8F8FF })); g.add(sh); g.add(new THREE.Mesh(fletchGeo, new THREE.MeshBasicMaterial({ color:0x78E6F0 })));
  const tipS = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x9FF2FF, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })); tipS.position.z = .5; tipS.scale.set(.9,.9,1); g.add(tipS);
  const tg = new THREE.BufferGeometry(), tp = new Float32Array(ARROW_TRAIL_POINTS*3); for (let i=0;i<ARROW_TRAIL_POINTS;i++) tp.set([from.x,from.y,from.z], i*3); tg.setAttribute('position', new THREE.BufferAttribute(tp,3));
  const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color:0x9FF2FF, transparent:true, opacity:.7, blending:THREE.AdditiveBlending, depthWrite:false })); trail.frustumCulled = false; scene.add(trail);
  g.position.copy(from); scene.add(g); arrows.push({ g, tipS, trail, trailHistory:[{ time:0, pos:from.clone() }], pos:from.clone(), tip:from.clone(), vel:dir.clone().normalize().multiplyScalar(speed), target, life: target ? 4 : 3.2, stuck:false, age:0 });
}
/* Resample a fixed duration of the actual path, independent of frame rate. */
function updateArrowTrail(a){
  const history = a.trailHistory, cutoff = a.age - ARROW_TRAIL_SECONDS;
  history.push({ time:a.age, pos:a.pos.clone() });
  // Keep one sample before the cutoff so the tail can be interpolated exactly.
  while (history.length > 2 && history[1].time <= cutoff) history.shift();
  const attr = a.trail.geometry.attributes.position, tp = attr.array;
  let segment = history.length - 2;
  for (let i=0;i<ARROW_TRAIL_POINTS;i++){
    const time = Math.max(history[0].time, a.age - i/(ARROW_TRAIL_POINTS-1)*ARROW_TRAIL_SECONDS);
    while (segment > 0 && history[segment].time > time) segment--;
    const lo = history[segment], hi = history[segment+1];
    const span = hi.time - lo.time, t = span > 0 ? (time - lo.time)/span : 0;
    const j = i*3;
    tp[j] = lerp(lo.pos.x, hi.pos.x, t); tp[j+1] = lerp(lo.pos.y, hi.pos.y, t); tp[j+2] = lerp(lo.pos.z, hi.pos.z, t);
  }
  attr.needsUpdate = true;
}
function updateArrows(dt){
  for (let i = arrows.length-1; i >= 0; i--){
    const a = arrows[i]; a.life -= dt; a.age += dt;
    if (!a.stuck){
      if (a.target){ const want = a.target.pos.clone().sub(a.pos); want.normalize().multiplyScalar(Math.max(50, a.vel.length())); a.vel.lerp(want, Math.min(1, dt*(6 + a.age*10))); }
      else a.vel.y -= 6*dt;
      const from = a.pos.clone(); a.pos.addScaledVector(a.vel, dt);
      const direction = a.vel.clone().normalize(), tip = a.pos.clone().addScaledVector(direction, .5);
      const hit = collisionWorld.segmentHit(a.tip, tip);
      const relicHit = relicArrowHit(from, a.pos, RELICS, a.target);
      // Compare travel fractions: solid geometry is measured at the tip, relic tolerance at the shaft centre.
      const travel = from.distanceTo(a.pos), tipTravel = a.tip.distanceTo(tip);
      const reachesRelic = relicHit && (!hit || relicHit.distance/Math.max(travel,1e-8) < hit.distance/Math.max(tipTravel,1e-8));
      const guidedArrival = a.target && a.age > 2.5 && guidedRelic(a.target) && !hit;
      if (!a.target && a.life > 0 && a.tip.y >= WATER_Y && tip.y < WATER_Y){
        const k = (a.tip.y - WATER_Y)/(a.tip.y - tip.y), surface = a.tip.clone().lerp(tip, k);
        // A solid met before the water takes precedence; otherwise keep the lake's splash and drag.
        if (overWater(surface.x, surface.z) && (!hit || a.tip.distanceTo(surface) < hit.distance)){
          splashLake(surface, Math.min(1.4, a.vel.length()/40)); a.vel.multiplyScalar(.4); a.wet = true;
        }
      }
      if (a.wet) a.vel.multiplyScalar(Math.exp(-dt*2.5));
      if (reachesRelic || guidedArrival){
        hitRelic(reachesRelic ? relicHit.relic : a.target, reachesRelic ? relicHit.point : a.pos); a.life = 0;
      } else if (hit){
        a.pos.copy(hit.point).addScaledVector(direction, -.5);
        a.stuck = true; a.target = null; a.life = Math.min(a.life + 4, 7); a.tipS.material.opacity = .5;
        if (hit.solid.dynamic){
          const inverse = hit.object.matrixWorld.clone().invert();
          a.attachment = { object:hit.object, position:a.pos.clone().applyMatrix4(inverse), direction:direction.clone().transformDirection(inverse) };
        }
        burst(hit.point, C('#9FF2FF'), 14, .25);
      }
      a.tip.copy(tip);
      a.g.position.copy(a.pos); a.g.quaternion.setFromUnitVectors(ZAX, direction);
      updateArrowTrail(a);
    } else {
      if (a.attachment){ const { object, position, direction } = a.attachment;
        a.pos.copy(position).applyMatrix4(object.matrixWorld); a.g.position.copy(a.pos);
        a.g.quaternion.setFromUnitVectors(ZAX, direction.clone().transformDirection(object.matrixWorld)); }
      a.tipS.material.opacity = Math.max(0, Math.min(.5, a.life*.3));
    }
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
    else { oracle.receive(r); bird.pulse(); const n = MAIN.filter(x => x.lightGiven).length; world.target = n/MAIN.length; showToast(LINES.lightBack(n, fresh.length)); if (n === MAIN.length) finale(); }
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
const isTyping = e => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
addEventListener('keydown', e => {
  if (isTyping(e)) return; keys[e.code] = true;
  if (e.code === 'Space'){ e.preventDefault(); if (!e.repeat) jumpPress(); }
  if (/^(Arrow|Key[WASD])/.test(e.code)){ e.preventDefault(); skipIntro(); if (gaze) setGaze(false); }
  if (e.code === 'KeyF') setMode(mode === 'aim' ? 'auto' : 'aim');
  if (e.code === 'KeyC' && !e.repeat) setGaze(!gaze);
  if (e.code === 'KeyN' && !e.repeat) openLetter();
  if (e.code === 'Escape'){ indexEl.hidden = true; if (writing) closeLetter(); if (gaze) setGaze(false); if (openRelic) sendBack(openRelic); if (P.drawing){ P.drawing = false; } }
  const d = /^Digit([1-7])$/.exec(e.code); if (d){ const r = RELICS.find(x => x.key === +d[1]); if (r) summon(r); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; P.drawing = false; });
const camS = { yaw:0, pitch:-.12, dist:9 };
let drag = null, pointer = null; const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('contextmenu', e => e.preventDefault());
/* while a mouse button is held in aim mode the cursor is locked in place, so a long draw can never run off the screen;
   it reappears where the press began. Touch and pens keep the plain drag. */
let unlocking = false;
const isLocked = () => document.pointerLockElement === canvas;
function lockPointer(){ try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) {} }
function unlockPointer(){ if (isLocked()){ unlocking = true; document.exitPointerLock(); } }
document.addEventListener('pointerlockchange', () => {
  if (isLocked()){ if (!drag) unlockPointer(); return; }
  /* the browser dropped the lock mid-draw on its own (Esc): cancel the shot, as Esc does */
  if (!unlocking && drag){ drag = null; P.drawing = false; P.draw = 0; } unlocking = false; });
canvas.addEventListener('pointerdown', e => { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} skipIntro();
  drag = { x:e.clientX, y:e.clientY, moved:false, button:e.button };
  if (mode === 'aim' && e.pointerType === 'mouse') lockPointer();
  if (mode === 'aim' && e.button === 0){ P.drawing = true; P.draw = 0; } });
canvas.addEventListener('pointermove', e => { pointer = { x:e.clientX, y:e.clientY, dirty:true }; if (!drag) return;
  const locked = isLocked(), dx = locked ? e.movementX : e.clientX - drag.x, dy = locked ? e.movementY : e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx,dy) > 6){ drag.moved = true; if (mode !== 'aim') canvas.classList.add('dragging'); }
  if (drag.moved || mode === 'aim'){ craneApproach = null; const k = mode === 'aim' ? .0032 : .0055; camS.yaw -= dx*k; camS.pitch = Math.min(gaze ? 1.5 : 1.32, Math.max(-.62, camS.pitch - dy*k*.8)); drag.x = e.clientX; drag.y = e.clientY; gazeT = 9; } });
canvas.addEventListener('pointerleave', () => { pointer = null; });
canvas.addEventListener('pointerup', e => { if (!drag) return; const was = drag.moved; drag = null; canvas.classList.remove('dragging'); unlockPointer();
  if (mode === 'aim'){ if (P.drawing){ P.drawing = false; if (P.draw > .12) fireManual(); else P.draw = 0; } return; }
  if (!was) clickAt(e.clientX, e.clientY); });
canvas.addEventListener('pointercancel', () => { drag = null; P.drawing = false; canvas.classList.remove('dragging'); unlockPointer(); });
canvas.addEventListener('wheel', e => { e.preventDefault(); craneApproach = null; camS.dist = Math.min(20, Math.max(4, camS.dist*(1 + e.deltaY*.0011))); }, { passive:false });
function clickAt(cx, cy){
  ndc.set(cx/innerWidth*2-1, -(cy/innerHeight)*2+1); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(pickables.concat(sky.hits), false); if (!hits.length) return;
  const relicHit = hits.find(h => h.object.userData.relic && h.object.parent.visible);
  if (relicHit){ const r = relicHit.object.userData.relic; if (r.state === 'open' || r.state === 'falling') showRelicCard(r); else if (r.state === 'orbit' || r.state === 'rising') autoShoot(r); return; }
  const h = hits.find(x => !x.object.userData.relic); if (!h) return;
  if (h.object.userData.star){ touchStar(h.object.userData.star); return; }
  if (h.object.userData.perch){ flyTo(h.object.userData.perch); return; }
  if (h.object.userData.bird){ if (byBird) openLetter(); else goToCrane(); return; }
  /* a stone: land on its top (where you clicked, if you clicked the top), flying across unless you already stand on it */
  const st = h.object.userData.stone && stoneAt(h.point);
  if (st){ const p = Math.abs(h.point.y - st.y) < .02 ? h.point.clone() : new V3(st.x, st.y, st.z);
    if (Math.abs(P.pos.y - st.y) < .05 && Math.hypot(P.pos.x - st.x, P.pos.z - st.z) < st.reach) P.target = p; else flyTo(p); return; }
  const p = h.point.clone();
  /* the lake: the ray hits the bed under the water, so aim at the surface above it and always jump there */
  if (p.y < WATER_Y && ray.ray.direction.y < 0){ const k = (WATER_Y - ray.ray.origin.y)/ray.ray.direction.y; p.copy(ray.ray.origin).addScaledVector(ray.ray.direction, k);
    if (overWater(p.x, p.z)){ flyTo(p); return; } p.copy(h.point); }
  if (Math.abs(p.y - P.pos.y) > 2.4) flyTo(p); else P.target = p;
}
/* which star the pointer is over, if any (checked once per frame) */
let hoverStar = null;
function updateHover(){
  if (!pointer || !pointer.dirty || drag) return; pointer.dirty = false;
  ndc.set(pointer.x/innerWidth*2-1, -(pointer.y/innerHeight)*2+1); ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(sky.hits.concat(bird.pick), false)[0]; hoverStar = h && h.object.userData.star || null; canvas.classList.toggle('pointing', !!h && mode !== 'aim');
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
  const hit = collisionWorld.rayHit(camera.position, ray.ray.direction, 140, s => s.arrows);
  if (hit) aimPt = hit.point;
  const relicAim = relicAimPoint(ray.ray, RELICS, hit ? hit.distance : 140);
  if (relicAim) aimPt = relicAim.point;
  fireArrow(from, aimPt.sub(from), 26 + 52*P.draw, null); P.draw = 0;
}
function setMode(m){ craneApproach = null; mode = m; document.getElementById('modeAuto').setAttribute('aria-pressed', m === 'auto'); document.getElementById('modeAim').setAttribute('aria-pressed', m === 'aim');
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
function setGaze(on){ if (on === gaze) return; craneApproach = null; gaze = on; skipIntro(); gazeT = 0;
  if (on){ gazePitch = camS.pitch; if (mode === 'aim') setMode('auto'); } else camS.pitch = Math.min(camS.pitch, gazePitch > .6 ? .2 : gazePitch);
  lookBtn.setAttribute('aria-pressed', on); lookBtn.textContent = on ? 'Back down · C' : 'Look up · C'; }
lookBtn.addEventListener('click', () => setGaze(!gaze));

/* ---------- camera ---------- */
let intro = reduceMotion ? null : { t:0, dur:6.5, from:new V3(5, 5, 36), look:new V3(0, ORACLE_Y-4, 0) };
let craneApproach = null;
const glideEase = t => t*t*(3 - 2*t);
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
  /* stay above the grass tops so blades never fill the view */
  if (wantPos.y < groundH(wantPos.x, wantPos.z) + .95) wantPos.y = groundH(wantPos.x, wantPos.z) + .95;
  // Foreground solids may hide the wanderer. Keep the chosen framing instead of pulling the lens toward the head.
  wantLook.copy(pivot).addScaledVector(L, 30);
}
followPose(); camPos.copy(intro ? intro.from : wantPos); camLook.copy(intro ? intro.look : wantLook);
function updateCamera(dt){
  if (gaze && gazeT < 2.5){ gazeT += dt; camS.pitch = lerp(camS.pitch, 1.42, 1 - Math.exp(-dt*(reduceMotion ? 30 : 2.6))); }
  followPose();
  if (intro){
    intro.t += dt;
    // Begin travelling while the opening camera is still descending. Both motions share the same target.
    if (!welcomed && intro.t >= intro.dur - 1.2) welcome(true);
  }
  const ride = craneApproach;
  const riding = ride && (P.flight === ride.flight || ride.flight.t >= 1);
  if (riding){
    const t = Math.min(1,ride.flight.t), e = glideEase(t);
    camS.dist = lerp(ride.fromDist,ride.toDist,e);
    // Translate with the wanderer and dolly forward along the existing view. No orbit or lens change.
    wantPos.copy(ride.fromCamera).add(P.pos.clone().sub(ride.fromPlayer)).addScaledVector(ride.direction,ride.fromDist - camS.dist);
    wantLook.copy(wantPos).addScaledVector(ride.direction,ride.lookDistance);
  }
  if (intro){ const e = sstep(0,1,(intro.t-1.6)/(intro.dur-1.6));
    camPos.lerpVectors(intro.from, wantPos, e); camLook.lerpVectors(intro.look, wantLook, e); if (intro.t >= intro.dur){ intro = null; welcome(); } }
  else if (riding){ camPos.copy(wantPos); camLook.copy(wantLook); }
  else { craneApproach = null; const k = 1 - Math.exp(-dt*(mode === 'aim' ? 14 : 7)); camPos.lerp(wantPos, k); camLook.lerp(wantLook, 1 - Math.exp(-dt*(mode === 'aim' ? 20 : 10))); }
  if (riding && ride.flight.t >= 1) craneApproach = null;
  camera.position.copy(camPos); camera.lookAt(camLook); skyGroup.position.copy(camera.position);
  const fov = mode === 'aim' ? baseFov - 6 - P.draw*12 : gaze ? baseFov + 14 : baseFov; if (Math.abs(camera.fov - fov) > .05){ camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt*8)); camera.updateProjectionMatrix(); }
}

/* ---------- simulation ---------- */
function updatePlayer(dt){
  if (P.flight){ const f = P.flight; f.t += dt/f.dur; const t = Math.min(1,f.t), e = f.ease === 'glide' ? glideEase(t) : f.ease === 'out' ? 1 - (1-t)*(1-t) : t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
    const prev = P.pos.clone(), next = new V3().lerpVectors(f.from, f.to, e); next.y += Math.sin(Math.PI*e)*f.arc;
    // Ground approaches can step onto the actual bank or path without snagging the rounded feet.
    const support = floorAt(next.x, next.z, prev.y, STEP_UP, groundH(next.x,next.z));
    const glide = f.ease === 'glide' || f.shore;
    if (glide) next.y = t >= 1 ? support.h : Math.max(next.y, support.h);
    const motion = collisionWorld.moveBody(prev, next, BODY_R, HEAD, glide ? STEP_UP : 0); P.pos.copy(motion.position);
    const d = P.pos.clone().sub(prev); if (d.x*d.x+d.z*d.z > 1e-6) P.facing = Math.atan2(d.x,d.z);
    if (t >= 1 || motion.collided){ P.flight = null; P.vel.set(0,0,0); P.flying = false;
      P.onGround = motion.grounded || Math.abs(supportAt(P.pos.x, P.pos.z, P.pos.y).h - P.pos.y) < .05;
      if (t >= 1){
        if (f.arrivalFacing !== undefined) P.facing = f.arrivalFacing;
        if (overWater(P.pos.x, P.pos.z) && P.pos.y < WATER_Y + .1) dipIn(2.2);
      }
    }
    P.speed = 0; return; }
  /* touching the water: a brief, shallow dip, then straight back out to the bank */
  if (P.dip){ const d = P.dip; d.t += dt;
    P.pos.y = WATER_Y - .12*Math.sin(Math.PI*Math.min(1, d.t/.16)); P.vel.set(0,0,0); P.onGround = true; P.speed = 0;
    if (d.t > .12){ P.dip = null; glideToShore(1.5); if (P.flight) P.flight.ease = 'out'; }
    return; }
  let mx = 0, mz = 0;
  const fwd = (keys.KeyW||keys.ArrowUp?1:0) - (keys.KeyS||keys.ArrowDown?1:0), side = (keys.KeyD||keys.ArrowRight?1:0) - (keys.KeyA||keys.ArrowLeft?1:0);
  if (fwd || side){ const fx = -Math.sin(camS.yaw), fz = -Math.cos(camS.yaw), rx = Math.cos(camS.yaw), rz = -Math.sin(camS.yaw); mx = fx*fwd + rx*side; mz = fz*fwd + rz*side; P.target = null; }
  else if (P.target){ mx = P.target.x - P.pos.x; mz = P.target.z - P.pos.z; if (Math.hypot(mx,mz) < .25){ P.target = null; mx = mz = 0; P.vel.x = P.vel.z = 0; } }
  const ml = Math.hypot(mx,mz); if (ml > 0){ mx/=ml; mz/=ml; }
  const spd = SPEED * (mode === 'aim' ? (P.drawing ? .35 : .6) : 1) * (P.flying ? 1.2 : 1);
  const k = 1 - Math.exp(-dt*(P.onGround ? 14 : P.soared ? 6 : 4)); P.vel.x = lerp(P.vel.x, mx*spd, k); P.vel.z = lerp(P.vel.z, mz*spd, k);
  let nx = P.pos.x + P.vel.x*dt, nz = P.pos.z + P.vel.z*dt; const nr = Math.hypot(nx,nz);
  const lim = P.onGround ? WORLD_R : AIR_R; if (nr > lim){ nx *= lim/nr; nz *= lim/nr; }
  /* The full airborne body meets the rendered faces; only walking gets a step allowance. */
  const step = P.onGround ? STEP_UP : 0;
  const horizontal = collisionWorld.moveBody(P.pos, new V3(nx, P.pos.y, nz), BODY_R, HEAD, step);
  nx = horizontal.position.x; nz = horizontal.position.z;
  const moved = Math.hypot(nx - P.pos.x, nz - P.pos.z);
  if (P.target && moved < spd*dt*.25){ if ((P.stall += dt) > .5){ P.target = null; P.stall = 0; } } else P.stall = 0;
  /* stepping stones: walking off one over open air toward another just ahead hops across and lands a little way onto it */
  if (P.onGround && ml > 0 && supportAt(nx, nz, P.pos.y).h < P.pos.y - .9)
    for (let d=.3; d<2.9; d+=.2){ const a = supportAt(nx + mx*d, nz + mz*d, P.pos.y + .5);
      if (a.onPlatform && a.h > P.pos.y - .9){ const to = new V3(nx + mx*(d + .5), a.h, nz + mz*(d + .5)); if (supportAt(to.x, to.z, a.h).h !== a.h) to.set(nx + mx*d, a.h, nz + mz*d);
        P.flight = { from:P.pos.clone(), to, t:0, dur:.3 + d*.1, arc:.45 + Math.max(0, a.h - P.pos.y)*.5 }; P.vel.set(0,0,0); return; } }
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
  const sup = floorAt(nx, nz, P.pos.y, step, groundH(nx,nz));
  /* The rendered bank stays walkable, including during low jumps. Only touching open water splashes and returns to shore. */
  if (!sup.onPlatform && !P.flying && P.vel.y <= 0 && overWater(nx,nz) && ny <= WATER_Y){
    P.pos.set(nx, Math.max(WATER_Y, sup.h), nz);
    dipIn(1.8 + Math.min(.6, -P.vel.y/15)); return;
  }
  if (ny > CEILING){ ny = CEILING; P.vel.y = Math.min(P.vel.y, 0); }
  if (ny <= sup.h){ ny = sup.h; P.vel.y = 0; P.onGround = true; } else P.onGround = ny - sup.h < .05;
  if (P.onGround){ P.soared = false; P.energy = Math.min(1, P.energy + dt/1.4); }
  const motion = collisionWorld.moveBody(P.pos, new V3(nx, ny, nz), BODY_R, HEAD, step);
  P.pos.copy(motion.position);
  slideVelocity(P.vel, horizontal.contacts.concat(motion.contacts));
  P.onGround ||= motion.grounded;
  P.speed = Math.hypot(P.vel.x, P.vel.z);
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
  animateHero(H, { dt, T, walk:P.walk, moving, onGround:P.onGround, airborne, flying:P.flying, flight:!!P.flight, aiming, pitch, draw:P.draw, vel:P.vel, reduceMotion, lantern:1.7 + (1 - world.light)*.6 });
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
  shaftU.t.value = reduceMotion ? 0 : T; shaftU.hue.value.copy(oracle.light.color);
  /* the star's light breathes: slowly brighter, slowly dimmer, about every nine seconds */
  const breath = reduceMotion ? 1 : .82 + .26*(.5 - .5*Math.cos(T*.7));
  shaftU.power.value = (.85 + L*.3 + ey*.45)*breath; lakeMat.uniforms.t.value = reduceMotion ? 0 : T; lakeMat.uniforms.now.value = T; lakeMat.uniforms.energy.value = ey; lakeMat.uniforms.glow.value = L; fallMat.uniforms.t.value = T; beamMat.uniforms.t.value = T;
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
    b.v.forEach((v,k) => { v.multiplyScalar(Math.exp(-dt*1.6)); p[k*3] += v.x*dt; p[k*3+1] += v.y*dt; p[k*3+2] += v.z*dt; }); b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.material.opacity = Math.max(0, b.life/1.4); b.ring.scale.setScalar((1 + (1.4-b.life)*4)*b.power); b.ring.material.opacity = Math.max(0, b.life/1.4)*.9;
    if (b.life <= 0){ scene.remove(b.pts); scene.remove(b.ring); b.pts.geometry.dispose(); bursts.splice(i,1); } }
  braziers.forEach(b => { if (!b.lit && !P.flight && Math.hypot(P.pos.x-b.pos.x, P.pos.z-b.pos.z) < 2.8 && Math.abs(P.pos.y - b.top) < 2){ b.lit = true; litCount++; updateTracker();
      showToast(litCount < 4 ? `Brazier lit · ${litCount} of 4` : 'All four braziers burn. Something stirs in the lake.'); if (litCount === 4) wakeSecret(); }
    b.update(dt,T); });
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
/* Austin's name returns the wanderer to the crane; the card follows the paper's unfolding. */
document.getElementById('brand').addEventListener('click', goToCrane);
let welcomed = false;
function welcome(overlap=false){ if (!welcomed) goToCrane({ overlap }); }
/* ---------- the note: the crane flies toward you and opens into a large sheet of paper to write on ---------- */
const letter = document.getElementById('letter'), letterForm = document.getElementById('letterForm'), letterMsg = document.getElementById('letterMsg');
const letterFrom = document.getElementById('letterFrom'), letterStatus = document.getElementById('letterStatus'), letterSend = document.getElementById('letterSend');
document.getElementById('letterTo').textContent = NOTE.to; letterMsg.placeholder = NOTE.placeholder; letterFrom.placeholder = NOTE.from; letterFrom.setAttribute('aria-label', NOTE.from); letterSend.textContent = NOTE.send;
let writing = false, cardBeforeNote = null;
function openLetter(){ if (writing || bird.busy) return; writing = true; cardBeforeNote = card.hidden ? null : cardFor; hideCard(); if (gaze) setGaze(false); P.drawing = false; P.target = null;
  const f = camera.getWorldDirection(new V3()); bird.setWriting(true, camera.position.clone().addScaledVector(f, 2.4).add(new V3(0, -.12, 0)));
  letterStatus.textContent = ''; document.body.classList.add('writing'); }
function closeLetter(){ if (!writing) return; writing = false; letter.hidden = true; document.body.classList.remove('writing'); bird.setWriting(false); canvas.focus({ preventScroll:true });
  if (cardBeforeNote === ABOUT) craneCardPending = byBird; cardBeforeNote = null; }
/* Follow the line from the wanderer to the crane, stopping short while still facing along that same line. */
function goToCrane({ overlap=false }={}){
  if (craneApproach && P.flight === craneApproach.flight){
    if (writing) closeLetter(); if (openRelic) sendBack(openRelic); if (!card.hidden) hideCard();
    craneCardPending = true; return;
  }
  const yaw = camS.yaw, pitch = camS.pitch;
  if (!overlap) intro = null; welcomed = true;
  if (openRelic) sendBack(openRelic); if (writing) closeLetter();
  if (!card.hidden) hideCard(); if (gaze) setGaze(false); if (mode === 'aim') setMode('auto');
  P.drawing = false; P.draw = 0; P.auto = null; P.target = null; P.vel.set(0,0,0); P.flying = P.soared = false;
  const toward = new V3(CRANE_LANTERN.x - P.pos.x, 0, CRANE_LANTERN.z - P.pos.z);
  if (toward.lengthSq() < 1e-6) toward.set(0,0,-1);
  toward.normalize();
  const to = new V3(CRANE_LANTERN.x, 0, CRANE_LANTERN.z).addScaledVector(toward,-1.8); to.y = groundH(to.x, to.z);
  const arrivalFacing = Math.atan2(toward.x,toward.z);
  const travel = P.pos.distanceTo(to) > .35;
  camS.yaw = yaw; camS.pitch = pitch;
  if (travel && !reduceMotion){
    flyTo(to); P.flight.dur = Math.min(4,Math.max(1.8,P.pos.distanceTo(to)/12)); P.flight.arc = 0; P.flight.ease = 'glide'; P.onGround = false;
    P.flight.arrivalFacing = P.facing = arrivalFacing;
    const fromCamera = (overlap ? wantPos : camPos).clone(), look = overlap ? wantLook : camLook;
    craneApproach = { flight:P.flight, fromCamera, fromPlayer:P.pos.clone(), direction:look.clone().sub(fromCamera).normalize(), lookDistance:look.distanceTo(fromCamera), fromDist:camS.dist, toDist:Math.min(camS.dist,5.8) };
  }
  else {
    craneApproach = null; P.flight = null; P.dip = null;
    if (travel){ P.pos.copy(to); P.onGround = true; camS.dist = Math.min(camS.dist,5.8); }
    P.facing = arrivalFacing;
    if (reduceMotion){ followPose(); camPos.copy(wantPos); camLook.copy(wantLook); }
  }
  craneCardPending = true;
}
document.getElementById('letterClose').addEventListener('click', closeLetter);
letter.addEventListener('click', e => { if (e.target === letter) closeLetter(); });
letter.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.stopPropagation(); closeLetter(); } });
letterForm.addEventListener('submit', async e => { e.preventDefault(); if (letterForm.company.value) return;
  const message = letterMsg.value.trim(), name = letterFrom.value.trim();
  if (!message){ letterStatus.textContent = NOTE.empty; return; }
  if (!NOTE.endpoint){ letterStatus.textContent = NOTE.offline; return; }
  letterSend.disabled = true; letterSend.textContent = NOTE.sending; letterStatus.textContent = '';
  try { const res = await fetch(NOTE.endpoint, { method:'POST', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify({ name, message }) });
    if (!res.ok) throw new Error(res.status);
    letterMsg.value = ''; writing = false; letter.hidden = true; document.body.classList.remove('writing'); bird.send(); showToast(NOTE.sent);
    if (cardBeforeNote === ABOUT) craneCardPending = byBird; cardBeforeNote = null; }
  catch { letterStatus.textContent = NOTE.failed; }
  letterSend.disabled = false; letterSend.textContent = NOTE.send; });
/* Show the name card halfway through the crane's unfolding, once per visit. Leaving closes it immediately;
   the small distance margin keeps the paper from folding and reopening at the edge of the visit. */
let byBird = false, craneCardPending = false;
function updateBird(dt){
  const d = Math.hypot(P.pos.x - CRANE_LANTERN.x, P.pos.z - CRANE_LANTERN.z), level = Math.abs(P.pos.y - groundH(CRANE_LANTERN.x, CRANE_LANTERN.z)) < 3;
  const near = welcomed && level && !P.flight && d < (byBird ? 3.6 : 3);
  if (near !== byBird){
    byBird = near; bird.setNear(near); craneCardPending = near;
    if (!near && cardFor === ABOUT) hideCard();
  }
  bird.update(dt, T, camera);
  if (byBird && craneCardPending && bird.cardReady && !writing && !openRelic && (card.hidden || cardFor === ABOUT)){
    renderCard(ABOUT, false); craneCardPending = false;
  }
  if (writing && letter.hidden && bird.ready){ letter.hidden = false; letterMsg.focus({ preventScroll:true }); }
}
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
  updateWorld(dt); updateRelics(dt); collisionWorld.updateDynamic();
  updatePlayer(dt); updateHero(dt); updateArrows(dt); updateSplashes(dt); updateCamera(dt);
  updateBird(dt); collisionWorld.updateDynamic(); updateHover();
  sky.update(dt, T, camera, { showAll:gaze, hover:hoverStar, focus:openRelic });
  updateLabels(); updateCross(); updateStamina();
}
/* everything advances by real elapsed seconds, never per frame: a slow frame is simulated in steps of at most 50 ms so the world
   keeps real time below 20 fps, and a long gap (a hidden tab) is capped at a quarter second instead of fast-forwarding */
function frame(now){
  let left = Math.max(0, Math.min(.25, (now-last)/1000)); last = now;
  while (left > 1e-4){ const dt = Math.min(.05, left); simulate(dt); left -= dt; }
  reflectLake(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
RELICS.forEach(r => { if (r.state === 'orbit') orbitPos(r, r.pos); });
requestAnimationFrame(frame);
setTimeout(() => oracleSay(LINES.intro), reduceMotion ? 200 : 2000);
if (!intro) welcome();

/* dev-only handle for poking at the scene from the browser console; stripped from production builds */
if (import.meta.env.DEV) window.__valley = { P, camS, RELICS, sky, oracle, world, colliders, collisionWorld, bird, braziers, openLetter, closeLetter, summon, setGaze, scene, camera, renderer, keys, fireArrow, arrows, flyTo,
  cameraDebug(){ return { intro:intro && intro.t, position:camPos.toArray(), desired:wantPos.toArray() }; },
  step(n=60, dt=1/60){ for (let i=0;i<n;i++) simulate(dt); reflectLake(); renderer.render(scene, camera); } };
