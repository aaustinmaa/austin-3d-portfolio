import * as THREE from 'three';
import { glowTex } from './textures.js';

// The paper crane at the corner where the path turns up to the stone stair: a folded crane perched on the roof of the
// last lantern on the right. It stands for Austin's name card. Walking up to it makes it rise and come undone the way a
// real crane does: wings up, neck and tail back down into the bird base, the petals open into the square base, and the
// square base opens toward you into a creased square of writing paper, while the name card opens. Touching that paper
// brings it close so visitors can write Austin a note on it. Walking away folds it back into the crane; a sent note folds
// up, flies off to the star, and a fresh crane settles on the lantern.
const V3 = THREE.Vector3;
const REST_YAW = Math.PI/2;   // on the lantern it faces the stair, so the path sees it in profile
const smooth = t => { t = Math.min(1, Math.max(0, t)); return t*t*(3 - 2*t); };
const span = (t, a, b) => smooth((t - a)/(b - a));
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const R2 = Math.SQRT2, C45 = Math.SQRT1_2, PK = 2 - R2, HK = R2 - 1;   // PK: where the petal hinges cross the midlines; HK: hinge midpoints on the diagonals
const HS = .8;                // half the side of the paper square, in metres
const LAVENDER = new THREE.Color(0xBCC0F2), PALE = new THREE.Color(0xF1EEF9);

/* ---------- the crane: flat paper facets, facing +z, a diamond body, creased wings raised in a V, a slender three-sided
   neck and tail, and a small head turned down at the end of the neck. Coloured side up, pale underneath. ---------- */
const CS = 1.8;
const CRANE = {
  F:[0,.02,.15], B:[0,.02,-.15], L:[-.055,.03,0], R:[.055,.03,0], T:[0,.075,0], K:[0,-.06,0],
  /* wings: broad triangles whose root runs the length of the body, with a valley crease out to the tip */
  lWF:[-.005,.07,.13], lM:[-.01,.062,0], lWB:[-.005,.07,-.13], lT:[-.36,.21,-.05],
  rWF:[.005,.07,.13], rM:[.01,.062,0], rWB:[.005,.07,-.13], rT:[.36,.21,-.05],
  /* neck and tail: slender three-sided points rising from the body; the head is a small fold turned down */
  nL:[-.03,0,.11], nR:[.03,0,.11], nF:[0,-.04,.14], N:[0,.27,.29], hL:[-.014,.27,.29], hR:[.014,.27,.29], H:[0,.22,.36],
  tL:[-.03,0,-.11], tR:[.03,0,-.11], tF:[0,-.04,-.14], A:[0,.26,-.32] };
const CRANE_FACES = [
  /* body */ ['T','F','L',0],['T','R','F',0],['T','L','B',0],['T','B','R',0],['K','L','F',0],['K','F','R',0],['K','B','L',0],['K','R','B',0],
  /* wings */ ['lWF','lT','lM',1],['lM','lT','lWB',1],['rWF','rM','rT',1],['rM','rWB','rT',1],
  /* neck */ ['nL','nR','N',1],['nR','nF','N',0],['nF','nL','N',0],
  /* head */ ['hL','H','hR',1],['hL','N','H',0],['N','hR','H',0],
  /* tail */ ['tL','A','tR',1],['tR','A','tF',0],['tF','A','tL',0] ];
const CRANE_NAMES = Object.keys(CRANE), C0 = {};
CRANE_NAMES.forEach(n => { C0[n] = new V3(...CRANE[n]).multiplyScalar(CS); });

/* where each crane point lies once its wings stand up and its neck and tail hang down: the bird base, seen side on.
   (u along the body, toward the neck; y up; w across, in half-sides of the paper.) Wings become the petals, neck and tail
   the two legs, and the body thins away along the petal hinge. */
const BIRD_Y = .126 + HK*HS;   // the crane's wing roots sit on the petal hinge
const birdAt = { T:[0,-HK+.03,0], K:[0,-HK-.03,0], F:[0,-HK,.3], B:[0,-HK,-.3], L:[-.004,-HK,0], R:[.004,-HK,0],
  nF:[0,-HK,HK], nL:[-.006,-HK,0], nR:[.006,-HK,0], N:[0,-R2+.03,0], hL:[-.003,-R2+.015,0], hR:[.003,-R2+.015,0], H:[0,-R2,0],
  tF:[0,-HK,-HK], tL:[-.006,-HK,0], tR:[.006,-HK,0], A:[0,-R2,0] };
['l','r'].forEach((sd, i) => { const w = (i ? 1 : -1)*.012;
  Object.assign(birdAt, { [sd+'WF']:[w,-HK,HK], [sd+'M']:[w,-HK,0], [sd+'WB']:[w,-HK,-HK], [sd+'T']:[w,1-HK,0] }); });
const C1 = {};
CRANE_NAMES.forEach(n => { const [w, y, u] = birdAt[n]; C1[n] = new V3(w*HS, BIRD_Y + y*HS, u*HS); });

/* the hinges the crane comes undone on */
const ax = new V3(1,0,0), az = new V3(0,0,1), q = new THREE.Quaternion();
const neckBase = new V3(0,-.013,.12).multiplyScalar(CS), tailBase = new V3(0,-.013,-.12).multiplyScalar(CS);
const angYZ = v => Math.atan2(v.y, v.z);
const neckDir = C0.N.clone().sub(neckBase), headDir = C0.H.clone().sub(C0.N), tailDir = C0.A.clone().sub(tailBase);
const HEAD_TURN = angYZ(headDir) - angYZ(neckDir);                                     // the head turns up in line with the neck
const NECK_TURN = angYZ(neckDir) - angYZ(C1.H.clone().sub(C1.nF));                     // the neck swings forward and down
const TAIL_TURN = angYZ(tailDir) - (angYZ(C1.A.clone().sub(C1.tF)) + 2*Math.PI);       // the tail swings back and down
const wingPivot = s => new V3(s*.005, .07, 0).multiplyScalar(CS);
const WING_TURN = s => Math.PI/2 - Math.atan2(C0[s > 0 ? 'rT' : 'lT'].y - wingPivot(s).y, C0[s > 0 ? 'rT' : 'lT'].x - wingPivot(s).x);
const turn = (p, o, axis, a) => p.sub(o).applyQuaternion(q.setFromAxisAngle(axis, a)).add(o);

/* ---------- the paper, unfolded: a square (corners A, edge midpoints M, centre O) with the creases of a bird base:
   both diagonals, the midlines, the petal hinges P–P and the kite creases from each corner to the hinge ends ---------- */
const PTS = [[0,0]];                                                       // 0: O
for (let j=0;j<4;j++){ const a = j*Math.PI/2; PTS.push([Math.round(Math.cos(a)), Math.round(Math.sin(a))]); }    // 1-4: M1..M4
for (let j=0;j<4;j++){ const m = PTS[1+j], n = PTS[1+(j+1)%4]; PTS.push([m[0]+n[0], m[1]+n[1]]); }               // 5-8: A1..A4
for (let j=0;j<4;j++) PTS.push(PTS[1+j].map(v => v*PK));                                                         // 9-12: P1..P4
for (let j=0;j<4;j++) PTS.push(PTS[5+j].map(v => v*HK/R2));                                                      // 13-16: H1..H4
const M = j => 1 + (j & 3), A = j => 5 + (j & 3), P = j => 9 + (j & 3), H = j => 13 + (j & 3);
/* each quarter around a corner: the part above the petal hinge, the petal itself, and the two sides that tuck under it.
   half 0 lies between M_j and A_j, half 1 between A_j and M_j+1 (its fin, while the square base opens, is that M) */
const FACES = [];
for (let j=0;j<4;j++){
  const sign = h => (j === 0 || (j === 1 && h === 0) || (j === 3 && h === 1)) ? 1 : -1, outer = j === 0 || j === 2;
  [[[0, P(j), H(j)], 0, 'top'], [[0, H(j), P(j+1)], 1, 'top'], [[P(j), A(j), H(j)], 0, 'mid'], [[H(j), A(j), P(j+1)], 1, 'mid'],
   [[P(j), M(j), A(j)], 0, 'side'], [[P(j+1), A(j), M(j+1)], 1, 'side']].forEach(([v, h, kind]) => {
    const s = sign(h), fin = h ? (j+1) & 3 : j;
    /* the order the layers stack in, front to back, in the square base (lp) and in the bird base (lb) */
    const lp = outer ? 3*s : s, lb = outer ? s*{ top:2, mid:3, side:4 }[kind] : s*{ top:1, mid:1, side:2 }[kind];
    FACES.push({ v, fin, lp, lb }); }); }
const NF = FACES.length, LAYER = .004;

/* the square base, pressed flat and seen from the front: centre at the top, the four corners together at the bottom */
const PRESSED = PTS.map((p, i) => {
  if (i === 0) return new V3();
  if (i >= 5 && i <= 8) return new V3(0, -R2, 0);
  if (i >= 13) return new V3(0, -HK, 0);
  const right = (i - 1) % 4 === 0 || (i - 1) % 4 === 3, r = i >= 9 ? PK : 1;
  return new V3((right ? 1 : -1)*C45*r, -C45*r, 0); });

/* the petal fold, undone: the front petal swings down toward you on its hinge while its sides spread out. The side
   triangle and the leg under it share the corner M, which turns about the leg's kite crease (P1–A4) and stays one
   edge-length from the petal's tip. */
const petal = (() => {
  const p1 = PRESSED[9], a4 = PRESSED[8], m1 = PRESSED[1], u = a4.clone().sub(p1).normalize();
  const c = p1.clone().addScaledVector(u, m1.clone().sub(p1).dot(u)), e1 = m1.clone().sub(c), r = e1.length(); e1.normalize();
  const d = new V3();
  return (rho, tip, out) => {   // rho: 0 pressed flat, PI folded up; tip: the petal's corner; out: the side corner M
    tip.set(0, -HK - Math.cos(rho), Math.sin(rho));
    d.subVectors(c, tip); const p = 2*r*d.dot(e1), qq = 2*r*d.z;
    let g = 2*Math.atan2(qq, p) - Math.PI; g = Math.max(0, Math.min(Math.PI, Math.abs(wrapA(g))));
    if (rho > Math.PI - 1e-4) g = Math.PI;
    out.copy(c).addScaledVector(e1, r*Math.cos(g)); out.z += r*Math.sin(g); return out; };
})();

/* the square base opening: one vertex at the centre where eight creases meet. Each M crease leans chi from the axis at
   its own azimuth; each corner crease is the one direction 45° from both of its neighbours (the one nearer the axis). */
function cornerBetween(ma, mb, out){
  const cd = ma.dot(mb), lam = C45/(1 + cd), mu = Math.sqrt(Math.max(0, cd/(1 + cd)));
  const n = new V3().crossVectors(ma, mb);
  if (n.lengthSq() < 1e-10) n.set(-ma.x*ma.z, -ma.y*ma.z, 1 - ma.z*ma.z);   // the two folds lie together: lean toward the axis
  n.normalize(); if (n.z < 0) n.negate();
  return out.copy(ma).add(mb).multiplyScalar(lam).addScaledVector(n, mu);
}

/* blank writing paper: pale lavender, faint ruled lines, the creases of the crane it was folded from, and a greeting */
function letterTexture(hint){
  const w = 512, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const X = x => (x + 1)/2*w, Y = y => (1 - y)/2*h;
  const draw = () => {
  g.fillStyle = '#E4DFF0'; g.fillRect(0,0,w,h);
  const v = g.createRadialGradient(w/2,h/2,h*.3,w/2,h/2,h*.75); v.addColorStop(0,'rgba(70,66,120,0)'); v.addColorStop(1,'rgba(70,66,120,.22)'); g.fillStyle = v; g.fillRect(0,0,w,h);
  g.strokeStyle = 'rgba(60,58,98,.2)'; g.lineWidth = 2; for (let y=150; y<h-40; y+=40){ g.beginPath(); g.moveTo(40,y); g.lineTo(w-40,y); g.stroke(); }
  /* the crane's creases, a shade darker where they fold toward you */
  g.lineWidth = 1.5; const line = (a, b, al) => { g.strokeStyle = `rgba(60,58,98,${al})`; g.beginPath(); g.moveTo(X(PTS[a][0]), Y(PTS[a][1])); g.lineTo(X(PTS[b][0]), Y(PTS[b][1])); g.stroke(); };
  for (let j=0;j<4;j++){ line(0, A(j), .16); line(0, M(j), .12); line(P(j), P(j+1), .12); line(A(j), P(j), .1); line(A(j), P(j+1), .1); }
  /* the heading says what the paper is for, in a hand sized to fit the page */
  const title = hint || 'To Austin,'; let fs = 44; g.fillStyle = 'rgba(38,42,78,.75)';
  do { g.font = `italic 500 ${fs}px "Cormorant Garamond", Georgia, serif`; } while (g.measureText(title).width > w - 84 && --fs > 24);
  g.fillText(title, 42, 104); };
  draw(); const t = new THREE.CanvasTexture(c);
  /* draw the page again once the handwriting face has loaded */
  if (document.fonts) document.fonts.load('italic 500 44px "Cormorant Garamond"').then(() => { draw(); t.needsUpdate = true; }).catch(() => {});
  return t;
}

/* paper lights itself evenly: a soft key from just above the viewer and a little sky, worked out per facet, so a flat
   sheet is one even tone whatever lanterns are near, and the folds still read */
const KEY = new V3(), UP = new V3(0,1,0), nW = new V3(), e1 = new V3(), e2 = new V3();
function lightFacet(n, pulse){ return Math.min(1.1, .3 + .54*Math.max(0, n.dot(KEY)) + .1*Math.max(0, n.y) + pulse*.25); }

export function createPaperBird(scene, { perch, star, hint, reduceMotion }){
  const pick = [], group = new THREE.Group(); group.rotation.order = 'YXZ'; scene.add(group);
  const onlyVisible = function(r, out){ if (this.visible) THREE.Mesh.prototype.raycast.call(this, r, out); };

  /* the crane: one facet per triangle, recoloured and relit each frame while it folds */
  const cPos = new Float32Array(CRANE_FACES.length*9), cCol = new Float32Array(CRANE_FACES.length*9), craneGeo = new THREE.BufferGeometry();
  craneGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3)); craneGeo.setAttribute('color', new THREE.BufferAttribute(cCol, 3));
  const crane = new THREE.Mesh(craneGeo, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.DoubleSide }));
  crane.castShadow = true; crane.userData.bird = true; crane.raycast = onlyVisible; group.add(crane); pick.push(crane);

  /* the sheet: one shape drawn twice, the pale inside (with the letter on it) on its front faces and the lavender outside
   on its back faces */
  const sPos = new THREE.BufferAttribute(new Float32Array(NF*9), 3), uv = new Float32Array(NF*6);
  FACES.forEach((f, i) => f.v.forEach((p, k) => { uv[i*6+k*2] = (PTS[p][0] + 1)/2; uv[i*6+k*2+1] = (PTS[p][1] + 1)/2; }));
  const inGeo = new THREE.BufferGeometry(), outGeo = new THREE.BufferGeometry();
  inGeo.setAttribute('position', sPos); outGeo.setAttribute('position', sPos); inGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  inGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NF*9), 3)); outGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NF*9), 3));
  const sheetIn = new THREE.Mesh(inGeo, new THREE.MeshBasicMaterial({ map:letterTexture(hint), vertexColors:true, side:THREE.FrontSide }));
  const sheetOut = new THREE.Mesh(outGeo, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.BackSide }));
  const sheet = new THREE.Group(); sheet.add(sheetIn, sheetOut); sheet.scale.setScalar(HS); sheet.rotation.y = Math.PI/2; sheet.visible = false; group.add(sheet);
  [sheetIn, sheetOut].forEach(m => { m.userData.bird = true; m.raycast = onlyVisible; pick.push(m); });

  /* a soft aura that sits behind the paper, so the paper itself is never cut by it */
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xC9C2FF, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); scene.add(glow);

  const cp = {}; CRANE_NAMES.forEach(n => { cp[n] = new V3(); });
  const sp = PTS.map(() => new V3()), off = new V3(), tipA = new V3(), sideM = new V3(), ms = [0,1,2,3].map(() => new V3()), as = [0,1,2,3].map(() => new V3());

  /* the crane coming undone: t 0 perched, 1 laid out flat as a bird base */
  function poseCrane(t, light){
    const tw = span(t,.02,.62), th = span(t,0,.35), tn = span(t,.12,.8), lay = span(t,.55,1), body = span(t,.3,.9);
    CRANE_NAMES.forEach(n => cp[n].copy(C0[n]));
    ['hL','hR','H'].forEach(n => turn(cp[n], C0.N, ax, HEAD_TURN*th));
    ['nL','nR','nF','N','hL','hR','H'].forEach(n => turn(cp[n], neckBase, ax, NECK_TURN*tn));
    ['tL','tR','tF','A'].forEach(n => turn(cp[n], tailBase, ax, TAIL_TURN*tn));
    [-1, 1].forEach(s => { const o = wingPivot(s), a = WING_TURN(s)*tw; ['WF','M','WB','T'].forEach(k => turn(cp[(s > 0 ? 'r' : 'l') + k], o, az, a)); });
    CRANE_NAMES.forEach(n => cp[n].lerp(C1[n], /^[FBLRTK]$/.test(n) ? body : lay));
    const tint = span(t,.25,.85);
    CRANE_FACES.forEach((f, i) => {
      for (let k=0;k<3;k++){ const p = cp[f[k]]; cPos[i*9+k*3] = p.x; cPos[i*9+k*3+1] = p.y; cPos[i*9+k*3+2] = p.z; }
      e1.subVectors(cp[f[1]], cp[f[0]]); e2.subVectors(cp[f[2]], cp[f[0]]); nW.crossVectors(e1, e2).normalize().applyQuaternion(group.quaternion);
      if (nW.dot(toCam) < 0) nW.negate();
      const L = lightFacet(nW, light), base = f[3] ? LAVENDER : PALE, c = f[3] ? 1 : 0;
      for (let k=0;k<3;k++){ cCol[i*9+k*3] = (base.r + (LAVENDER.r - base.r)*tint*(1 - c))*L; cCol[i*9+k*3+1] = (base.g + (LAVENDER.g - base.g)*tint*(1 - c))*L; cCol[i*9+k*3+2] = (base.b + (LAVENDER.b - base.b)*tint*(1 - c))*L; }
    });
    craneGeo.attributes.position.needsUpdate = craneGeo.attributes.color.needsUpdate = true; craneGeo.computeBoundingSphere();
  }

  /* the paper from bird base to open sheet: k from SWAP to 1 */
  function poseSheet(k, light){
    const rf = Math.PI*(1 - span(k,.30,.50)), rb = Math.PI*(1 - span(k,.31,.51));
    let mix, frame = null;
    if (k < .51){   /* the petals: front and back swing down, their sides spread, the legs widen again into the square base */
      PRESSED.forEach((p, i) => sp[i].copy(p));
      petal(rf, sp[A(0)], sp[M(0)]); sp[M(1)].set(-sp[M(0)].x, sp[M(0)].y, sp[M(0)].z);
      petal(rb, tipA, sideM); sp[A(2)].set(tipA.x, tipA.y, -tipA.z); sp[M(3)].set(sideM.x, sideM.y, -sideM.z); sp[M(2)].set(-sp[M(3)].x, sp[M(3)].y, sp[M(3)].z);
      mix = smooth(rf/Math.PI);
    } else {        /* the square base: it tips its open end toward you, its four fins part, and it opens out flat */
      const spread = span(k,.51,.70), tip = span(k,.51,.78), chi = Math.PI/4*(1 + span(k,.62,1)), sc = Math.sin(chi), cc = Math.cos(chi);
      const psi = [0, Math.PI - spread*Math.PI/2, Math.PI, -spread*Math.PI/2];
      ms.forEach((m, j) => m.set(sc*Math.cos(psi[j]), sc*Math.sin(psi[j]), cc));
      as.forEach((a, j) => cornerBetween(ms[j], ms[(j+1) & 3], a));
      sp[0].set(0,0,0); for (let j=0;j<4;j++){ sp[M(j)].copy(ms[j]); sp[P(j)].copy(ms[j]).multiplyScalar(PK); sp[A(j)].copy(as[j]).multiplyScalar(R2); sp[H(j)].copy(as[j]).multiplyScalar(HK); }
      frame = { psi, fade:1 - span(k,.64,.8), turn:Math.PI/2*(1 - tip) };
    }
    const pa = sPos.array;
    FACES.forEach((f, i) => {
      if (frame){ const d = frame.psi[f.fin] - (f.fin === 1 || f.fin === 2 ? Math.PI : 0), l = f.lp*LAYER*frame.fade; off.set(-Math.sin(d)*l, Math.cos(d)*l, 0); }
      else off.set(0, 0, (f.lp + (f.lb - f.lp)*mix)*LAYER);
      f.v.forEach((p, k) => { const v = e1.copy(sp[p]).add(off);
        if (frame){ const c = Math.cos(frame.turn), s = Math.sin(frame.turn), y = v.y*c - v.z*s; v.z = v.y*s + v.z*c; v.y = y; }
        pa[i*9+k*3] = v.x; pa[i*9+k*3+1] = v.y; pa[i*9+k*3+2] = v.z; }); });
    sPos.needsUpdate = true;
    /* each facet lit on the side you see: the inside faces its normal, the outside the reverse */
    sheet.getWorldQuaternion(qw);
    const ci = inGeo.attributes.color.array, co = outGeo.attributes.color.array;
    for (let i=0;i<NF;i++){
      e1.fromArray(pa, i*9+3).sub(e2.fromArray(pa, i*9)); nW.fromArray(pa, i*9+6).sub(e2); nW.crossVectors(e1, nW).normalize().applyQuaternion(qw);
      const li = lightFacet(nW, light), lo = lightFacet(nW.negate(), light);
      for (let k=0;k<3;k++){ ci.set([li, li, li], i*9+k*3); co.set([LAVENDER.r*lo, LAVENDER.g*lo, LAVENDER.b*lo], i*9+k*3); }
    }
    inGeo.attributes.color.needsUpdate = outGeo.attributes.color.needsUpdate = true;
    inGeo.computeBoundingSphere(); outGeo.boundingSphere = inGeo.boundingSphere;
    /* keep the folded paper hanging centred: the petal hinge at the crane's wing roots, the open sheet centred on its middle */
    sheet.position.y = BIRD_Y*(1 - span(k,.51,.8));
  }

  /* the crane becomes folded paper over k 0 to FOLDED, unhurried; the folded paper then opens out quickly (and the same
     the other way: the paper folds up quickly, then takes its time becoming a crane) */
  const SWAP = .3, FOLDED = .51, CRANE_SECS = 1.1, PAPER_SECS = .45, REFOLD = CRANE_SECS + PAPER_SECS;
  const rate = k => k < FOLDED ? FOLDED/CRANE_SECS : (1 - FOLDED)/PAPER_SECS;
  const refoldK = t => t < PAPER_SECS ? 1 - (1 - FOLDED)*t/PAPER_SECS : Math.max(0, FOLDED*(1 - (t - PAPER_SECS)/CRANE_SECS));
  function pose(k, light){
    crane.visible = k < SWAP; sheet.visible = !crane.visible;
    if (crane.visible) poseCrane(k/SWAP, light); else poseSheet(k, light);
  }

  /* k: unfolding above the lantern (0 perched, 1 open there); z: brought close to the viewer to write on (0 at the lantern, 1 close) */
  const rest = perch.clone().add(new V3(0, .04, 0)), above = rest.clone().add(new V3(0, 1.3, 0)), close = rest.clone(), at = new V3(), toCam = new V3(), camR = new V3(), qw = new THREE.Quaternion();
  let k = 0, z = 0, near = false, writing = false, pulse = 0, away = -1, side = 1;   // away: time since a sent note began to fold (-1 when not); side: which face of the bird base turns to you
  const faceYaw = () => Math.atan2(toCam.x, toCam.z) - side*Math.PI/2;
  function chooseSide(){ toCam.subVectors(camPos, rest); const y = Math.atan2(toCam.x, toCam.z); side = Math.abs(wrapA(y - Math.PI/2 - REST_YAW)) < Math.PI/2 ? 1 : -1; sheet.rotation.y = side*Math.PI/2; }
  const camPos = new V3();
  function light(camera){
    camPos.setFromMatrixPosition(camera.matrixWorld); camR.setFromMatrixColumn(camera.matrixWorld, 0);
    toCam.subVectors(camPos, group.position).normalize(); KEY.copy(toCam).addScaledVector(UP, .55).addScaledVector(camR, -.3).normalize();
  }
  function update(dt, T, camera){
    pulse = Math.max(0, pulse - dt); camPos.setFromMatrixPosition(camera.matrixWorld);
    if (away >= 0){ /* a sent note: fold back into a crane where it is, fly off to the star, then a new crane settles on the lantern */
      const F = REFOLD; away += reduceMotion ? F + 3.8 : dt; const fly = span(away, F, F + 2.5), back = span(away, F + 3, F + 3.8), s = star();
      if (away < F + 2.8){ at.lerpVectors(close, s, fly); at.y += Math.sin(Math.PI*fly)*2; group.position.copy(at); group.scale.setScalar(Math.max(.001, 1 - fly*.9)); light(camera);
        const fy = faceYaw(); group.rotation.set(-.3*fly, fy + wrapA(Math.atan2(s.x - at.x, s.z - at.z) - fy)*span(away, F, F + .7), 0); pose(refoldK(away), 0); }
      else { group.position.copy(rest); group.rotation.set(0, REST_YAW, 0); group.scale.setScalar(Math.max(.001, back)); light(camera); pose(0, 0); }
      glow.position.copy(group.position); glow.scale.setScalar(1.2); glow.material.opacity = away < F + 2.8 ? .4*(1 - fly) : .14*back;
      if (back >= 1){ away = -1; k = 0; z = 0; writing = false; group.scale.setScalar(1); }
      return; }
    const step = reduceMotion ? 1 : dt*rate(k), wantK = near || writing ? 1 : 0, wantZ = writing && k > .99 ? 1 : 0;
    if (z > 0 || wantZ > 0) z += Math.sign(wantZ - z)*Math.min(Math.abs(wantZ - z), reduceMotion ? 1 : dt/1.2);
    else { if (k === 0 && wantK > 0) chooseSide(); k += Math.sign(wantK - k)*Math.min(Math.abs(wantK - k), step); }
    /* the crane rises off its lantern and turns its folds toward you; once open, the sheet can come close */
    const lift = span(k, 0, .3), zz = smooth(z), idle = k === 0 && !reduceMotion;
    group.position.lerpVectors(rest, above, lift).lerp(close, zz);
    if (idle) group.position.y += Math.sin(T*1.6)*.015;
    else if (!reduceMotion) group.position.y += Math.sin(T*1.1)*.03*span(k,.7,1)*(1 - zz);
    light(camera);
    const restYaw = REST_YAW + (idle ? Math.sin(T*.5)*.08 : 0);
    group.rotation.set(0, restYaw + wrapA(faceYaw() - restYaw)*span(k, 0, .45), 0); group.updateMatrixWorld();
    pose(k, pulse);
    const open = span(k,.5,1);
    glow.position.copy(group.position).addScaledVector(toCam, -.35 - open*.25); glow.position.y += .12*(1 - open);
    glow.scale.setScalar(1.2 + open*2.2); glow.material.opacity = .14 + open*.2 + pulse*.4;
  }
  return { pick, update, position:group.position, sheetPosition:group.position,
    get busy(){ return away >= 0; }, get unfolded(){ return away < 0 && k > .99 && z === 0; }, get ready(){ return writing && z > .97; },
    /* the wanderer is close: unfold above the lantern (or fold back up when they leave) */
    setNear(on){ near = on; },
    /* bring the sheet close to write on (to: a point in front of the camera), or send it back above the lantern */
    setWriting(on, to){ if (away >= 0) return; if (on && !writing && to) close.copy(to); writing = on; },
    /* the note is sent: fold up and fly to the star */
    send(){ if (away < 0){ away = 0; writing = false; close.copy(group.position); } },
    pulse(){ pulse = 1; },
    /* for checking the fold in the browser: set how far it has opened */
    get k(){ return k; }, set k(v){ k = v; } };
}
