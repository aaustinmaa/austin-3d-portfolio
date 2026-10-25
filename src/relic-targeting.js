import { Ray, Sphere, Vector3 } from 'three';

// Relics are intangible interactions, with the original forgiving hit radii.
export const RELIC_HIT_RADIUS = 1.9;
const orbiting = r => r.state === 'orbit' && r.group.visible;
export const guidedRelic = r => r && r.group.visible && (r.state === 'orbit' || r.state === 'rising');

export function relicArrowHit(from, to, relics, target=null){
  const direction = new Vector3().subVectors(to, from), length = direction.length();
  const ray = new Ray(from, length ? direction.divideScalar(length) : new Vector3(0,0,1));
  let closest = null;
  for (const relic of target ? [target] : relics){
    if (!(target ? guidedRelic(relic) : orbiting(relic))) continue;
    const sphere = new Sphere(relic.pos, target ? 1.2 : RELIC_HIT_RADIUS);
    const point = sphere.containsPoint(from) ? from.clone() : ray.intersectSphere(sphere, new Vector3());
    if (!point) continue;
    const distance = from.distanceTo(point);
    if (distance <= length && (!closest || distance < closest.distance)) closest = { relic, point, distance };
  }
  return closest;
}

export function relicAimPoint(ray, relics, maxDistance=Infinity){
  let closest = null;
  for (const relic of relics){
    if (!orbiting(relic) || ray.distanceToPoint(relic.pos) >= RELIC_HIT_RADIUS) continue;
    const distance = relic.pos.clone().sub(ray.origin).dot(ray.direction);
    if (distance > 0 && distance < maxDistance && (!closest || distance < closest.distance)) closest = { distance, point:ray.at(distance, new Vector3()) };
  }
  return closest;
}
