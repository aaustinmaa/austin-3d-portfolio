import * as THREE from 'three';
import { glowTex } from './textures.js';

// The wanderer: a hooded archer in a long split cloak with a gilded mantle, a lantern at the hip, a quiver on the
// back, a recurve bow and a long scarf that trails in the wind (simulated as a chain of points).
const V3 = THREE.Vector3, DOWN = new V3(0,-1,0);

/* the bow, in its own space: the limbs bulge toward +x, the string runs between the tips at x = TIP_X */
export const TIP_X = .1, TIP_Y = .5, GRIP_X = .42;
export const BOW_REST = new V3(-.34,.72,-.3), BOW_AIM = new V3(-.08,1.28,.06);
export const BOW_TURN = new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0), -Math.PI/2);

export function buildHero(scene){
  const root = new THREE.Group(); scene.add(root);
  const M = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.85, flatShading:true }, o));
  const lathe = (pts, seg=18, a0=0, len=Math.PI*2) => new THREE.LatheGeometry(pts.map(([r,y]) => new THREE.Vector2(r,y)), seg, a0, len);
  const mesh = (g, m, parent=root, shadow=true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; parent.add(o); return o; };
  const mat = { cloak:M(0x27314B, { side:THREE.FrontSide }), lining:M(0x101420, { side:THREE.BackSide }), tunic:M(0x1D2435), mantle:M(0x36425F),
    leather:M(0x3B2D25), gold:M(0xC9A86A, { metalness:.7, roughness:.35, emissive:0x2A1E08, emissiveIntensity:.6 }), shade:M(0x07080D, { roughness:1 }), boot:M(0x1B1815), glove:M(0x171B26) };

  const body = new THREE.Group(); root.add(body);

  /* legs and boots, pivoting at the hips */
  const legs = [-1,1].map(sd => { const leg = new THREE.Group(); leg.position.set(sd*.1,.62,0); body.add(leg);
    mesh(new THREE.CylinderGeometry(.075,.06,.52,7).translate(0,-.26,0), mat.tunic, leg);
    mesh(new THREE.SphereGeometry(.085,8,6).scale(1,.75,1.7).translate(0,-.57,.05), mat.boot, leg); return leg; });

  /* tunic, belt and buckle */
  mesh(lathe([[.21,.55],[.24,.72],[.225,.95],[.2,1.15],[.13,1.3]], 14), mat.tunic, body);
  mesh(new THREE.TorusGeometry(.238,.03,6,20).rotateX(Math.PI/2).translate(0,.8,0), mat.leather, body);
  mesh(new THREE.BoxGeometry(.08,.07,.03).translate(0,.8,.24), mat.gold, body);

  /* the cloak: split at the front, folded, with a ragged hem; it hangs from the shoulders so it can stream back */
  const gap = 1.05, cg = lathe([[.53,.25],[.5,.3],[.44,.55],[.37,.8],[.31,1.02],[.27,1.2],[.17,1.3]], 30, gap/2, Math.PI*2 - gap);
  { const p = cg.attributes.position; for (let i=0;i<p.count;i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i), phi = Math.atan2(x,z), t = Math.min(1, Math.max(0, (1.25 - y)/1));
      const k = 1 + Math.sin(phi*9)*.045*t + Math.sin(phi*4 + 1)*.02*t; p.setXYZ(i, x*k, y < .3 ? y + (Math.sin(phi*23)*.5 + Math.sin(phi*37)*.5)*.035 : y, z*k); }
    cg.translate(0,-1.3,0); cg.computeVertexNormals(); }
  const cloak = new THREE.Group(); cloak.position.y = 1.3; body.add(cloak); mesh(cg, mat.cloak, cloak); mesh(cg, mat.lining, cloak, false);

  /* mantle over the shoulders with a gold hem and clasp */
  mesh(lathe([[.385,1.02],[.375,1.08],[.31,1.2],[.21,1.3],[.12,1.37]], 22), mat.mantle, body);
  mesh(new THREE.TorusGeometry(.382,.016,5,40).rotateX(Math.PI/2).translate(0,1.02,0), mat.gold, body, false);
  mesh(new THREE.OctahedronGeometry(.045,0).translate(0,1.29,.2), mat.gold, body, false);

  /* head: a shadowed face in a cowl whose point flops back, two pale eyes */
  const head = new THREE.Group(); head.position.set(0,1.5,0); body.add(head);
  mesh(new THREE.SphereGeometry(.2,14,10), mat.shade, head);
  /* the cowl: open at the face below the brow, closed above it, tapering to a soft point that leans back */
  const hoodMat = M(0x323D5A, { side:THREE.DoubleSide }), hg = 1.55, lean = g => { const p = g.attributes.position;
    for (let i=0;i<p.count;i++){ const y = p.getY(i); if (y > .1) p.setZ(i, p.getZ(i) - (y - .1)*(y - .1)*2.8); } g.computeVertexNormals(); return g; };
  mesh(lean(lathe([[.31,-.26],[.3,-.14],[.285,0],[.26,.12]], 22, hg/2, Math.PI*2 - hg)), hoodMat, head);
  mesh(lean(lathe([[.26,.12],[.235,.2],[.19,.28],[.12,.34],[.05,.375],[.01,.385]], 22)), hoodMat, head);
  const eyeMat = new THREE.MeshBasicMaterial({ color:0xBFF6FF });
  [-1,1].forEach(sd => { const e = new THREE.Mesh(new THREE.SphereGeometry(.026,8,6).scale(1.5,.8,.6), eyeMat); e.position.set(sd*.07,.0,.19); head.add(e); });

  /* arms: sleeves that point at whatever the hands hold */
  const arms = [-1,1].map(sd => { const a = new THREE.Group(); a.position.set(sd*.27,1.22,0); body.add(a);
    mesh(new THREE.CylinderGeometry(.07,.085,.46,8).translate(0,-.23,0), mat.cloak, a);
    mesh(new THREE.TorusGeometry(.07,.013,5,14).rotateX(Math.PI/2).translate(0,-.45,0), mat.gold, a, false);
    mesh(new THREE.SphereGeometry(.05,8,6).translate(0,-.52,0), mat.glove, a); return a; });

  /* quiver across the back with fletched arrows */
  const quiver = new THREE.Group(); quiver.position.set(.08,1.0,-.24); quiver.rotation.set(.18,0,-.38); body.add(quiver);
  mesh(new THREE.CylinderGeometry(.07,.055,.56,8), mat.leather, quiver); mesh(new THREE.TorusGeometry(.072,.012,5,14).rotateX(Math.PI/2).translate(0,.24,0), mat.gold, quiver, false);
  const fletch = new THREE.MeshBasicMaterial({ color:0x9FF2FF });
  for (let i=0;i<4;i++){ const a = i*1.7, x = Math.cos(a)*.03, z = Math.sin(a)*.03, h = .3 + i*.025;
    mesh(new THREE.CylinderGeometry(.008,.008,.2,4).translate(x,h,z), mat.boot, quiver, false); mesh(new THREE.ConeGeometry(.022,.08,3).translate(x,h + .1,z), fletch, quiver, false); }

  /* lantern hanging from the belt: it swings, and it is the wanderer's own light */
  const lanternPivot = new THREE.Group(); lanternPivot.position.set(.29,.84,.12); body.add(lanternPivot);
  const metal = M(0x2A2A30, { metalness:.6, roughness:.5 });
  mesh(new THREE.CylinderGeometry(.006,.006,.1,4).translate(0,-.05,0), metal, lanternPivot, false);
  mesh(new THREE.TorusGeometry(.022,.006,4,10).translate(0,-.1,0), metal, lanternPivot, false);
  mesh(new THREE.ConeGeometry(.075,.07,6).translate(0,-.14,0), metal, lanternPivot, false);
  mesh(new THREE.CylinderGeometry(.052,.052,.12,6).translate(0,-.23,0), new THREE.MeshBasicMaterial({ color:0xFFD08A }), lanternPivot, false);
  const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(.06,.06,.13,6).translate(0,-.23,0)), new THREE.LineBasicMaterial({ color:0x3A3328 })); lanternPivot.add(cage);
  mesh(new THREE.CylinderGeometry(.07,.05,.03,6).translate(0,-.305,0), metal, lanternPivot, false);
  const lanternGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFB86B, transparent:true, opacity:.75, depthWrite:false, blending:THREE.AdditiveBlending })); lanternGlow.scale.set(1.4,1.4,1); lanternGlow.position.y = -.23; lanternPivot.add(lanternGlow);
  const lanternLight = new THREE.PointLight(0xFFB070, 1.7, 15, 2); lanternLight.position.set(0,-.2,.1); lanternPivot.add(lanternLight);
  const flyGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x7FE9F2, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); flyGlow.position.set(0,1,-.4); flyGlow.scale.set(3,3,1); root.add(flyGlow);

  /* recurve bow with gilded tips and a grip wrap */
  const bow = new THREE.Group(); bow.position.copy(BOW_REST); root.add(bow);
  const limb = new THREE.CatmullRomCurve3([[.16,.58],[TIP_X,TIP_Y],[.2,.4],[.36,.22],[GRIP_X,0],[.36,-.22],[.2,-.4],[TIP_X,-TIP_Y],[.16,-.58]].map(([x,y]) => new V3(x,y,0)));
  const bowMat = M(0xD2C3A0, { emissive:0x3A3020, emissiveIntensity:.5, roughness:.6 });
  mesh(new THREE.TubeGeometry(limb, 48, .02, 5), bowMat, bow);
  mesh(new THREE.CylinderGeometry(.03,.03,.16,6).translate(GRIP_X,0,0), mat.leather, bow);
  [1,-1].forEach(sd => mesh(new THREE.ConeGeometry(.025,.07,5).rotateZ(sd > 0 ? -.6 : Math.PI + .6).translate(.18, sd*.6, 0), mat.gold, bow, false));
  const strGeo = new THREE.BufferGeometry(); strGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0, 0,0,0],3));
  bow.add(new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color:0xBFF6FF, transparent:true, opacity:.9 })));
  const nock = new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.85,4).rotateZ(Math.PI/2), new THREE.MeshBasicMaterial({ color:0xE8F8FF })); nock.visible = false; bow.add(nock);
  const nockGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x9FF2FF, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); nockGlow.scale.set(.6,.6,1); bow.add(nockGlow);

  /* the scarf: a ribbon in world space following a chain of points pinned at the back of the neck */
  const SN = 14, SEG = .085, scarfMat = M(0xC9974A, { side:THREE.DoubleSide, flatShading:false, roughness:.7, emissive:0x5FE6F0, emissiveIntensity:0 });
  mesh(new THREE.TorusGeometry(.17,.06,6,16).rotateX(Math.PI/2).translate(0,1.31,0), scarfMat, body);
  const sPts = Array.from({ length:SN }, () => ({ p:new V3(), q:new V3() })), sPos = new Float32Array(SN*2*3), sIdx = [];
  for (let i=0;i<SN-1;i++){ const a = i*2; sIdx.push(a, a+1, a+2, a+2, a+1, a+3); }
  const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setIndex(sIdx);
  const scarf = new THREE.Mesh(sGeo, scarfMat); scarf.frustumCulled = false; scarf.castShadow = true; scene.add(scarf);

  return { root, body, legs, arms, cloak, head, lanternPivot, lanternGlow, lanternLight, flyGlow, eyeMat, bow, strGeo, nock, nockGlow, scarfMat, scarf:{ pts:sPts, pos:sPos, geo:sGeo, seg:SEG, ready:false } };
}

/* one frame of animation. s: { dt, T, walk, moving, onGround, airborne, flying, flight, aiming, pitch, draw, vel } */
const tv = new V3(), tq = new THREE.Quaternion(), te = new THREE.Euler(), anchor = new V3(), right = new V3(), grip = new V3(), str = new V3();
export function animateHero(h, s){
  const { dt, T, moving } = s, sw = Math.sin(s.walk)*.7*moving*(s.onGround ? 1 : .2);
  h.legs[0].rotation.x = s.airborne ? .55 : sw; h.legs[1].rotation.x = s.airborne ? .15 : -sw;
  h.body.position.y = Math.abs(Math.sin(s.walk))*.045*moving;
  const stream = s.flight || s.airborne ? 1 : moving;
  h.cloak.rotation.x = -(stream*.32 + (s.flying ? .25 : 0)) + Math.sin(T*1.7)*.025; h.cloak.rotation.z = Math.sin(T*1.1)*.02;
  h.head.rotation.x = s.aiming ? -s.pitch*.35 : 0;
  h.eyeMat.color.setHex(s.flying ? 0xE8FFFF : 0xBFF6FF);
  h.scarfMat.emissiveIntensity += ((s.flying ? 1.1 : s.airborne ? .35 : 0) - h.scarfMat.emissiveIntensity)*(1 - Math.exp(-dt*6));
  h.flyGlow.material.opacity += ((s.flying ? .75 : 0) - h.flyGlow.material.opacity)*(1 - Math.exp(-dt*6));

  /* bow placement, string and nocked arrow */
  h.bow.position.lerp(s.aiming ? BOW_AIM : BOW_REST, 1 - Math.exp(-dt*12));
  h.bow.quaternion.setFromEuler(te.set(s.aiming ? -s.pitch : .1, 0, 0)).multiply(BOW_TURN);
  const midX = TIP_X - s.draw*.38;
  h.strGeo.attributes.position.array.set([TIP_X, TIP_Y, 0, midX, 0, 0, TIP_X, -TIP_Y, 0]); h.strGeo.attributes.position.needsUpdate = true;
  h.nock.visible = s.draw > .02; h.nock.position.set(midX + .42, 0, 0); h.nockGlow.position.set(midX + .85, 0, 0); h.nockGlow.material.opacity = s.draw*.9;

  /* arms: the left hand holds the grip, the right draws the string or swings with the stride */
  grip.set(GRIP_X, 0, 0).applyQuaternion(h.bow.quaternion).add(h.bow.position);
  h.arms[0].quaternion.setFromUnitVectors(DOWN, tv.copy(grip).sub(h.arms[0].position).normalize());
  if (s.aiming && s.draw > .01){ str.set(midX, 0, 0).applyQuaternion(h.bow.quaternion).add(h.bow.position); h.arms[1].quaternion.setFromUnitVectors(DOWN, tv.copy(str).sub(h.arms[1].position).normalize()); }
  else { tq.setFromEuler(te.set(-sw*.7 + (s.airborne ? -.5 : 0), 0, .12 + (s.airborne ? .35 : 0))); h.arms[1].quaternion.slerp(tq, 1 - Math.exp(-dt*10)); }

  /* lantern swings with the stride and lags when turning */
  h.lanternPivot.rotation.x = Math.sin(s.walk + .8)*.35*moving - (s.airborne ? .6 : 0)*Math.min(1, s.vel.length()/6);
  h.lanternPivot.rotation.z = Math.sin(T*1.3)*.05 + Math.sin(s.walk)*.08*moving;
  h.lanternGlow.material.opacity = .62 + Math.sin(T*3)*.1; h.lanternLight.intensity = (s.lantern ?? 1.7) + Math.sin(T*3)*.15;

  /* scarf: verlet chain pinned at the neck, pulled by gravity, pushed back by wind, kept off the body */
  const sc = h.scarf, N = sc.pts.length; anchor.set(0, 1.32 + h.body.position.y, -.15); h.root.localToWorld(anchor);
  right.set(1,0,0).applyQuaternion(h.root.quaternion);
  if (!sc.ready){ sc.pts.forEach((p,i) => { p.p.copy(anchor).y -= i*sc.seg; p.q.copy(p.p); }); sc.ready = true; }
  const back = tv.set(0,0,-1).applyQuaternion(h.root.quaternion), gust = Math.sin(T*1.7)*.5 + Math.sin(T*3.1)*.3;
  const step = Math.min(dt, 1/30);
  sc.pts.forEach((p, i) => { if (!i){ p.q.copy(p.p); p.p.copy(anchor); return; }
    const vx = (p.p.x - p.q.x)*.94, vy = (p.p.y - p.q.y)*.94, vz = (p.p.z - p.q.z)*.94; p.q.copy(p.p);
    const lift = s.flying ? 3.2 : 0;
    p.p.x += vx + (back.x*1.6 + right.x*gust*.6)*step*step*i*.6; p.p.y += vy + (-5.5 + lift + Math.sin(T*4 + i*.6)*.6)*step*step; p.p.z += vz + (back.z*1.6 + right.z*gust*.6)*step*step*i*.6; });
  for (let it=0; it<3; it++) for (let i=1;i<N;i++){ const a = sc.pts[i-1].p, b = sc.pts[i].p; tv.copy(b).sub(a); const d = tv.length() || 1e-4; b.copy(a).addScaledVector(tv, sc.seg/d);
    const lx = b.x - h.root.position.x, lz = b.z - h.root.position.z, ly = b.y - h.root.position.y, rr = Math.hypot(lx, lz);
    if (ly > .2 && ly < 1.35 && rr < .34){ const k = .34/(rr || 1e-4); b.x = h.root.position.x + lx*k; b.z = h.root.position.z + lz*k; } }
  for (let i=0;i<N;i++){ const p = sc.pts[i].p, w = .07*(1 - i/N*.55), tw = Math.sin(T*2 + i*.5)*.4;
    const rx = right.x*Math.cos(tw), ry = Math.sin(tw)*.6, rz = right.z*Math.cos(tw);
    sc.pos.set([p.x - rx*w, p.y - ry*w, p.z - rz*w, p.x + rx*w, p.y + ry*w, p.z + rz*w], i*6); }
  sc.geo.attributes.position.needsUpdate = true; sc.geo.computeVertexNormals();
}
