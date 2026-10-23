// Solid shapes shared by the wanderer and the arrows. Each collider is an upright frustum (a cylinder, or a cone
// when one radius is 0) or a box turned about the vertical axis. Flags:
//   stand  its flat top can be stood on        ceil   its underside stops the wanderer's head
//   body   blocks the wanderer                 arrows stops arrows
export const colliders = [];
const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;

export function addFrustum(x, z, y0, y1, r0, r1, o={}){
  const c = { kind:'f', x, z, y0, y1, r0, r1, R:Math.max(r0, r1), stand: o.stand ?? r1 > .3, ceil: o.ceil ?? r0 > .3, body: o.body ?? true, arrows: o.arrows ?? true };
  colliders.push(c); return c;
}
export function addBox(x, z, y0, y1, hx, hz, rot=0, o={}){
  const c = { kind:'b', x, z, y0, y1, hx, hz, cs:Math.cos(rot), sn:Math.sin(rot), R:Math.hypot(hx, hz), stand: o.stand ?? true, ceil: o.ceil ?? true, body: o.body ?? true, arrows: o.arrows ?? true };
  colliders.push(c); return c;
}
const radiusAt = (c, y) => c.r0 + (c.r1 - c.r0)*clamp01((y - c.y0)/(c.y1 - c.y0));
/* box-local coordinates of a world point (inverse of a rotation about +y) */
function local(c, x, z, out){ const dx = x - c.x, dz = z - c.z; out.x = dx*c.cs - dz*c.sn; out.z = dx*c.sn + dz*c.cs; return out; }
const L = { x:0, z:0 };

/* highest floor under (x, z) that a body standing at height y can reach with a step of `step` */
export function floorAt(x, z, y, step, ground){
  let best = ground <= y + step ? ground : -Infinity, onPlatform = false;
  for (const c of colliders){
    if (!c.stand || !c.body || c.y1 > y + step || c.y1 <= best) continue;
    const dx = x - c.x, dz = z - c.z; if (Math.abs(dx) > c.R + .3 || Math.abs(dz) > c.R + .3) continue;
    const on = c.kind === 'f' ? dx*dx + dz*dz < (c.r1 + .18)**2 : (local(c, x, z, L), Math.abs(L.x) < c.hx + .12 && Math.abs(L.z) < c.hz + .12);
    if (on){ best = c.y1; onPlatform = true; }
  }
  return { h:best, onPlatform };
}

/* lowest underside above a head at height `head` over (x, z); Infinity when the sky is open */
export function ceilingAt(x, z, head){
  let low = Infinity;
  for (const c of colliders){
    if (!c.ceil || !c.body || c.y1 < head) continue;
    const dx = x - c.x, dz = z - c.z; if (Math.abs(dx) > c.R || Math.abs(dz) > c.R) continue;
    let under;
    if (c.kind === 'b'){ local(c, x, z, L); if (Math.abs(L.x) > c.hx || Math.abs(L.z) > c.hz) continue; under = c.y0; }
    else { const d = Math.hypot(dx, dz); if (d > c.R) continue;
      under = c.r1 > c.r0 ? (d <= c.r0 ? c.y0 : c.y0 + (d - c.r0)/(c.r1 - c.r0)*(c.y1 - c.y0)) : (d <= c.r1 ? c.y0 : Infinity); }
    if (under >= head - .25 && under < low) low = under;
  }
  return low;
}

/* push a body of radius r out of every wall it overlaps between `lo` (feet + step) and `hi` (head) */
export function pushOut(p, lo, hi, r){
  let hit = false;
  for (let pass=0; pass<2; pass++) for (const c of colliders){
    if (!c.body || c.y1 <= lo || c.y0 >= hi) continue;
    const dx = p.x - c.x, dz = p.z - c.z; if (Math.abs(dx) > c.R + r || Math.abs(dz) > c.R + r) continue;
    if (c.kind === 'f'){
      const cr = Math.max(radiusAt(c, Math.max(lo, c.y0)), radiusAt(c, Math.min(hi, c.y1))) + r, d = Math.hypot(dx, dz);
      if (d >= cr) continue; const k = d > 1e-4 ? cr/d : 0; p.x = c.x + (d > 1e-4 ? dx*k : cr); p.z = c.z + dz*k; hit = true;
    } else {
      local(c, p.x, p.z, L); const ox = c.hx + r - Math.abs(L.x), oz = c.hz + r - Math.abs(L.z); if (ox <= 0 || oz <= 0) continue;
      if (ox < oz) L.x += Math.sign(L.x || 1)*ox; else L.z += Math.sign(L.z || 1)*oz;
      p.x = c.x + L.x*c.cs + L.z*c.sn; p.z = c.z - L.x*c.sn + L.z*c.cs; hit = true;
    }
  }
  return hit;
}

/* the collider an arrow tip at p is inside, if any */
export function solidAt(p){
  for (const c of colliders){
    if (!c.arrows || p.y < c.y0 || p.y > c.y1) continue;
    const dx = p.x - c.x, dz = p.z - c.z; if (Math.abs(dx) > c.R || Math.abs(dz) > c.R) continue;
    if (c.kind === 'f' ? dx*dx + dz*dz < radiusAt(c, p.y)**2 : (local(c, p.x, p.z, L), Math.abs(L.x) < c.hx && Math.abs(L.z) < c.hz)) return c;
  }
  return null;
}
