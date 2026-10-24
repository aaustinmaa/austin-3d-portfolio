import * as THREE from 'three';
import { glowTex, ringTex } from './textures.js';
import { buildOracleDesign } from './oracle-design.js';

// The shared interaction boundary for the Oracle's option-A armillary design.
export function createOracle(scene, { y, main, reduceMotion }) {
  const group = new THREE.Group(); group.position.set(0, y, 0); scene.add(group);
  const design = buildOracleDesign({ main, reduceMotion }); group.add(design.group);
  const light = new THREE.PointLight(0x9FE8FF, 1, 160, 1); group.add(light);
  const sprite = (map, color, opacity, size, parent = group) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, opacity, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.scale.set(size, size, 1); parent.add(s); return s;
  };
  const ripples = [], travellers = [];
  let flash = 0, finale = 0;
  function ripple(color, size = 46) {
    if (reduceMotion) return;
    const s = sprite(ringTex, color, 0, 8); ripples.push({ s, t: 0, size });
  }
  function sendLight(from, color, onArrive) {
    if (reduceMotion) { onArrive(); return; }
    const head = sprite(glowTex, new THREE.Color(color).lerp(new THREE.Color('#F4F9EF'), .5), 1, 6, scene), tail = [];
    for (let i = 0; i < 22; i++) tail.push(sprite(glowTex, color, .8 * (1 - i / 22), 4.2 * (1 - i / 26), scene));
    const p0 = from.clone(), p2 = group.position.clone(), p1 = p0.clone().lerp(p2, .25);
    p1.y = p0.y + (p2.y - p0.y) * .8;
    travellers.push({ head, tail, p0, p1, p2, t: 0, hist: [], onArrive });
  }
  const bez = (out, a, b, c, t) => out.set(0, 0, 0).addScaledVector(a, (1 - t) ** 2).addScaledVector(b, 2 * (1 - t) * t).addScaledVector(c, t * t);
  function update(dt, T, { power, speak }) {
    flash = Math.max(0, flash - dt * .75);
    finale = Math.min(1, finale + (finale > 0 ? dt * .22 : 0));
    group.position.y = y + (reduceMotion ? 0 : Math.sin(T * .23) * .12);
    design.update(dt, T, { power: Math.min(1, power + finale * .2), speak, flash, finale });
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.t += dt / 1.8; r.s.scale.setScalar(8 + r.size * r.t);
      r.s.material.opacity = Math.sin(Math.min(1, r.t) * Math.PI) * .8;
      if (r.t >= 1) { group.remove(r.s); r.s.material.dispose(); ripples.splice(i, 1); }
    }
    for (let i = travellers.length - 1; i >= 0; i--) {
      const tr = travellers[i]; tr.t += dt / 1.5; const e = Math.min(1, tr.t), k = e * e * (3 - 2 * e);
      bez(tr.head.position, tr.p0, tr.p1, tr.p2.copy(group.position), k);
      tr.hist.unshift(tr.head.position.clone()); if (tr.hist.length > 44) tr.hist.pop();
      tr.tail.forEach((s, j) => { const h = tr.hist[Math.min(tr.hist.length - 1, j * 2)]; if (h) s.position.copy(h); });
      if (tr.t >= 1) {
        scene.remove(tr.head); tr.head.material.dispose();
        tr.tail.forEach(s => { scene.remove(s); s.material.dispose(); });
        travellers.splice(i, 1); tr.onArrive();
      }
    }
  }
  return {
    group, light, update, sendLight, ripple,
    get position() { return group.position; },
    receive(relic) { design.receive(relic); flash = 1; ripple(relic.color, 60); },
    speakPulse() { ripple('#9FE8FF', 34); },
    bloom() { finale = .001; flash = 1.2; design.bloom(); ripple('#F4D58D', 90); },
  };
}
