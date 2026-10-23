import * as THREE from 'three';
import { fbm } from './noise.js';
import { glowTex, hazeTex, runeTex, sigilTex, dialTex, paperTex, sealTex } from './textures.js';
import { withEdges, edgeGlow } from './polyhedra.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

// The relic models. Each form returns a group plus `tick(dt, T, k)`, called every frame with k easing from 0 (sealed,
// drifting overhead) to 1 (brought down and open), so a relic unfolds when it reaches the wanderer.
// Shapes are faceted rather than smooth and every solid is convex (no corner pokes out and none folds in); every
// larger part carries a soft aura so a relic reads as a hazy light in the sky rather than a crisp object.
const hull = geo => { const p = geo.attributes.position, pts = []; for (let i=0;i<p.count;i++) pts.push(new V3(p.getX(i), p.getY(i), p.getZ(i))); return new ConvexGeometry(pts); };
const V3 = THREE.Vector3, C = h => new THREE.Color(h);
const std = (c, o={}) => new THREE.MeshStandardMaterial(Object.assign({ color:c, roughness:.5, metalness:.2, flatShading:true }, o));
const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };
const lathe = (pts, seg=32) => new THREE.LatheGeometry(pts.map(([r,y]) => new THREE.Vector2(r,y)), seg);
const glow = (color, opacity, scale, map=glowTex) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent:true, opacity, depthWrite:false, blending:THREE.AdditiveBlending, fog:false })); s.scale.set(scale, scale, 1); return s; };
const additive = (o) => Object.assign({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide }, o);
function roundRect(w, h, r){ const s = new THREE.Shape(), x = -w/2, y = -h/2;
  s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r); s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h); s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r); s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y); return s; }
const slab = (shape, depth, bevel=.015) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled:true, bevelThickness:bevel, bevelSize:bevel, bevelSegments:2, curveSegments:6 }).translate(0,0,-depth/2);
const tri = (pts) => { const s = new THREE.Shape(); s.moveTo(...pts[0]); pts.slice(1).forEach(p => s.lineTo(...p)); s.closePath(); return s; };

const FORMS = {
  /* WatApply: a sealed letter; the flap lifts and the page slides out */
  letter(g, r){
    const paper = std(0xD9E2E6, { emissive:0x2A5260, emissiveIntensity:.8, roughness:.8, metalness:0 }), fold = std(0xC4D3DA, { emissive:0x24485A, emissiveIntensity:.8, roughness:.8, metalness:0 });
    const body = new THREE.BoxGeometry(1.8,1.2,.05,6,4,1); { const p = body.attributes.position; for (let i=0;i<p.count;i++) p.setZ(i, p.getZ(i) - p.getX(i)*p.getX(i)*.07 - p.getY(i)*p.getY(i)*.05); body.computeVertexNormals(); }
    add(g, body, paper);
    const page = add(g, new THREE.PlaneGeometry(1.52,1.02), new THREE.MeshStandardMaterial({ map:paperTex, emissive:0x3A4A50, emissiveIntensity:.5, roughness:.9 })); page.position.z = .035;
    /* the back of the envelope as three folded panels, each tipped back at its outer edge so the folds rise to the middle */
    [[[-.9,-.6],[-.9,.6],[-.02,-.08]], [[.9,-.6],[.9,.6],[.02,-.08]], [[-.9,-.6],[.9,-.6],[0,-.04]]].forEach((pts, i) => {
      const panel = add(g, slab(tri(pts), .018, .004), fold); panel.position.z = .05 + i*.004; panel.rotation.set(i === 2 ? .06 : 0, i === 0 ? -.07 : i === 1 ? .07 : 0, 0); });
    const hinge = new THREE.Group(); hinge.position.set(0,.6,.07); g.add(hinge);
    const flap = add(hinge, slab(tri([[-.9,0],[.9,0],[0,-.78]]), .02, .006), fold);
    const seal = new THREE.Group(); seal.position.set(0,-.66,.03); hinge.add(seal);
    const sg = new THREE.CylinderGeometry(.19,.22,.08,9).rotateX(Math.PI/2);
    add(seal, sg, std(r.color, { emissive:r.color, emissiveIntensity:1.1, roughness:.4 }));
    const mark = add(seal, new THREE.CircleGeometry(.16,9), new THREE.MeshBasicMaterial(additive({ map:sealTex, color:0xE8FFFF, opacity:.9 }))); mark.position.z = .045;
    return (dt, T, k) => { hinge.rotation.x = -k*2.3; page.position.y = k*.55; page.position.z = .035 + k*.02; seal.scale.setScalar(1 - k*.35); flap.material.emissiveIntensity = .8 + k*.3; };
  },

  /* SuWuDu: a silk cocoon with a pixel creature inside; the silk loosens and the creature wakes */
  cocoon(g, r){
    const prof = []; for (let i=0;i<=8;i++){ const t = i/8; prof.push([Math.max(.001, .86*Math.pow(Math.sin(Math.PI*t), .75)*(1 - (t - .5)*.18)), -1.15 + 2.3*t]); }
    const egg = lathe(prof, 7); { const p = egg.attributes.position; for (let i=0;i<p.count;i++){ const a = p.getY(i)*.7, x = p.getX(i), z = p.getZ(i); p.setX(i, x*Math.cos(a) - z*Math.sin(a)); p.setZ(i, x*Math.sin(a) + z*Math.cos(a)); } }
    const shellGeo = hull(egg);
    const shell = add(g, shellGeo, std(r.color, { transparent:true, opacity:.24, emissive:r.color, emissiveIntensity:.45, depthWrite:false, side:THREE.DoubleSide, roughness:.3 }));
    const rim = add(g, withEdges(shellGeo), edgeGlow({ color:r.color, lit:.85, fill:.9, halo:18, line:.25, fog:true }));
    const silk = new THREE.Group(); g.add(silk); const silkMat = new THREE.MeshBasicMaterial(additive({ color:0xFFE4EF, opacity:.55 }));
    for (let h=0;h<3;h++){ const pts = []; for (let i=0;i<=17;i++){ const t = i/17, y = -1.05 + 2.1*t, rr = .9*Math.pow(Math.sin(Math.PI*(t*.92 + .04)), .75) + .03, a = t*Math.PI*2*2.4 + h*2.1; pts.push(new V3(Math.cos(a)*rr, y, Math.sin(a)*rr)); }
      add(silk, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 34, .012, 3), silkMat); }
    const M4 = new THREE.Matrix4(), pet = new THREE.InstancedMesh(new THREE.BoxGeometry(.15,.15,.15), std(0xFFD6E6, { emissive:0xFF7FB0, emissiveIntensity:1.1 }), 30); let n = 0;
    ['X...X','XXXXX','X.X.X','XXXXX','.XXX.','.X.X.'].forEach((row,y) => [...row].forEach((ch,x) => { if (ch==='X'){ M4.makeTranslation((x-2)*.16, (2.5-y)*.16, 0); pet.setMatrixAt(n++, M4); } })); pet.count = n;
    const petG = new THREE.Group(); petG.add(pet); g.add(petG);
    const eyes = new THREE.InstancedMesh(new THREE.BoxGeometry(.08,.08,.02), new THREE.MeshBasicMaterial({ color:0x2A0A18 }), 2); [[-1,0],[1,0]].forEach(([x],i) => { M4.makeTranslation(x*.16, .16*.5, .085); eyes.setMatrixAt(i, M4); }); petG.add(eyes);
    const motes = new THREE.Group(); g.add(motes); for (let i=0;i<6;i++){ const m = add(motes, new THREE.BoxGeometry(.06,.06,.06), new THREE.MeshBasicMaterial({ color:i%2 ? 0xFFC2DA : 0xFFFFFF })); m.userData.a = i/6*Math.PI*2; }
    return (dt, T, k) => { silk.rotation.y += dt*(.15 + k*.6); silk.scale.set(1 + k*.25, 1 + k*.08, 1 + k*.25); silkMat.opacity = .55 - k*.3;
      shell.material.opacity = .24 - k*.12; rim.material.uniforms.lit.value = .85 - k*.35;
      petG.position.y = Math.abs(Math.sin(T*(2 + k*2)))*(.05 + k*.12); petG.rotation.y = Math.sin(T*.8)*.5*(1 - k) ; petG.scale.setScalar(1 + k*.25);
      motes.children.forEach((m,i) => { const a = m.userData.a + T*.9; m.position.set(Math.cos(a)*(.95 + k*.3), Math.sin(T*1.4 + i)*.5, Math.sin(a)*(.95 + k*.3)); m.rotation.set(T, T*1.3, 0); }); };
  },

  /* Aquanow: an iceberg of data, its strata (tables) drift apart when opened and trade cubes ride the rings */
  iceberg(g, r){
    const rough = new THREE.IcosahedronGeometry(1, 2); { const p = rough.attributes.position; for (let i=0;i<p.count;i++){ const v = new V3(p.getX(i), p.getY(i), p.getZ(i)), n = fbm(v.x*1.7 + 4, v.z*1.7 + v.y*1.3);
      v.multiplyScalar(.75 + n*.5); v.y = v.y > 0 ? v.y*1.15 : v.y*1.55; v.x *= v.y < 0 ? 1 - Math.min(.45, -v.y*.3) : 1; v.z *= v.y < 0 ? 1 - Math.min(.45, -v.y*.3) : 1; p.setXYZ(i, v.x, v.y, v.z); } }
    const bg = hull(rough), berg = add(g, bg, std(0xCFE6F0, { emissive:0x2A6272, emissiveIntensity:.75, roughness:.12, metalness:.1, transparent:true, opacity:.82 }));
    add(berg, withEdges(bg), edgeGlow({ color:'#BFF2FF', lit:.55, fill:.7, halo:16, line:.2, fog:true }));
    g.add(glow(0xFFE2A0, .7, 1.9));
    const gold = std(0xE8B866, { emissive:0x6A4A10, emissiveIntensity:.8, metalness:.8, roughness:.3 });
    const strata = [[-.35,1.12],[.15,1.08],[.6,.86]].map(([y,R], i) => { const lay = new THREE.Group(); lay.position.y = y; g.add(lay);
      add(lay, new THREE.TorusGeometry(R,.02,4,7).rotateX(Math.PI/2), gold);
      add(lay, new THREE.RingGeometry(R*.15, R*.98, 7).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial(additive({ color:i===1 ? 0x9FE8FF : 0xE8B866, opacity:.1 })));
      const cubes = new THREE.Group(); lay.add(cubes); for (let c=0;c<7;c++){ const m = add(cubes, new THREE.BoxGeometry(.1,.1,.1), new THREE.MeshBasicMaterial({ color:c%3 ? 0xFFE7B0 : 0x9FE8FF })); const a = c/7*Math.PI*2; m.position.set(Math.cos(a)*R, .06, Math.sin(a)*R); }
      return { lay, y, cubes, dir:i%2 ? -1 : 1 }; });
    const water = add(g, new THREE.RingGeometry(1.25,1.4,12).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial(additive({ color:0x9FE8FF, opacity:.35 }))); water.position.y = -.12;
    return (dt, T, k) => { strata.forEach((s,i) => { s.lay.position.y = s.y*(1 + k*.7) + Math.sin(T*1.2 + i)*.03; s.cubes.rotation.y += dt*s.dir*(.5 + k*1.2); });
      water.scale.setScalar(1 + Math.sin(T*1.5)*.04 + k*.15); berg.rotation.y -= dt*.1; };
  },

  /* NEXO: a chained grimoire; the chains fall away, the cover opens and annotated glyphs rise from the pages */
  book(g, r){
    const book = new THREE.Group(); book.rotation.x = .5; g.add(book);
    const cover = std(0x2A3A72, { emissive:0x24357A, emissiveIntensity:1.1, roughness:.6 }), gold = std(0xD8B46E, { metalness:.8, roughness:.3, emissive:0x3A2A0C, emissiveIntensity:.6 });
    const board = slab(roundRect(1.3,1.7,.05), .055, .012).rotateX(-Math.PI/2);
    const back = add(book, board, cover); back.position.set(.04,-.17,0);
    add(book, new THREE.BoxGeometry(1.2,.27,1.6).translate(.05,0,0), std(0xE8E2D2, { emissive:0x3A3628, emissiveIntensity:.55, roughness:.9 }));
    /* the open page: written lines with a few glowing highlights, as if annotated */
    const text = add(book, new THREE.PlaneGeometry(1.08,1.48).rotateX(-Math.PI/2), new THREE.MeshStandardMaterial({ map:paperTex, emissive:0x2A2A30, emissiveIntensity:.6, roughness:.9 })); text.position.set(.06,.137,0);
    const marks = new THREE.MeshBasicMaterial(additive({ color:r.color, opacity:.55 }));
    [[-.08,-.38,.62],[.04,.02,.8],[-.14,.45,.42]].forEach(([x,z,w]) => { const m = add(book, new THREE.PlaneGeometry(w,.075).rotateX(-Math.PI/2), marks); m.position.set(.06 + x,.139,z); });
    add(book, new THREE.CylinderGeometry(.19,.19,1.7,4,1,false,Math.PI,Math.PI).rotateX(Math.PI/2).translate(-.6,0,0), cover);
    const hinge = new THREE.Group(); hinge.position.set(-.6,.17,0); book.add(hinge);
    const front = add(hinge, board, cover); front.position.set(.64,0,0);
    const emblem = add(hinge, new THREE.PlaneGeometry(.78,.78).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial(additive({ map:sigilTex, color:r.color, opacity:.95 }))); emblem.position.set(.66,.04,0);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz]) => { const c = add(hinge, new THREE.ConeGeometry(.12,.04,3).rotateY(sx*sz > 0 ? Math.PI/6 : -Math.PI/6), gold); c.position.set(.64 + sx*.56, .035, sz*.76); });
    const strap = add(hinge, new THREE.BoxGeometry(.22,.06,.12).translate(1.25,-.08,0), gold);
    const pageL = add(book, new THREE.PlaneGeometry(1.1,1.5).rotateX(-Math.PI/2).translate(.55,0,0), std(0xF2EBDA, { emissive:0x4A4430, emissiveIntensity:.6, side:THREE.DoubleSide, roughness:.9 })); pageL.position.set(-.55,.14,0); pageL.visible = false;
    const chains = new THREE.Group(); book.add(chains); const chainM = std(0x8A90A8, { metalness:.8, roughness:.3 });
    for (let i=0;i<18;i++){ const a = i/18*Math.PI*2; const l = add(chains, new THREE.TorusGeometry(.085,.024,4,6), chainM); l.position.set(Math.cos(a)*.95, Math.sin(a*2)*.06, Math.sin(a)*1.05); l.rotation.set(i%2 ? Math.PI/2 : 0, -a, 0); }
    const glyphs = []; for (let i=0;i<8;i++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:runeTex, color:r.color, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); s.scale.set(.5,.08,1); g.add(s); glyphs.push({ s, ph:i/8 }); }
    return (dt, T, k) => { hinge.rotation.z = k*2.75; pageL.visible = k > .2; pageL.rotation.z = Math.sin(T*1.6)*.12*k + k*1.2;
      chains.scale.setScalar(1 + k*.8); chains.visible = k < .9; chains.rotation.y += dt*.4;
      strap.visible = k < .3; book.rotation.x = .5 - k*.25;
      glyphs.forEach(o => { const t = (T*.35 + o.ph) % 1; o.s.position.set(Math.sin(o.ph*20)*.5, .2 + t*1.4, Math.cos(o.ph*13)*.4); o.s.material.opacity = k*Math.sin(t*Math.PI)*.9; }); };
  },

  /* StableWake: an hourglass under a crescent moon; sand runs, and once opened it turns over */
  hourglass(g, r){
    /* two bulbs, each convex on its own, meeting at the neck */
    const prof = []; for (let i=0;i<=6;i++){ const t = i/6; prof.push([.045 + .46*Math.pow(Math.sin(t*Math.PI*.62), .8), .8*t]); }
    const bulbT = lathe(prof, 6), bulbB = bulbT.clone().rotateX(Math.PI), glassM = std(r.color, { transparent:true, opacity:.22, emissive:r.color, emissiveIntensity:.4, depthWrite:false, side:THREE.DoubleSide, roughness:.1 });
    const glassE = edgeGlow({ color:r.color, lit:.8, fill:.9, halo:18, line:.3, fog:true });
    [bulbT, bulbB].forEach(b => { add(g, b, glassM); add(g, withEdges(b), glassE); });
    const gold = std(0xC9A86A, { metalness:.75, roughness:.3, emissive:0x3A2A10, emissiveIntensity:.55 });
    const capG = lathe([[0,0],[.66,0],[.7,.04],[.62,.1],[.48,.13],[0,.13]], 6);
    const capT = add(g, capG, gold); capT.position.y = .8; const capB = add(g, capG, gold); capB.rotation.x = Math.PI; capB.position.y = -.8;
    const postG = new THREE.CylinderGeometry(.038,.038,1.6,6);
    for (let i=0;i<3;i++){ const a = i/3*Math.PI*2 + Math.PI/6, p = add(g, postG, gold); p.position.set(Math.cos(a)*.6, 0, Math.sin(a)*.6); }
    const sandM = std(0xFFE1A0, { emissive:0xFFC060, emissiveIntensity:.9 });
    const top = add(g, new THREE.ConeGeometry(.36,.42,6).rotateX(Math.PI).translate(0,.21,0), sandM); top.position.y = .08;
    const bot = add(g, new THREE.ConeGeometry(.4,.36,6).translate(0,.18,0), sandM); bot.position.y = -.78;
    const stream = add(g, new THREE.CylinderGeometry(.012,.012,.72,4).translate(0,-.36,0), new THREE.MeshBasicMaterial({ color:0xFFE1A0 })); stream.position.y = .08;
    const moonS = new THREE.Shape(); moonS.absarc(0,0,.26,1.002,5.281,false); moonS.absarc(.12,0,.22,4.803,1.48,true);
    const moon = add(g, new THREE.ExtrudeGeometry(moonS, { depth:.05, bevelEnabled:true, bevelThickness:.01, bevelSize:.01, bevelSegments:1, curveSegments:4 }).translate(0,0,-.025), std(0xE6DCFF, { emissive:r.color, emissiveIntensity:1.3 }));
    moon.position.y = 1.2; moon.add(glow(C(r.color), .7, 1.4));
    return (dt, T, k) => { const ph = (T*.12) % 1; top.scale.set(1 - ph*.75, 1 - ph*.8, 1 - ph*.75); bot.scale.set(.3 + ph*.7, .25 + ph*.75, .3 + ph*.7); stream.scale.y = .9 + Math.sin(T*20)*.08;
      moon.rotation.y = Math.sin(T*.6)*.5; moon.position.y = 1.2 + Math.sin(T*1.1)*.05; g.rotation.z += ((k > .5 ? Math.sin(T*.5)*.35 : 0) - g.rotation.z)*(1 - Math.exp(-dt*2)); };
  },

  /* Skills & contact: a brass astrolabe with an engraved dial, a turning star map and gimbal rings */
  astrolabe(g, r){
    const gold = std(0xD8B46E, { metalness:.85, roughness:.25, emissive:0x5A4214, emissiveIntensity:.85 });
    const disc = new THREE.Group(); g.add(disc);
    add(disc, new THREE.CylinderGeometry(.95,.95,.07,12).rotateX(Math.PI/2), std(0x6A5428, { metalness:.8, roughness:.4, emissive:0x2A1E08, emissiveIntensity:.5 }));
    add(disc, new THREE.TorusGeometry(.97,.05,4,12), gold);
    const loop = add(disc, new THREE.TorusGeometry(.14,.035,4,6), gold); loop.position.y = 1.08;
    [1,-1].forEach(sd => { const face = add(disc, new THREE.CircleGeometry(.92,12), new THREE.MeshBasicMaterial(additive({ map:dialTex, color:0xFFE2A8, opacity:.85 }))); face.position.z = sd*.04; if (sd < 0) face.rotation.y = Math.PI; });
    const rete = add(disc, new THREE.CircleGeometry(.75,12), new THREE.MeshBasicMaterial(additive({ map:sigilTex, color:0xFFF0C8, opacity:.7 }))); rete.position.z = .06;
    const rule = add(disc, new THREE.BoxGeometry(1.84,.06,.02), gold); rule.position.z = .08;
    disc.add(glow(0xFFF0C8, .9, .9)); add(disc, new THREE.OctahedronGeometry(.07,0), new THREE.MeshBasicMaterial({ color:0xFFFFFF })).position.z = .1;
    const tick = new THREE.BoxGeometry(.03,.09,.03), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion();
    const rings = [1.32,1.16].map((R,i) => { const piv = new THREE.Group(); piv.rotation.set(i*.9 + .4, i*.5, 0); g.add(piv); const ring = new THREE.Group(); piv.add(ring);
      add(ring, new THREE.TorusGeometry(R,.028,4,12), gold); const n = 36, t = new THREE.InstancedMesh(tick, gold, n);
      for (let j=0;j<n;j++){ const a = j/n*Math.PI*2; M4.compose(new V3(Math.cos(a)*R, Math.sin(a)*R, 0), Q.setFromAxisAngle(new V3(0,0,1), a - Math.PI/2), new V3(1, j%3 ? 1 : 1.8, 1)); t.setMatrixAt(j, M4); } ring.add(t); return ring; });
    return (dt, T, k) => { rete.rotation.z += dt*.25; rule.rotation.z -= dt*.4; rings.forEach((ring,i) => { ring.rotation.z += dt*(.35 + i*.2)*(1 + k); ring.parent.rotation.y += dt*(.15 - i*.08); });
      disc.rotation.y = Math.sin(T*.4)*.3*(1 - k); };
  },

  /* Off the clock: a d20 with a pawn, a chip and a card circling it */
  die(g, r){
    add(g, new THREE.IcosahedronGeometry(.85,0), std(0x184A44, { emissive:0x145048, emissiveIntensity:.9, roughness:.25, metalness:.3, transparent:true, opacity:.88 }));
    add(g, withEdges(new THREE.IcosahedronGeometry(.86,0)), edgeGlow({ color:r.color, lit:.9, fill:.6, halo:16, line:.3, fog:true }));
    g.add(glow(C(r.color), .6, 1.8));
    const ico = new THREE.IcosahedronGeometry(.86,0), p = ico.attributes.position, pips = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.04,0), new THREE.MeshBasicMaterial({ color:0xC8FFEA }), p.count/3), M4 = new THREE.Matrix4();
    for (let f=0; f<p.count/3; f++){ const c = new V3(); for (let j=0;j<3;j++) c.add(new V3(p.getX(f*3+j), p.getY(f*3+j), p.getZ(f*3+j))); c.divideScalar(3).multiplyScalar(1.02); M4.makeTranslation(c.x, c.y, c.z); pips.setMatrixAt(f, M4); } g.add(pips);
    const orbit = new THREE.Group(); g.add(orbit);
    const pawn = new THREE.Group(), ivory = std(0xE9E4D8, { emissive:0x2A3A36, emissiveIntensity:.5 }); orbit.add(pawn); pawn.position.set(1.3,-.2,0);
    add(pawn, new THREE.CylinderGeometry(.06,.17,.32,6).translate(0,.16,0), ivory); add(pawn, new THREE.IcosahedronGeometry(.1,0).translate(0,.4,0), ivory);
    const chip = add(orbit, new THREE.CylinderGeometry(.2,.2,.05,8), std(0x9A2840, { emissive:0x3A0A14, emissiveIntensity:.6 })); chip.position.set(-.8,.3,1.0); chip.rotation.x = 1.1;
    add(chip, new THREE.TorusGeometry(.2,.02,3,8).rotateX(Math.PI/2), new THREE.MeshBasicMaterial({ color:0xFFF6E8 }));
    const card = add(orbit, new THREE.BoxGeometry(.32,.46,.01), std(0xF4EFE6, { emissive:0x24302C, emissiveIntensity:.5 })); card.position.set(-.5,-.1,-1.2); card.rotation.set(.3,.8,.2);
    add(card, new THREE.CircleGeometry(.06,4), new THREE.MeshBasicMaterial({ color:0xC0283E })).position.z = .006;
    return (dt, T, k) => { orbit.rotation.y += dt*(.6 + k*.6); orbit.rotation.x = Math.sin(T*.5)*.2; pawn.rotation.y += dt; chip.rotation.z += dt*2; };
  },
};

/* a soft aura: the part's own shape pushed out along its normals and drawn as additive light that is strongest at
   the silhouette, so edges blur into a glow */
function auraMat(color){ return new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false,
  uniforms:{ col:{value:C(color)}, k:{value:1}, inflate:{value:.07} },
  vertexShader:'uniform float inflate; varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position + normal*inflate, 1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
  fragmentShader:'uniform vec3 col; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = (pow(1. - f, 1.4)*.42 + .05)*k; gl_FragColor = vec4(col*a, a); }' }); }

export function buildForm(r){
  const g = new THREE.Group();
  const tick = (FORMS[r.form] || FORMS.die)(g, r);
  const aura = auraMat(C(r.color).lerp(C('#FFFFFF'), .25)), parts = [];
  g.traverse(o => { if (!o.isMesh || o.isInstancedMesh || o.material.isShaderMaterial || o.material.blending === THREE.AdditiveBlending) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere.radius >= .18) parts.push(o); });
  parts.forEach(o => o.add(new THREE.Mesh(o.geometry, aura)));
  const halo = glow(C(r.color), .55, 5.2), haze = glow(C(r.color), .55, 11, hazeTex); g.add(halo, haze);
  g.userData.tick = (dt, T, k) => { tick(dt, T, k); aura.uniforms.k.value = 1.2 - k*.4; halo.material.opacity = .55 - k*.2 + Math.sin(T*1.7)*.05; haze.material.opacity = .55 - k*.25; };
  return g;
}
