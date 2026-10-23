import * as THREE from 'three';
import { glowTex } from './textures.js';

// The wanderer: a small cloth doll in a hooded, bell-shaped dress. Pure colours and soft shading, few details. It has
// no legs: the dress floats just above the ground and bobs and sways as it moves. It carries a little round lantern
// (its own light) and a golden bow.
const V3 = THREE.Vector3, DOWN = new V3(0,-1,0), FWD = new V3(0,0,1);

/* the bow, in its own space: the limbs bulge toward +x, the string runs between the tips at x = TIP_X */
export const TIP_X = .08, TIP_Y = .42, GRIP_X = .34;
export const BOW_REST = new V3(-.36,.6,-.16), BOW_AIM = new V3(-.06,1.0,.1);
export const BOW_TURN = new THREE.Quaternion().setFromAxisAngle(new V3(0,1,0), -Math.PI/2);

const COL = { dress:0x4B50B0, hood:0x5C63C8, face:0xF6E8DE, gold:0xE6C27E, eye:0x1C1838, blush:0xF2A2C4, glass:0xFFD9A0 };

export function buildHero(scene){
  const root = new THREE.Group(); scene.add(root);
  const M = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.8, metalness:0 }, o));
  const lathe = (pts, seg=36) => new THREE.LatheGeometry(pts.map(([r,y]) => new THREE.Vector2(r,y)), seg);
  const mesh = (g, m, parent, shadow=true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; parent.add(o); return o; };
  const dressMat = M(COL.dress, { emissive:0x181A44, emissiveIntensity:.7 }), hoodMat = M(COL.hood, { emissive:0x1C1F50, emissiveIntensity:.7, side:THREE.DoubleSide });
  const faceMat = M(COL.face, { emissive:0xC4ACA2, emissiveIntensity:.8, roughness:.9 }), goldMat = M(COL.gold, { metalness:.3, roughness:.45, emissive:0x4A3510, emissiveIntensity:.5 });
  const hemMat = M(COL.gold, { metalness:.3, roughness:.45, emissive:0x4A3510, emissiveIntensity:.5 });

  const body = new THREE.Group(); root.add(body);

  /* the dress: one smooth bell from a wide hem up to the neck, a gold band at the hem and a gold collar */
  const bell = [[0,.1],[.45,.1],[.49,.125]]; for (let i=1;i<=14;i++){ const t = i/14; bell.push([.12 + .36*Math.pow(1 - Math.pow(t,1.5), .7), .14 + t*.8]); } bell.push([0,.95]);
  const dress = mesh(lathe(bell), dressMat, body);
  mesh(new THREE.TorusGeometry(.458,.03,10,48).rotateX(Math.PI/2).translate(0,.135,0), hemMat, body, false);
  mesh(new THREE.TorusGeometry(.15,.035,10,32).rotateX(Math.PI/2).translate(0,.93,0), goldMat, body, false);

  /* the head: a big round porcelain face framed by a soft hood that ends in a drooping tip with a gold pom-pom */
  const head = new THREE.Group(); head.position.set(0,1.24,0); body.add(head);
  mesh(new THREE.SphereGeometry(.32,32,24).scale(1,.96,1), faceMat, head);
  const gap = 1.9;
  mesh(new THREE.SphereGeometry(.345,32,12, 0, Math.PI*2, 0, .95), hoodMat, head);
  mesh(new THREE.SphereGeometry(.345,32,18, Math.PI/2 + gap/2, Math.PI*2 - gap, .95, 1.35), hoodMat, head);
  const tip = new THREE.Group(); tip.position.set(0,.2,-.2); tip.rotation.x = -1.05; head.add(tip);
  mesh(lathe([[.13,0],[.115,.07],[.08,.15],[.04,.22],[0,.26]], 24), hoodMat, tip);
  mesh(new THREE.SphereGeometry(.055,16,12).translate(0,.27,0), goldMat, tip, false);
  const eyeMat = new THREE.MeshBasicMaterial({ color:COL.eye }), eyes = [-1,1].map(sd => { const e = new THREE.Mesh(new THREE.SphereGeometry(.04,16,12), eyeMat); e.position.set(sd*.11,-.01,.296); e.scale.set(1,1.3,.55); head.add(e); return e; });
  const blushMat = new THREE.MeshBasicMaterial({ color:COL.blush, transparent:true, opacity:.5, depthWrite:false });
  [-1,1].forEach(sd => { const b = new THREE.Mesh(new THREE.CircleGeometry(.045,20), blushMat), n = new V3(sd*.19,-.08,.25).normalize(); b.position.copy(n).multiplyScalar(.322); b.quaternion.setFromUnitVectors(FWD, n); head.add(b); });

  /* stubby arms with round hands */
  const arms = [-1,1].map(sd => { const a = new THREE.Group(); a.position.set(sd*.19,.86,0); body.add(a);
    mesh(new THREE.CylinderGeometry(.065,.078,.26,16).translate(0,-.13,0), dressMat, a);
    mesh(new THREE.SphereGeometry(.072,16,12).translate(0,-.3,0), faceMat, a); return a; });

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

  return { root, body, dress, head, eyes, arms, lanternPivot, lanternGlow, lanternLight, flyGlow, eyeMat, hemMat, bow, strGeo, nock, nockGlow };
}

/* one frame of animation. s: { dt, T, walk, moving, onGround, airborne, flying, flight, aiming, pitch, draw, vel, lantern } */
const tv = new V3(), tq = new THREE.Quaternion(), te = new THREE.Euler(), grip = new V3(), str = new V3(), cyan = new THREE.Color(0x5FE6F0), warm = new THREE.Color(0x4A3510), dark = new THREE.Color(COL.eye), eyeLit = new THREE.Color(0xBFF6FF);
export function animateHero(h, s){
  const { dt, T, moving } = s, k = 1 - Math.exp(-dt*6), up = s.airborne || s.flight;
  /* hover, bob with each step, waddle side to side and lean into the movement */
  h.body.position.y = .03 + Math.sin(T*2.2)*.022 + Math.abs(Math.sin(s.walk))*.05*moving;
  h.body.rotation.z = Math.sin(s.walk)*.07*moving;
  h.body.rotation.x += ((up ? .22 : moving*.1) - h.body.rotation.x)*k;
  const flare = 1 + (up ? .06 : 0) + Math.sin(T*3)*.008; h.dress.scale.set(flare, 1, flare);
  h.head.rotation.x = s.aiming ? -s.pitch*.35 : Math.sin(T*.9)*.04; h.head.rotation.z = Math.sin(T*.7)*.05;
  /* blink every few seconds; the eyes light up while flying */
  const blink = (T % 4.3) < .11 ? .15 : 1; h.eyes.forEach(e => { e.scale.y = 1.3*blink; });
  h.eyeMat.color.copy(s.flying ? eyeLit : dark);
  h.hemMat.emissive.lerp(s.flying ? cyan : warm, k); h.hemMat.emissiveIntensity += ((s.flying ? 1.1 : up ? .6 : .5) - h.hemMat.emissiveIntensity)*k;
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
