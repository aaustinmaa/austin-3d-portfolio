import * as THREE from 'three';
import { glowTex } from './textures.js';

// The paper crane at the corner where the path turns up to the stone stair: a folded crane perched on the roof of the
// last lantern on the right. It stands for Austin's name card. Walking up to it makes it unfold, there above its
// lantern, into a sheet of writing paper while the name card opens; touching that paper brings it close so visitors can
// write Austin a note on it. Walking away folds it back into the crane; a sent note folds up and flies off to the star,
// and a fresh crane settles on the lantern.
const V3 = THREE.Vector3;
const REST_YAW = Math.PI/2;   // on the lantern it faces the stair, so the path sees it in profile
const smooth = t => { t = Math.min(1, Math.max(0, t)); return t*t*(3 - 2*t); };

/* a folded crane from flat paper facets, facing +z: a diamond body, creased wings raised in a V, a slender
   three-sided neck and tail, and a small head turned down at the end of the neck. Coloured side up, pale underneath. */
function craneGeo(S){
  const P = {
    F:[0,.02,.15], B:[0,.02,-.15], L:[-.055,.03,0], R:[.055,.03,0], T:[0,.075,0], K:[0,-.06,0],
    /* wings: broad triangles whose root runs the length of the body, with a valley crease out to the tip */
    lWF:[-.005,.07,.13], lM:[-.01,.062,0], lWB:[-.005,.07,-.13], lT:[-.36,.21,-.05],
    rWF:[.005,.07,.13], rM:[.01,.062,0], rWB:[.005,.07,-.13], rT:[.36,.21,-.05],
    /* neck and tail: slender three-sided points rising from the body; the head is a small fold turned down */
    nL:[-.03,0,.11], nR:[.03,0,.11], nF:[0,-.04,.14], N:[0,.27,.29], hL:[-.014,.27,.29], hR:[.014,.27,.29], H:[0,.22,.36],
    tL:[-.03,0,-.11], tR:[.03,0,-.11], tF:[0,-.04,-.14], A:[0,.26,-.32] };
  const faces = [
    /* body */ ['T','F','L',0],['T','R','F',0],['T','L','B',0],['T','B','R',0],['K','L','F',0],['K','F','R',0],['K','B','L',0],['K','R','B',0],
    /* wings */ ['lWF','lT','lM',1],['lM','lT','lWB',1],['rWF','rM','rT',1],['rM','rWB','rT',1],
    /* neck */ ['nL','nR','N',1],['nR','nF','N',0],['nF','nL','N',0],
    /* head */ ['hL','H','hR',1],['hL','N','H',0],['N','hR','H',0],
    /* tail */ ['tL','A','tR',1],['tR','A','tF',0],['tF','A','tL',0] ];
  const top = new THREE.Color(0xBCC0F2), under = new THREE.Color(0xF1EEF9), pos = [], col = [];
  faces.forEach(f => { for (let i=0;i<3;i++){ pos.push(...P[f[i]].map(v => v*S)); const c = f[3] ? top : under; col.push(c.r, c.g, c.b); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
  g.computeVertexNormals(); return g;
}

/* blank writing paper: pale lavender, faint ruled lines, the creases of the crane it was folded from, and a greeting */
function letterTexture(){
  const w = 512, h = 640, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#E4DFF0'; g.fillRect(0,0,w,h);
  const v = g.createRadialGradient(w/2,h/2,h*.25,w/2,h/2,h*.75); v.addColorStop(0,'rgba(70,66,120,0)'); v.addColorStop(1,'rgba(70,66,120,.28)'); g.fillStyle = v; g.fillRect(0,0,w,h);
  g.strokeStyle = 'rgba(60,58,98,.22)'; g.lineWidth = 2; for (let y=150; y<h-70; y+=42){ g.beginPath(); g.moveTo(44,y); g.lineTo(w-44,y); g.stroke(); }
  g.strokeStyle = 'rgba(60,58,98,.13)'; g.lineWidth = 2; [w/3, w*2/3].forEach(x => { g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke(); }); g.beginPath(); g.moveTo(0,h/2); g.lineTo(w,h/2); g.stroke();
  const greet = () => { g.fillStyle = 'rgba(38,42,78,.75)'; g.font = 'italic 500 44px "Cormorant Garamond", Georgia, serif'; g.fillText('To Austin,', 44, 104); };
  const t = new THREE.CanvasTexture(c);
  /* draw the greeting again once the handwriting face has loaded */
  if (document.fonts) document.fonts.load('italic 500 44px "Cormorant Garamond"').then(() => { g.fillStyle = '#E4DFF0'; g.fillRect(40,60,300,60); greet(); t.needsUpdate = true; }).catch(() => {});
  greet(); return t;
}

export function createPaperBird(scene, { perch, star, reduceMotion }){
  const paper = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.9, flatShading:true, side:THREE.DoubleSide, emissive:0x34366A, emissiveIntensity:.45 });
  const pick = [];
  const crane = new THREE.Mesh(craneGeo(1.8), paper); crane.castShadow = true; crane.userData.bird = true; scene.add(crane); pick.push(crane);

  /* the sheet: a page in six panels that opens from a folded zigzag */
  const W = 1.6, H = 2.0, N = 6, sheetGeo = new THREE.PlaneGeometry(W, H, N, 1);
  const sheetMat = new THREE.MeshStandardMaterial({ map:letterTexture(), roughness:.95, flatShading:true, side:THREE.DoubleSide, emissive:0x2E2C50, emissiveIntensity:.5 });
  const sheet = new THREE.Mesh(sheetGeo, sheetMat); sheet.visible = false; sheet.userData.bird = true; scene.add(sheet); pick.push(sheet);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xC9C2FF, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); scene.add(glow);
  const pa = sheetGeo.attributes.position;
  function fold(f){ const w = W/N, th = (1 - f)*1.3;
    for (let i=0;i<pa.count;i++){ const col = i % (N + 1), y = pa.getY(i); pa.setXYZ(i, (col - N/2)*w*Math.cos(th), y, (col % 2 ? 1 : 0)*w*Math.sin(th)*.9); }
    pa.needsUpdate = true; sheetGeo.computeVertexNormals(); }

  /* k: unfolding above the lantern (0 perched, 1 open there); z: brought close to the viewer to write on (0 at the lantern, 1 close) */
  const rest = perch.clone().add(new V3(0, .04, 0)), above = rest.clone().add(new V3(0, 1.05, 0)), close = rest.clone(), tmp = new V3(), at = new V3();
  let k = 0, z = 0, near = false, writing = false, pulse = 0, away = -1;   // away: time since a sent crane left (-1 when it has not)
  function update(dt, T, camera){
    pulse = Math.max(0, pulse - dt);
    if (away >= 0){ /* a sent note: fold up where it was, fly off to the star, then a new crane settles on the lantern */
      away += reduceMotion ? 4.3 : dt; const fly = smooth((away - .5)/2.6), back = smooth((away - 3.4)/.9), s = star();
      sheet.visible = false;
      if (away < 3.2){ at.lerpVectors(close, s, fly); at.y += Math.sin(Math.PI*fly)*2; crane.visible = true; crane.position.copy(at);
        crane.rotation.set(-.3*fly, Math.atan2(s.x - close.x, s.z - close.z), 0); crane.scale.setScalar(Math.max(.001, (1 - fly)*.9)); }
      else { crane.position.copy(rest); crane.rotation.set(0, REST_YAW, 0); crane.scale.setScalar(Math.max(.001, back)); }
      glow.position.copy(crane.position); glow.scale.setScalar(1.2); glow.material.opacity = away < 3.2 ? .5*(1 - fly) : .15*back;
      if (back >= 1){ away = -1; k = 0; z = 0; writing = false; }
      return; }
    const step = reduceMotion ? 1 : dt/1.4, wantK = near || writing ? 1 : 0, wantZ = writing && k > .99 ? 1 : 0;
    if (z > 0 || wantZ > 0) z += Math.sign(wantZ - z)*Math.min(Math.abs(wantZ - z), step);
    else k += Math.sign(wantK - k)*Math.min(Math.abs(wantK - k), step);
    /* the crane lifts off its lantern, turns, and gives way to the sheet */
    const lift = smooth(k/.45), gone = smooth((k - .4)/.12);
    crane.visible = gone < 1; crane.position.lerpVectors(rest, above, lift);
    if (k === 0 && !reduceMotion) crane.position.y += Math.sin(T*1.6)*.015;
    crane.rotation.set(0, REST_YAW + lift*Math.PI*2 + (k === 0 && !reduceMotion ? Math.sin(T*.5)*.08 : 0), 0);
    crane.scale.setScalar(1 - gone*.6);
    const open = smooth((k - .45)/.55), zz = smooth(z); sheet.visible = open > 0;
    if (sheet.visible){ fold(open); sheet.position.lerpVectors(above, close, zz); if (!reduceMotion) sheet.position.y += Math.sin(T*1.1)*.03*open*(1 - zz);
      sheet.scale.setScalar((.3 + .6*open)*(1 + zz*.1)); tmp.subVectors(camera.position, sheet.position); sheet.rotation.set(0, Math.atan2(tmp.x, tmp.z), 0); }
    glow.position.copy(sheet.visible ? sheet.position : crane.position); glow.scale.setScalar(1.2 + open*1.6);
    glow.material.opacity = .14 + open*.22 + pulse*.4; paper.emissiveIntensity = .45 + pulse*.5; sheetMat.emissiveIntensity = .5 + pulse*.4;
  }
  return { pick, update, position:crane.position, sheetPosition:sheet.position,
    get busy(){ return away >= 0; }, get unfolded(){ return away < 0 && k > .99 && z === 0; }, get ready(){ return writing && z > .97; },
    /* the wanderer is close: unfold above the lantern (or fold back up when they leave) */
    setNear(on){ near = on; },
    /* bring the sheet close to write on (to: a point in front of the camera), or send it back above the lantern */
    setWriting(on, to){ if (away >= 0) return; if (on && !writing && to) close.copy(to); writing = on; },
    /* the note is sent: fold up and fly to the star */
    send(){ if (away < 0){ away = 0; writing = false; } },
    pulse(){ pulse = 1; } };
}
