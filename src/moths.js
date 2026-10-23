import * as THREE from 'three';
import { mothTex, glowTex } from './textures.js';
import { rand } from './noise.js';

// Lantern moths: pale moths that flutter around light. A few keep close to the wanderer's lantern, the rest circle
// the glowing crystals. Each is a small body with two beating wings and a faint glow.
export function createMoths(scene, { anchors, nearLantern=5, reduceMotion }){
  const wingGeo = new THREE.PlaneGeometry(.3,.3).rotateX(Math.PI/2).translate(.15,0,0);
  const bodyGeo = new THREE.SphereGeometry(.025,6,4).scale(1,1,3.2), bodyMat = new THREE.MeshBasicMaterial({ color:0x2A3340 });
  const moths = [];
  const make = (color, home) => {
    const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ map:mothTex, color, transparent:true, opacity:.9, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending });
    const wl = new THREE.Mesh(wingGeo, mat), wr = new THREE.Mesh(wingGeo, mat); wr.scale.x = -1;
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color, transparent:true, opacity:.35, depthWrite:false, blending:THREE.AdditiveBlending })); gl.scale.set(.6,.6,1);
    g.add(new THREE.Mesh(bodyGeo, bodyMat), wl, wr, gl); scene.add(g);
    const m = { g, wl, wr, home, ph:rand()*100, rate:14 + rand()*8, R:home ? 1 + rand()*1.6 : .45 + rand()*.5, h:home ? .6 + rand()*1.8 : rand()*.5, sp:.5 + rand()*.6, vel:new THREE.Vector3() };
    moths.push(m); return m;
  };
  for (let i=0;i<nearLantern;i++) make(i%2 ? 0xFFE2B0 : 0xF4FBFF, null);
  anchors.forEach(a => { const n = 2 + Math.floor(rand()*2); for (let i=0;i<n;i++) make(rand() < .5 ? 0xBFF6FF : 0xD9CCFF, a); });

  const want = new THREE.Vector3(), look = new THREE.Vector3();
  function update(dt, T, lantern){
    moths.forEach(m => {
      const c = m.home || lantern, t = T*m.sp + m.ph;
      want.set(c.x + Math.cos(t)*m.R + Math.sin(t*2.3)*.25, c.y + m.h + Math.sin(t*1.7)*.35, c.z + Math.sin(t*1.3)*m.R + Math.cos(t*2.9)*.25);
      if (!m.g.userData.placed || reduceMotion){ m.g.position.copy(want); m.g.userData.placed = true; }
      else { const k = 1 - Math.exp(-dt*(m.home ? 2.5 : 5)); look.copy(m.g.position); m.g.position.lerp(want, k); m.vel.lerp(look.subVectors(m.g.position, look).divideScalar(Math.max(dt, 1e-3)), .2); }
      if (m.vel.lengthSq() > 1e-4) m.g.rotation.y = Math.atan2(m.vel.x, m.vel.z);
      const beat = reduceMotion ? .5 : Math.sin(T*m.rate + m.ph)*.9 + .2; m.wl.rotation.z = beat; m.wr.rotation.z = -beat;
    });
  }
  return { update };
}
