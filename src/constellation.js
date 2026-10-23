import * as THREE from 'three';

// The skill constellation: every skill is a star on a dome above the valley. Opening a relic wakes the stars of the
// skills it used and draws that relic's lines between them (a shortest-path tree, like a real constellation figure).
// A star shared by several relics joins their figures, so with every relic open the sky becomes one connected chart.

/* where each star sits, as [azimuth°, elevation°] seen from the valley centre (azimuth 0 = north, 90 = east).
   The languages ring the zenith; the other groups fan out around them like petals, clear of the valley walls. */
const AT = {
  python:[0,87], typescript:[200,82], swift:[255,81], csharp:[302,79], java:[125,81], sql:[55,80],
  spark:[40,73], aws:[60,71], iceberg:[47,66], pipelines:[80,72], terraform:[74,65], kafka:[25,68],
  langgraph:[140,75], langchain:[123,69], retrieval:[158,71], fastapi:[143,66], postgres:[170,66],
  react:[190,70], reactnative:[217,74], swiftui:[250,73], wpf:[266,67],
  pdf:[318,72], crawler:[332,66],
  boardgames:[346,64], chess:[0,61], poker:[13,64], motorsport:[2,68],
};
const GROUP_AZ = { lang:0, data:55, ai:145, apps:225, research:325, play:0 };
const TINT = { lang:'#FFF1D0', data:'#F0C77A', ai:'#8FEFF6', apps:'#D2C2FF', research:'#9FB6FF', play:'#7FF3C8' };

export function createConstellation(scene, { skills, relics, radius=210, labelsEl, reduceMotion }){
  const V3 = THREE.Vector3, C = h => new THREE.Color(h);
  const byRelic = Object.fromEntries(relics.map(r => [r.id, r]));
  const dir = (az, el) => { const a = az*Math.PI/180, e = el*Math.PI/180; return new V3(Math.sin(a)*Math.cos(e), Math.sin(e), -Math.cos(a)*Math.cos(e)); };
  const placed = {};
  const stars = skills.map((s, i) => {
    const at = AT[s.id] || [GROUP_AZ[s.group] + ((placed[s.group] = (placed[s.group] || 0) + 1) - 2)*9, 66 + (i%3)*4];
    const label = document.createElement('div'); label.className = 'slabel'; label.textContent = s.name; labelsEl.appendChild(label);
    return { i, skill:s, relics:s.relics.filter(id => byRelic[id]), dir:dir(at[0], at[1]), pos:dir(at[0], at[1]).multiplyScalar(radius), lit:0, on:false, at:Infinity, pulse:0, seen:-99, label };
  });
  const byId = Object.fromEntries(stars.map(s => [s.skill.id, s]));

  /* stars: one draw call, a procedural four-point flare per point */
  const N = stars.length, sg = new THREE.BufferGeometry();
  const aLit = new Float32Array(N), aCol = new Float32Array(N*3), aPh = new Float32Array(N), aMag = new Float32Array(N);
  stars.forEach((s, i) => { const c = C(TINT[s.skill.group] || '#FFFFFF'); aCol.set([c.r,c.g,c.b], i*3); aPh[i] = i*2.399; aMag[i] = 1; });
  sg.setAttribute('position', new THREE.Float32BufferAttribute(stars.flatMap(s => [s.pos.x, s.pos.y, s.pos.z]), 3));
  sg.setAttribute('aLit', new THREE.BufferAttribute(aLit, 1)); sg.setAttribute('aCol', new THREE.BufferAttribute(aCol, 3));
  sg.setAttribute('aPh', new THREE.BufferAttribute(aPh, 1)); sg.setAttribute('aMag', new THREE.BufferAttribute(aMag, 1));
  const starMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
    uniforms:{ t:{value:0}, px:{value:Math.min(devicePixelRatio || 1, 1.75)} },
    vertexShader:`attribute float aLit; attribute vec3 aCol; attribute float aPh; attribute float aMag; uniform float t; uniform float px;
      varying vec3 vCol; varying float vLit; varying float vTw;
      void main(){ vCol = aCol; vLit = aLit; vTw = .82 + .18*sin(t*(1.3 + fract(aPh)*1.7) + aPh*7.);
        gl_PointSize = mix(8., 28. + aMag*10., min(aLit, 1.)) * (1. + max(aLit - 1., 0.)*.8) * px;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`varying vec3 vCol; varying float vLit; varying float vTw;
      void main(){ vec2 p = gl_PointCoord - .5; float d2 = dot(p,p); float l = min(vLit, 1.);
        float core = exp(-d2*120.)*1.3, halo = exp(-d2*20.)*.45;
        float spikes = exp(-abs(p.x)*70.)*exp(-abs(p.y)*7.) + exp(-abs(p.y)*70.)*exp(-abs(p.x)*7.);
        float a = mix(.3*exp(-d2*50.), core + halo + spikes*.85, l)*vTw;
        gl_FragColor = vec4(mix(vCol, vec3(1.), core*.7)*a, a); }` });
  const points = new THREE.Points(sg, starMat); points.frustumCulled = false; scene.add(points);

  /* invisible click targets, generous so a small star is easy to touch */
  const hitMat = new THREE.MeshBasicMaterial({ visible:false }), hitGeo = new THREE.SphereGeometry(7, 8, 6);
  stars.forEach(s => { s.hit = new THREE.Mesh(hitGeo, hitMat); s.hit.position.copy(s.pos); s.hit.userData.star = s; scene.add(s.hit); });

  /* each relic's figure: a minimum spanning tree over its stars, rooted at its most shared star */
  const edges = [], edgeKey = new Map();
  relics.forEach(r => {
    const own = stars.filter(s => s.relics.includes(r.id)); if (own.length < 2) { r.figure = { root:own[0], order:own.map(s => ({ s, depth:0 })) }; return; }
    const root = own.slice().sort((a,b) => b.relics.length - a.relics.length || a.i - b.i)[0];
    const inTree = new Set([root]), order = [{ s:root, depth:0 }], depth = new Map([[root, 0]]);
    while (inTree.size < own.length){ let best = null;
      for (const a of inTree) for (const b of own){ if (inTree.has(b)) continue; const d = a.dir.angleTo(b.dir); if (!best || d < best.d) best = { a, b, d }; }
      inTree.add(best.b); depth.set(best.b, depth.get(best.a) + 1); order.push({ s:best.b, depth:depth.get(best.b), from:best.a });
      const key = [best.a.i, best.b.i].sort((x,y) => x-y).join('-');
      if (edgeKey.has(key)) edgeKey.get(key).relics.push(r.id);
      else { const e = { a:best.a, b:best.b, relic:r, relics:[r.id], prog:0, start:Infinity, dur:.42 }; edgeKey.set(key, e); edges.push(e); } }
    r.figure = { root, order };
  });

  /* lines: thin glowing ribbons drawn from one star to the next, one draw call for all of them */
  const E = edges.length, pos = new Float32Array(E*4*3), aT = new Float32Array(E*4), aS = new Float32Array(E*4), aProg = new Float32Array(E*4), eCol = new Float32Array(E*4*3), aLen = new Float32Array(E*4), idx = [];
  edges.forEach((e, k) => { const along = e.b.pos.clone().sub(e.a.pos), len = along.length(), side = along.clone().cross(e.a.pos.clone().add(e.b.pos)).normalize().multiplyScalar(.75), c = C(e.relic.color).lerp(C('#FFFFFF'), .3);
    [[e.a.pos,0,-1],[e.a.pos,0,1],[e.b.pos,1,-1],[e.b.pos,1,1]].forEach(([p,t,sd], j) => { const v = p.clone().addScaledVector(side, sd), o = k*4 + j;
      pos.set([v.x,v.y,v.z], o*3); aT[o] = t; aS[o] = sd; eCol.set([c.r,c.g,c.b], o*3); aLen[o] = len; });
    idx.push(k*4, k*4+1, k*4+2, k*4+2, k*4+1, k*4+3); });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setIndex(idx);
  [['aT',aT,1],['aS',aS,1],['aProg',aProg,1],['aCol',eCol,3],['aLen',aLen,1]].forEach(([n,a,s]) => lg.setAttribute(n, new THREE.BufferAttribute(a, s)));
  const lineMat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false, uniforms:{ t:{value:0} },
    vertexShader:`attribute float aT; attribute float aS; attribute float aProg; attribute vec3 aCol; attribute float aLen; varying float vT; varying float vS; varying float vP; varying vec3 vCol; varying float vLen;
      void main(){ vT = aT; vS = aS; vP = aProg; vCol = aCol; vLen = aLen; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform float t; varying float vT; varying float vS; varying float vP; varying vec3 vCol; varying float vLen;
      void main(){ float gap = 4.5/vLen; float ends = smoothstep(gap, gap*2., vT)*(1. - smoothstep(1. - gap*2., 1. - gap, vT));
        float drawn = 1. - smoothstep(vP - .03, vP, vT); float head = exp(-pow((vT - vP)*vLen*.25, 2.))*step(vP, .999);
        float spark = pow(.5 + .5*sin(vT*vLen*.12 - t*1.6), 24.)*.6;
        float a = (exp(-vS*vS*4.)*.7*(1. + spark) + head*1.8)*drawn*ends;
        gl_FragColor = vec4(mix(vCol, vec3(1.), head*.6)*a, a); }` });
  const lines = new THREE.Mesh(lg, lineMat); lines.frustumCulled = false; scene.add(lines);

  let clock = 0;
  /* wake a relic's figure; returns the stars that were dark until now */
  function lightRelic(id){
    const r = byRelic[id]; if (!r || !r.figure) return [];
    const step = reduceMotion ? 0 : .38, fresh = [];
    r.figure.order.forEach(({ s, depth }) => { if (s.on) return; s.on = true; s.at = Math.min(s.at, clock + depth*step + .1); fresh.push(s); });
    const depthOf = s => r.figure.order.find(o => o.s === s)?.depth ?? 0;
    edges.forEach(e => { if (!e.relics.includes(id) || e.start !== Infinity) return; e.start = clock + Math.min(depthOf(e.a), depthOf(e.b))*step + .1; e.dur = reduceMotion ? 0 : step; });
    return fresh;
  }
  function pulse(s){ s.pulse = 1; s.seen = clock; }

  const pv = new V3();
  function update(dt, T, camera, { showAll, hover }){
    clock += dt; starMat.uniforms.t.value = T; lineMat.uniforms.t.value = T;
    let dirtyS = false, dirtyE = false;
    stars.forEach((s, i) => {
      const opened = s.relics.filter(id => byRelic[id].discovered && byRelic[id].lightGiven).length;
      const want = s.on && clock >= s.at ? 1 : 0; if (want && s.lit === 0) s.seen = clock;
      const k = reduceMotion ? 1 : 1 - Math.exp(-dt*3); const nl = s.lit + (want - s.lit)*k; s.pulse = Math.max(0, s.pulse - dt*.8);
      const v = nl + s.pulse*.8 + (hover === s ? .35 : 0), m = Math.min(3, Math.max(1, opened));
      if (Math.abs(v - aLit[i]) > .002 || aMag[i] !== m){ aLit[i] = v; aMag[i] = m; dirtyS = true; } s.lit = nl; });
    edges.forEach((e, k) => { if (e.start === Infinity || e.prog >= 1) return; const p = e.dur ? Math.min(1, Math.max(0, (clock - e.start)/e.dur)) : (clock >= e.start ? 1 : 0);
      if (p !== e.prog){ e.prog = p; aProg.fill(p, k*4, k*4 + 4); dirtyE = true; } });
    if (dirtyS){ sg.attributes.aLit.needsUpdate = true; sg.attributes.aMag.needsUpdate = true; }
    if (dirtyE) lg.attributes.aProg.needsUpdate = true;
    /* labels: every lit star while looking up, otherwise only the hovered star and stars that just woke */
    const w = innerWidth, h = innerHeight;
    stars.forEach(s => { const recent = clock - s.seen < 5, show = s.lit > .5 && (showAll || recent) || hover === s;
      if (!show){ if (s.label.style.visibility !== 'hidden') s.label.style.visibility = 'hidden'; return; }
      pv.copy(s.pos).project(camera); if (pv.z > 1 || Math.abs(pv.x) > 1.05 || Math.abs(pv.y) > 1.05){ s.label.style.visibility = 'hidden'; return; }
      s.label.style.visibility = 'visible'; s.label.classList.toggle('dark', s.lit < .5);
      s.label.style.opacity = hover === s || showAll ? 1 : Math.min(1, (5 - (clock - s.seen))/1.2);
      s.label.textContent = s.lit < .5 ? '· · ·' : s.skill.name;
      s.label.style.transform = `translate(${((pv.x*.5+.5)*w).toFixed(1)}px,${((-pv.y*.5+.5)*h + 14).toFixed(1)}px) translate(-50%,0)`; });
  }

  /* a skill named in free text, longest names first so "react native" wins over "react" */
  const names = stars.flatMap(s => [s.skill.name, s.skill.id, ...(s.skill.also || [])].map(n => [n.toLowerCase(), s])).sort((a,b) => b[0].length - a[0].length);
  function find(q){ const t = ' ' + q.toLowerCase().replace(/[^a-z0-9#+ ]+/g, ' ') + ' ';
    for (const [n, s] of names){ const k = n.replace(/[^a-z0-9#+ ]+/g, ' ').trim(); if (k && t.includes(' ' + k + ' ')) return s; } return null; }

  return { stars, byId, hits:stars.map(s => s.hit), lightRelic, pulse, update, find };
}
