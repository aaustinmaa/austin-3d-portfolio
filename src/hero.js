import * as THREE from 'three';
import { glowTex, fabricTex } from './textures.js';

// The wanderer: a small doll in a down coat. The coat is quilted into puffy channels, and its parka hood has a real
// opening at the front with a padded edge, a soft point at the back and a puffy collar where it meets the coat. The face
// inside stays in shadow except for two small glowing eyes. One pale fabric throughout, with a fine ripstop weave and a
// cloth sheen. It has no legs: the coat floats just above the ground and bobs and sways as it moves. It carries a
// little round lantern (its own light) and a golden bow.
const V3 = THREE.Vector3, DOWN = new V3(0,-1,0);

/* the bow, in its own space: the limbs bulge toward +x, the string runs between the tips at x = TIP_X */
export const TIP_X = .08, TIP_Y = .42, GRIP_X = .34;
export const BOW_REST = new V3(-.36,.6,-.16), BOW_AIM = new V3(-.06,1.0,.1);
export const BOW_TURN = new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0), -Math.PI/2);

const COL = { cloth:0xC9CCF2, sheen:0xF2F0FF, glowBase:0x3E3E6A, lining:0x2A2B52, shade:0x14142A, gold:0xE6C27E, eye:0xCFF6FF, glass:0xFFD9A0 };

/* a surface from a grid: f(u, v, out) places the point for column u and row v (both 0..1). Faces are wound to point
   away from `inside`, so a front-side material shows the outside and a back-side material shows the lining. */
function gridGeo(rows, cols, f, inside){
  const pos = [], uv = [], idx = [], p = new V3();
  for (let i=0;i<=rows;i++) for (let j=0;j<=cols;j++){ f(j/cols, i/rows, p); pos.push(p.x, p.y, p.z); uv.push(j/cols, 1 - i/rows); }
  for (let i=0;i<rows;i++) for (let j=0;j<cols;j++){ const a = i*(cols+1) + j, b = a + cols + 1; idx.push(a, b, a+1, a+1, b, b+1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal, P = g.attributes.position; let dot = 0;
  for (let k=0;k<P.count;k+=5) dot += n.getX(k)*(P.getX(k) - inside.x) + n.getY(k)*(P.getY(k) - inside.y) + n.getZ(k)*(P.getZ(k) - inside.z);
  if (dot < 0){ for (let k=0;k<idx.length;k+=3){ const t = idx[k+1]; idx[k+1] = idx[k+2]; idx[k+2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
/* a smooth curve (Catmull-Rom) through evenly spaced keys */
const key = (arr, v) => { const n = arr.length - 1, x = Math.min(n - 1e-6, Math.max(0, v)*n), i = Math.floor(x), f = x - i, at = k => arr[Math.min(n, Math.max(0, k))];
  const p0 = at(i-1), p1 = at(i), p2 = at(i+1), p3 = at(i+2);
  return .5*(2*p1 + (p2 - p0)*f + (2*p0 - 5*p1 + 4*p2 - p3)*f*f + (3*p1 - p0 - 3*p2 + p3)*f*f*f); };
/* down quilting: round puffs between pinched seams */
const puff = (v, n, amt) => 1 + amt*Math.sqrt(Math.abs(Math.sin(Math.PI*n*v)));

export function buildHero(scene){
  const root = new THREE.Group(); scene.add(root);
  const M = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.8, metalness:0 }, o));
  const lathe = (pts, seg=36) => new THREE.LatheGeometry(pts.map(([r,y]) => new THREE.Vector2(r,y)), seg);
  const mesh = (g, m, parent, shadow=true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; parent.add(o); return o; };
  fabricTex.repeat.set(30, 12);
  /* one fabric for coat, hood, sleeves and mittens: woven bump, soft cloth sheen, a little glow of its own in the dark */
  const cloth = new THREE.MeshPhysicalMaterial({ color:COL.cloth, roughness:.8, metalness:0, sheen:new THREE.Color(COL.sheen), bumpMap:fabricTex, bumpScale:.0045, emissive:COL.glowBase, emissiveIntensity:.55 });
  const lining = M(COL.lining, { roughness:1, side:THREE.BackSide, bumpMap:fabricTex, bumpScale:.006 });
  const goldMat = M(COL.gold, { metalness:.3, roughness:.45, emissive:0x4A3510, emissiveIntensity:.5 });
  /* press a flat outline onto a sphere of radius R (seen from its centre), for the eyes */
  const onSphere = (g, R) => { const p = g.attributes.position, v = new V3(); for (let i=0;i<p.count;i++){ v.set(p.getX(i), p.getY(i), R).normalize().multiplyScalar(R); p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; };

  const body = new THREE.Group(); root.add(body);

  /* the down coat: a bell from a wide hem to rounded shoulders, quilted into five puffy channels, with a rolled hem */
  const CR = [.5,.47,.43,.39,.36,.34,.24,.1], coatPts = [[0,.1]];
  for (let i=0;i<=48;i++){ const v = i/48, y = .12 + v*.83, ch = y < .78 ? puff((y - .12)/.66, 4, .03) : 1; coatPts.push([key(CR, v)*ch, y]); }
  coatPts.push([0,.96]);
  const dress = mesh(lathe(coatPts, 56), cloth, body);
  mesh(new THREE.TorusGeometry(.49,.045,12,64).rotateX(Math.PI/2).translate(0,.13,0), cloth, body, false);

  /* the parka hood: rows run from the crown (v = 0) down to the collar (v = 1), columns go around the head starting at
     one edge of the face opening. Near the crown the hood is drawn back into a soft point; lower down it puffs out. */
  const head = new THREE.Group(); head.position.set(0,1.17,0); body.add(head);
  /* the profile rises to a point like an onion dome, is widest at the ears and billows out again at the bottom */
  const RAD = [0,.13,.29,.4,.46,.47,.45,.43,.45,.48,.46], YS = [.54,.5,.43,.33,.2,.06,-.08,-.2,-.3,-.38,-.43];
  const open = v => { const d = (v - .61)/.26; return d*d < 1 ? 1.0*Math.sqrt(1 - d*d) : 0; };
  const hoodAt = (u, v, R, out) => { const h = open(v), a = h + u*(Math.PI*2 - 2*h), w = Math.max(0, 1 - v/.5);
    /* a soft seam runs up the back to the point; near the face the edge comes forward like a short tunnel */
    const seam = 1 - .035*Math.exp(-Math.pow((a - Math.PI)/.09, 2))*Math.min(1, v*4);
    const toEdge = Math.min(a - h, Math.PI*2 - h - a), tunnel = .08*Math.exp(-Math.pow(toEdge/.38, 2))*Math.exp(-Math.pow((v - .61)/.3, 2));
    const r = key(RAD, v)*R*seam, y = key(YS, v);
    return out.set(Math.sin(a)*r, y - .02*w*w, Math.cos(a)*r - .44*Math.pow(w, 1.5) + tunnel); };
  const inside = new V3(0,0,-.05);
  mesh(gridGeo(40, 72, (u,v,p) => hoodAt(u, v, 1, p), inside), cloth, head);
  mesh(gridGeo(40, 72, (u,v,p) => hoodAt(u, v, .9, p), inside), lining, head, false);
  /* the padded edge around the face opening */
  const rim = [], K = 28; for (let k=0;k<=K;k++) rim.push(hoodAt(0, .35 + .52*k/K, .95, new V3()));
  for (let k=K-1;k>0;k--) rim.push(hoodAt(1, .35 + .52*k/K, .95, new V3()));
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 160, .036, 12, true), cloth, head, false);
  /* inside the hood: a face in shadow with two small glowing eyes */
  const face = new THREE.Group(); face.position.set(0,-.05,.03); head.add(face);
  mesh(new THREE.SphereGeometry(.31,32,24), new THREE.MeshBasicMaterial({ color:COL.shade }), face, false);
  const eyeMat = new THREE.MeshBasicMaterial({ color:COL.eye }), eyes = [-1,1].map(sd => {
    const g = onSphere(new THREE.RingGeometry(0,1,24,4).scale(.042,.058,1).translate(sd*.1,0,0), .316); g.computeBoundingSphere(); const c = g.boundingSphere.center.clone(); g.translate(-c.x, -c.y, -c.z);
    const e = new THREE.Mesh(g, eyeMat); e.position.copy(c); face.add(e); return e; });

  /* padded sleeves with round mittens */
  const arms = [-1,1].map(sd => { const a = new THREE.Group(); a.position.set(sd*.25,.8,0); body.add(a);
    const sl = []; for (let i=0;i<=16;i++){ const v = i/16; sl.push([(.072 + .012*v)*puff(v, 2, .14), -v*.27]); }
    mesh(lathe([[0,0], ...sl, [0,-.27]], 20), cloth, a);
    mesh(new THREE.SphereGeometry(.075,16,12).translate(0,-.31,0), cloth, a); return a; });

  /* a little round lantern hanging at the side: it is the wanderer's own light */
  const lanternPivot = new THREE.Group(); lanternPivot.position.set(.31,.58,.12); body.add(lanternPivot);
  mesh(new THREE.CylinderGeometry(.008,.008,.1,6).translate(0,-.05,0), goldMat, lanternPivot, false);
  mesh(new THREE.ConeGeometry(.075,.06,16).translate(0,-.12,0), goldMat, lanternPivot, false);
  mesh(new THREE.SphereGeometry(.068,20,14).translate(0,-.19,0), new THREE.MeshBasicMaterial({ color:COL.glass }), lanternPivot, false);
  mesh(new THREE.CylinderGeometry(.05,.035,.03,16).translate(0,-.265,0), goldMat, lanternPivot, false);
  const lanternGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFB86B, transparent:true, opacity:.75, depthWrite:false, blending:THREE.AdditiveBlending })); lanternGlow.scale.set(1.3,1.3,1); lanternGlow.position.y = -.19; lanternPivot.add(lanternGlow);
  const lanternLight = new THREE.PointLight(0xFFB070, 1.7, 15, 2); lanternLight.position.set(0,-.18,.1); lanternPivot.add(lanternLight);
  const flyGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x7FE9F2, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); flyGlow.position.set(0,.5,-.2); flyGlow.scale.set(2.4,2.4,1); root.add(flyGlow);

  /* a simple golden bow with round tips */
  const bow = new THREE.Group(); bow.position.copy(BOW_REST); root.add(bow);
  const limb = new THREE.CatmullRomCurve3([[TIP_X,TIP_Y],[.25,.3],[GRIP_X,0],[.25,-.3],[TIP_X,-TIP_Y]].map(([x,y]) => new V3(x,y,0)));
  mesh(new THREE.TubeGeometry(limb, 40, .022, 8), goldMat, bow);
  [1,-1].forEach(sd => mesh(new THREE.SphereGeometry(.032,12,8).translate(TIP_X, sd*TIP_Y, 0), goldMat, bow, false));
  const strGeo = new THREE.BufferGeometry(); strGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0, 0,0,0],3));
  bow.add(new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color:0xBFF6FF, transparent:true, opacity:.9 })));
  const nock = new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.7,4).rotateZ(Math.PI/2), new THREE.MeshBasicMaterial({ color:0xE8F8FF })); nock.visible = false; bow.add(nock);
  const nockGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x9FF2FF, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); nockGlow.scale.set(.5,.5,1); bow.add(nockGlow);

  return { root, body, dress, head, eyes, arms, lanternPivot, lanternGlow, lanternLight, flyGlow, eyeMat, hemMat:cloth, bow, strGeo, nock, nockGlow };
}

/* one frame of animation. s: { dt, T, walk, moving, onGround, airborne, flying, flight, aiming, pitch, draw, vel, lantern } */
const tv = new V3(), tq = new THREE.Quaternion(), te = new THREE.Euler(), grip = new V3(), str = new V3(), cyan = new THREE.Color(0x5FE6F0), warm = new THREE.Color(COL.glowBase), dark = new THREE.Color(COL.eye), eyeLit = new THREE.Color(0xFFFFFF);
export function animateHero(h, s){
  const { dt, T, moving } = s, k = 1 - Math.exp(-dt*6), up = s.airborne || s.flight;
  /* hover, bob with each step, waddle side to side and lean into the movement */
  h.body.position.y = .03 + Math.sin(T*2.2)*.022 + Math.abs(Math.sin(s.walk))*.05*moving;
  h.body.rotation.z = Math.sin(s.walk)*.07*moving;
  h.body.rotation.x += ((up ? .22 : moving*.1) - h.body.rotation.x)*k;
  const flare = 1 + (up ? .06 : 0) + Math.sin(T*3)*.008; h.dress.scale.set(flare, 1, flare);
  h.head.rotation.x = s.aiming ? -s.pitch*.35 : Math.sin(T*.9)*.04; h.head.rotation.z = Math.sin(T*.7)*.05;
  /* blink every few seconds; the eyes light up while flying */
  const blink = (T % 4.3) < .11 ? .12 : 1; h.eyes.forEach(e => { e.scale.y = blink; });
  h.eyeMat.color.copy(s.flying ? eyeLit : dark);
  h.hemMat.emissive.lerp(s.flying ? cyan : warm, k); h.hemMat.emissiveIntensity += ((s.flying ? .9 : up ? .65 : .55) - h.hemMat.emissiveIntensity)*k;
  h.flyGlow.material.opacity += ((s.flying ? .7 : 0) - h.flyGlow.material.opacity)*k;

  /* bow placement, string and nocked arrow */
  h.bow.position.lerp(s.aiming ? BOW_AIM : BOW_REST, 1 - Math.exp(-dt*12));
  h.bow.quaternion.setFromEuler(te.set(s.aiming ? -s.pitch : .1, 0, 0)).multiply(BOW_TURN);
  const midX = TIP_X - s.draw*.32;
  h.strGeo.attributes.position.array.set([TIP_X, TIP_Y, 0, midX, 0, 0, TIP_X, -TIP_Y, 0]); h.strGeo.attributes.position.needsUpdate = true;
  h.nock.visible = s.draw > .02; h.nock.position.set(midX + .35, 0, 0); h.nockGlow.position.set(midX + .7, 0, 0); h.nockGlow.material.opacity = s.draw*.9;

  /* arms: one hand holds the bow, the other draws the string or swings gently */
  grip.set(GRIP_X, 0, 0).applyQuaternion(h.bow.quaternion).add(h.bow.position);
  h.arms[0].quaternion.setFromUnitVectors(DOWN, tv.copy(grip).sub(h.arms[0].position).normalize());
  if (s.aiming && s.draw > .01){ str.set(midX, 0, 0).applyQuaternion(h.bow.quaternion).add(h.bow.position); h.arms[1].quaternion.setFromUnitVectors(DOWN, tv.copy(str).sub(h.arms[1].position).normalize()); }
  else { tq.setFromEuler(te.set(Math.sin(s.walk)*.5*moving + (up ? -.4 : 0), 0, .18 + (up ? .3 : 0))); h.arms[1].quaternion.slerp(tq, 1 - Math.exp(-dt*10)); }

  /* the lantern swings a little with the movement */
  h.lanternPivot.rotation.x = Math.sin(s.walk + .8)*.25*moving - (up ? .4 : 0)*Math.min(1, s.vel.length()/6);
  h.lanternPivot.rotation.z = Math.sin(T*1.3)*.05;
  h.lanternGlow.material.opacity = .62 + Math.sin(T*3)*.1; h.lanternLight.intensity = (s.lantern ?? 1.7) + Math.sin(T*3)*.15;
}
