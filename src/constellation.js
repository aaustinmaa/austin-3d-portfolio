import * as THREE from 'three';

// The skill constellation: every skill is a small star far up in the night sky. Opening a project wakes the stars of the
// skills it used and draws that project's figure between them (a shortest-path tree, like a real constellation figure).
// A star shared by several projects joins their figures. The project in hand burns bright with every star named; figures
// opened earlier stay up, dimmer, with quieter names. Relics marked `figure:false` (the skills list) wake stars but draw no lines.

const TINT = { lang:'#FFF1D0', data:'#F0C77A', ai:'#8FEFF6', apps:'#D2C2FF', research:'#9FB6FF', play:'#7FF3C8' };
const R_SKY = 400, GAP = .9;   // dome radius (inside the field stars, which sit at 520) and the gap left around a star's ends, in degrees

const hash = (s, k) => { let h = 2166136261 ^ k; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10007)/10007; };

/* where the stars sit, worked out once on a flat chart around the zenith in degrees (x east, y north). Each project gets a
   home on a ring, next to the projects it shares skills with; its stars scatter along a slanted axis so figures come out
   long and irregular rather than boxy; a star shared by projects settles between them; stars only on the skills list sit
   beside stars of their own group. New skills and projects find room on their own, and the ring widens as projects are added. */
function chart(skills, relics){
  const figs = relics.filter(r => r.figure !== false), home = {};
  const uses = r => skills.filter(s => s.relics.includes(r.id)).map(s => s.id);
  const shared = (a, b) => { const B = uses(b); return uses(a).filter(id => B.includes(id)).length; };
  const ring = figs.slice(0, 1), rest = figs.slice(1);
  while (rest.length){ const last = ring[ring.length-1]; let k = 0; rest.forEach((r, i) => { if (shared(last, r) > shared(last, rest[k])) k = i; }); ring.push(rest.splice(k, 1)[0]); }
  const R = Math.max(18, ring.length*27/(Math.PI*2));
  ring.forEach((r, i) => { const a = i/ring.length*Math.PI*2 + .35, rr = R*(i%2 ? .84 : 1); home[r.id] = { x:Math.sin(a)*rr, y:Math.cos(a)*rr, axis:hash(r.id, 3)*Math.PI }; });
  const offset = (s, h) => { const a = hash(s.id, 1)*Math.PI*2, len = 2.4 + hash(s.id, 2)*3.4, u = Math.cos(a)*len*1.5, v = Math.sin(a)*len*.65;
    return { x:h.x + u*Math.cos(h.axis) - v*Math.sin(h.axis), y:h.y + u*Math.sin(h.axis) + v*Math.cos(h.axis) }; };
  const want = skills.map(s => { const hs = s.relics.map(id => home[id]).filter(Boolean); if (!hs.length) return null;
    const ps = hs.map(h => offset(s, h)); return { x:ps.reduce((t, p) => t + p.x, 0)/ps.length, y:ps.reduce((t, p) => t + p.y, 0)/ps.length }; });
  skills.forEach((s, i) => { if (want[i]) return;
    const mates = skills.map((m, j) => m.group === s.group && want[j]).filter(Boolean), a = hash(s.id, 4)*Math.PI*2, len = 3 + hash(s.id, 5)*3;
    const c = mates.length ? { x:mates.reduce((t, p) => t + p.x, 0)/mates.length, y:mates.reduce((t, p) => t + p.y, 0)/mates.length } : { x:0, y:0 };
    want[i] = { x:c.x + Math.cos(a)*len, y:c.y + Math.sin(a)*len }; });
  /* nudge apart: no two stars closer than MIN, each drawn back toward where it wants to be */
  const MIN = 4.2, p = want.map(w => ({ ...w }));
  for (let it = 0; it < 240; it++){
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++){
      const dx = p[j].x - p[i].x, dy = p[j].y - p[i].y, d = Math.hypot(dx, dy) || 1e-3; if (d >= MIN) continue;
      const k = (MIN - d)/d*.5; p[i].x -= dx*k; p[i].y -= dy*k; p[j].x += dx*k; p[j].y += dy*k; }
    p.forEach((q, i) => { q.x += (want[i].x - q.x)*.04; q.y += (want[i].y - q.y)*.04; const r = Math.hypot(q.x, q.y); if (r > 44){ q.x *= 44/r; q.y *= 44/r; } });
  }
  return Object.fromEntries(skills.map((s, i) => [s.id, [Math.atan2(p[i].x, p[i].y)*180/Math.PI, 90 - Math.hypot(p[i].x, p[i].y)]]));
}

export function createConstellation(scene, { skills, relics, labelsEl, reduceMotion, blocked }){
  const V3 = THREE.Vector3, C = h => new THREE.Color(h), px = Math.min(devicePixelRatio || 1, 1.75);
  const byRelic = Object.fromEntries(relics.map(r => [r.id, r]));
  const dir = (az, el) => { const a = az*Math.PI/180, e = el*Math.PI/180; return new V3(Math.sin(a)*Math.cos(e), Math.sin(e), -Math.cos(a)*Math.cos(e)); };
  /* the whole chart rides with the camera like the field stars, so it reads as infinitely far away instead of hanging over the valley */
  const group = new THREE.Group(); scene.add(group);
  const AT = chart(skills, relics);
  const stars = skills.map((s, i) => {
    const label = document.createElement('div'); label.className = 'slabel'; label.style.visibility = 'hidden'; labelsEl.appendChild(label);
    const d = dir(...AT[s.id]), uses = s.relics.filter(id => byRelic[id]);
    return { i, skill:s, relics:uses, dir:d, pos:d.clone().multiplyScalar(R_SKY), lit:0, hi:0, on:false, at:Infinity, pulse:0, label, text:'', side:0, w:0, h:0, behind:false };
  });
  const byId = Object.fromEntries(stars.map(s => [s.skill.id, s]));

  /* stars: one draw call, a fine point with a hazy halo; only the stars of the project in hand get a faint four-point flare */
  const N = stars.length, sg = new THREE.BufferGeometry();
  const aLit = new Float32Array(N), aHi = new Float32Array(N), aCol = new Float32Array(N*3), aPh = new Float32Array(N), aMag = new Float32Array(N);
  stars.forEach((s, i) => { const c = C(TINT[s.skill.group] || '#FFFFFF'); aCol.set([c.r,c.g,c.b], i*3); aPh[i] = i*2.399;
    aMag[i] = Math.min(1, .25*(s.relics.filter(id => byRelic[id].figure !== false).length - 1) + hash(s.skill.id, 6)*.45); });
  sg.setAttribute('position', new THREE.Float32BufferAttribute(stars.flatMap(s => [s.pos.x, s.pos.y, s.pos.z]), 3));
  [['aLit',aLit,1],['aHi',aHi,1],['aCol',aCol,3],['aPh',aPh,1],['aMag',aMag,1]].forEach(([n,a,k]) => sg.setAttribute(n, new THREE.BufferAttribute(a, k)));
  const starMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
    uniforms:{ t:{value:0}, px:{value:px} },
    vertexShader:`attribute float aLit; attribute float aHi; attribute vec3 aCol; attribute float aPh; attribute float aMag; uniform float t; uniform float px;
      varying vec3 vCol; varying float vLit; varying float vHi; varying float vMag; varying float vBoost; varying float vTw; varying float vSize;
      void main(){ vCol = aCol; vLit = min(aLit, 1.); vHi = aHi; vMag = aMag; vBoost = max(aLit - 1., 0.);
        vTw = .82 + .18*sin(t*(1.1 + fract(aPh)*1.6) + aPh*7.);
        vSize = mix(6., mix(14., 34., aHi), vLit) + vBoost*10.;
        gl_PointSize = vSize*px; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`varying vec3 vCol; varying float vLit; varying float vHi; varying float vMag; varying float vBoost; varying float vTw; varying float vSize;
      void main(){ vec2 q = (gl_PointCoord - .5)*vSize; float r2 = dot(q,q);
        float cw = mix(.85, mix(1.35, 2.1 + vMag*.6, vHi), vLit), hw = mix(2., mix(3.6, 8.5, vHi), vLit);
        float core = exp(-r2/(cw*cw)), halo = exp(-r2/(hw*hw))*mix(0., mix(.16, .4, vHi), vLit);
        float flare = (exp(-abs(q.x)*2.4)*exp(-abs(q.y)*.42) + exp(-abs(q.y)*2.4)*exp(-abs(q.x)*.42))*.55*vHi*vLit;
        float edge = 1. - smoothstep(.36, .5, length(gl_PointCoord - .5));
        float a = (core + halo + flare)*mix(.4, mix(.95, 1.7, vHi), vLit)*(1. + vBoost*.6)*vTw*edge;
        gl_FragColor = vec4(mix(vCol, vec3(1.), core*.55)*a, a); }` });
  const points = new THREE.Points(sg, starMat); points.frustumCulled = false; group.add(points);

  /* invisible click targets, generous so a small star is easy to touch */
  const hitMat = new THREE.MeshBasicMaterial({ visible:false }), hitGeo = new THREE.SphereGeometry(R_SKY*Math.sin(1.5*Math.PI/180), 8, 6);
  stars.forEach(s => { s.hit = new THREE.Mesh(hitGeo, hitMat); s.hit.position.copy(s.pos); s.hit.userData.star = s; group.add(s.hit); });

  /* each project's figure: a minimum spanning tree over its stars, rooted at its most shared star */
  const edges = [], edgeKey = new Map();
  relics.forEach(r => {
    const own = stars.filter(s => s.relics.includes(r.id));
    const root = own.slice().sort((a,b) => b.relics.length - a.relics.length || a.i - b.i)[0];
    if (r.figure === false || own.length < 2){ r.figure = { root, order:own.map((s, i) => ({ s, depth:i*.3 })), lines:false }; return; }
    const inTree = new Set([root]), order = [{ s:root, depth:0 }], depth = new Map([[root, 0]]);
    while (inTree.size < own.length){ let best = null;
      for (const a of inTree) for (const b of own){ if (inTree.has(b)) continue; const d = a.dir.angleTo(b.dir); if (!best || d < best.d) best = { a, b, d }; }
      inTree.add(best.b); depth.set(best.b, depth.get(best.a) + 1); order.push({ s:best.b, depth:depth.get(best.b), from:best.a });
      const key = [best.a.i, best.b.i].sort((x,y) => x-y).join('-');
      if (edgeKey.has(key)) edgeKey.get(key).relics.push(r.id);
      else { const e = { a:best.a, b:best.b, relic:r, relics:[r.id], prog:0, start:Infinity, dur:.42, hi:0 }; edgeKey.set(key, e); edges.push(e); } }
    r.figure = { root, order, lines:true };
  });

  /* lines: hairlines widened in screen space, so they stay about a pixel thin at any distance or field of view */
  const E = edges.length, pos = new Float32Array(E*4*3), oth = new Float32Array(E*4*3), aT = new Float32Array(E*4), aS = new Float32Array(E*4), aProg = new Float32Array(E*4),
    eCol = new Float32Array(E*4*3), aLen = new Float32Array(E*4), aEHi = new Float32Array(E*4), idx = [];
  edges.forEach((e, k) => { const len = e.a.pos.distanceTo(e.b.pos), c = C(e.relic.color).lerp(C('#FFFFFF'), .35);
    [[e.a.pos,e.b.pos,0,-1],[e.a.pos,e.b.pos,0,1],[e.b.pos,e.a.pos,1,-1],[e.b.pos,e.a.pos,1,1]].forEach(([p,q,t,sd], j) => { const o = k*4 + j;
      pos.set([p.x,p.y,p.z], o*3); oth.set([q.x,q.y,q.z], o*3); aT[o] = t; aS[o] = sd; eCol.set([c.r,c.g,c.b], o*3); aLen[o] = len; });
    idx.push(k*4, k*4+1, k*4+2, k*4+2, k*4+1, k*4+3); });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setIndex(idx);
  [['aOther',oth,3],['aT',aT,1],['aS',aS,1],['aProg',aProg,1],['aCol',eCol,3],['aLen',aLen,1],['aHi',aEHi,1]].forEach(([n,a,s]) => lg.setAttribute(n, new THREE.BufferAttribute(a, s)));
  const lineMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false,
    uniforms:{ t:{value:0}, px:{value:px}, res:{value:new THREE.Vector2(1, 1)}, gap:{value:R_SKY*GAP*Math.PI/180}, still:{value:reduceMotion ? 1 : 0} },
    vertexShader:`attribute vec3 aOther; attribute float aT; attribute float aS; attribute float aProg; attribute vec3 aCol; attribute float aLen; attribute float aHi;
      uniform vec2 res; uniform float px; varying float vT; varying float vD; varying float vW; varying float vP; varying vec3 vCol; varying float vLen; varying float vHi;
      void main(){ vT = aT; vP = aProg; vCol = aCol; vLen = aLen; vHi = aHi;
        vec4 c = projectionMatrix*modelViewMatrix*vec4(position,1.), o = projectionMatrix*modelViewMatrix*vec4(mix(position, aOther, .05),1.);
        vec2 d = normalize(o.xy/o.w*res - c.xy/c.w*res + 1e-6)*(aT > .5 ? -1. : 1.);   // at the far end the screen direction flips
        vW = mix(.75, 1.15, aHi)*px; float span = vW + 1.5*px; vD = aS*span;
        c.xy += vec2(-d.y, d.x)*aS*span/res*c.w; gl_Position = c; }`,
    fragmentShader:`uniform float t; uniform float gap; uniform float still; varying float vT; varying float vD; varying float vW; varying float vP; varying vec3 vCol; varying float vLen; varying float vHi;
      void main(){ float g = gap/vLen; float ends = smoothstep(g, g*1.6, vT)*(1. - smoothstep(1. - g*1.6, 1. - g, vT));
        float drawn = 1. - smoothstep(vP - .03, vP, vT), head = exp(-pow((vT - vP)*vLen*.12, 2.))*step(vP, .999);
        float spark = (1. - still)*pow(.5 + .5*sin(vT*vLen*.06 - t*1.1), 30.)*.5*vHi;
        float a = exp(-vD*vD/(vW*vW))*(mix(.3, 1.05, vHi)*(1. + spark) + head*1.4)*drawn*ends;
        gl_FragColor = vec4(mix(vCol, vec3(1.), head*.5)*a, a); }` });
  const lines = new THREE.Mesh(lg, lineMat); lines.frustumCulled = false; group.add(lines);

  let clock = 0, lastLit = null;
  /* wake a relic's figure; returns the stars that were dark until now */
  function lightRelic(id){
    const r = byRelic[id]; if (!r || !r.figure) return [];
    const step = reduceMotion ? 0 : .38, fresh = []; lastLit = id;
    r.figure.order.forEach(({ s, depth }) => { if (s.on) return; s.on = true; s.at = Math.min(s.at, clock + depth*step + .1); fresh.push(s); });
    const depthOf = s => r.figure.order.find(o => o.s === s)?.depth ?? 0;
    edges.forEach(e => { if (!e.relics.includes(id) || e.start !== Infinity) return; e.start = clock + Math.min(depthOf(e.a), depthOf(e.b))*step + .1; e.dur = reduceMotion ? 0 : step; });
    return fresh;
  }
  function pulse(s){ s.pulse = 1; }

  const pv = new V3(), placed = []; let next = 0, budget = 0;
  const fits = (x, y, w, h) => placed.every(b => x >= b.x + b.w || b.x >= x + w || y >= b.y + b.h || b.y >= y + h);
  /* label spots around a star: below, right, left, above */
  const SPOTS = [(x, y, w) => [x - w/2, y + 7], (x, y, w, h) => [x + 8, y - h/2], (x, y, w, h) => [x - 8 - w, y - h/2], (x, y, w, h) => [x - w/2, y - 7 - h]];
  /* focus: the relic in hand. The bright figure is that relic once its light is back, otherwise the figure that woke last. */
  function update(dt, T, camera, { showAll, hover, focus }){
    clock += dt; starMat.uniforms.t.value = T; lineMat.uniforms.t.value = T;
    lineMat.uniforms.res.value.set(innerWidth*px/2, innerHeight*px/2);
    group.position.copy(camera.position);
    const current = focus && focus.lightGiven ? focus.id : lastLit, ease = k => reduceMotion ? 1 : 1 - Math.exp(-dt*k);
    let dirtyS = false, dirtyE = false;
    stars.forEach((s, i) => {
      const want = s.on && clock >= s.at ? 1 : 0, hiWant = want && s.relics.includes(current) ? 1 : 0;
      const activeDt = Math.max(0,Math.min(dt,clock-s.at));
      s.lit += (want - s.lit)*(reduceMotion ? 1 : 1-Math.exp(-activeDt*3));
      s.hi += (hiWant - s.hi)*(reduceMotion ? 1 : 1-Math.exp(-(hiWant ? activeDt : dt)*2.5)); s.pulse = Math.max(0, s.pulse - dt*.8);
      const v = s.lit + s.pulse*.8 + (hover === s ? .35 : 0);
      if (Math.abs(v - aLit[i]) > .002 || Math.abs(s.hi - aHi[i]) > .002){ aLit[i] = v; aHi[i] = s.hi; dirtyS = true; } });
    edges.forEach((e, k) => {
      if (e.start !== Infinity && e.prog < 1){ const p = e.dur ? Math.min(1, Math.max(0, (clock - e.start)/e.dur)) : (clock >= e.start ? 1 : 0);
        if (p !== e.prog){ e.prog = p; aProg.fill(p, k*4, k*4 + 4); dirtyE = true; } }
      const h = e.hi + ((e.relics.includes(current) ? 1 : 0) - e.hi)*ease(2.5);
      e.hi = h;
      if (Math.abs(h - aEHi[k*4]) > .002){ aEHi.fill(h, k*4, k*4 + 4); dirtyE = true; } });
    if (dirtyS){ sg.attributes.aLit.needsUpdate = true; sg.attributes.aHi.needsUpdate = true; }
    if (dirtyE){ lg.attributes.aProg.needsUpdate = true; lg.attributes.aHi.needsUpdate = true; }

    /* labels: every lit star is named all the time. The bright figure's names always show; quieter names only where they fit. */
    /* check which stars sit behind the walls at a steady rate in real time (about 240 a second), whatever the frame rate */
    if (blocked) for (budget = Math.min(budget + dt*240, N); budget >= 1; budget--){ const s = stars[next++ % N]; s.behind = blocked(camera.position, s.dir); }
    const w = innerWidth, h = innerHeight; placed.length = 0;
    const shown = [];
    stars.forEach(s => { const lit = s.lit > .5, show = (lit || hover === s) && !s.behind;
      if (show){ pv.copy(s.pos).add(camera.position).project(camera);
        if (pv.z < 1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05){ s.sx = (pv.x*.5 + .5)*w; s.sy = (-pv.y*.5 + .5)*h; shown.push(s);
          if (lit) placed.push({ x:s.sx - 3, y:s.sy - 3, w:6, h:6 }); return; } }
      if (s.label.style.visibility !== 'hidden') s.label.style.visibility = 'hidden'; });
    const rank = s => hover === s ? 0 : s.hi > .5 || s.pulse > 0 ? 1 : 2;
    shown.sort((a, b) => rank(a) - rank(b) || b.hi - a.hi);
    shown.forEach(s => {
      const text = s.lit > .5 ? s.skill.name : '· · ·', bright = rank(s) < 2;
      if (s.text !== text){ s.label.textContent = s.text = text; s.w = s.label.offsetWidth; s.h = s.label.offsetHeight; }
      let spot = null;
      for (let k = 0; k < 4 && !spot; k++){ const [x, y] = SPOTS[(s.side + k) % 4](s.sx, s.sy, s.w, s.h); if (fits(x, y, s.w, s.h)){ spot = [x, y]; s.side = (s.side + k) % 4; } }
      if (!spot && bright) spot = SPOTS[s.side](s.sx, s.sy, s.w, s.h);
      if (!spot){ s.label.style.visibility = 'hidden'; return; }
      placed.push({ x:spot[0], y:spot[1], w:s.w, h:s.h });
      s.label.style.visibility = 'visible'; s.label.classList.toggle('dark', s.lit < .5); s.label.classList.toggle('cur', s.hi > .5 || hover === s);
      s.label.style.opacity = hover === s ? 1 : (Math.min(1, (s.lit - .5)*2.5)*(bright ? 1 : showAll ? .6 : .5)).toFixed(3);
      s.label.style.transform = `translate(${spot[0].toFixed(1)}px,${spot[1].toFixed(1)}px)`; });
  }

  /* a skill named in free text, longest names first so "react native" wins over "react" */
  const names = stars.flatMap(s => [s.skill.name, s.skill.id, ...(s.skill.also || [])].map(n => [n.toLowerCase(), s])).sort((a,b) => b[0].length - a[0].length);
  function find(q){ const t = ' ' + q.toLowerCase().replace(/[^a-z0-9#+ ]+/g, ' ') + ' ';
    for (const [n, s] of names){ const k = n.replace(/[^a-z0-9#+ ]+/g, ' ').trim(); if (k && t.includes(' ' + k + ' ')) return s; } return null; }

  return { stars, byId, hits:stars.map(s => s.hit), lightRelic, pulse, update, find };
}
