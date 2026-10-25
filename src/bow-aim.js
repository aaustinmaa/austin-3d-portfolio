import { Vector3 } from 'three';
import { relicAimPoint } from './relic-targeting.js';

export function resolveBowAim(world, ray, from, relics, range=140){
  // A third-person camera may sit behind/inside scenery. Only converge on points ahead of the bow.
  const near = Math.max(0,from.clone().sub(ray.origin).dot(ray.direction) + .5);
  const far = Math.max(range,near + 1), origin = ray.at(near,new Vector3());
  const surface = world.rayHit(origin,ray.direction,far-near,s => s.arrows);
  const surfaceDepth = surface ? near + surface.distance : far;
  const relic = relicAimPoint(ray,relics,surfaceDepth,near);
  const point = relic ? relic.point : surface ? surface.point : ray.at(far,new Vector3());
  const direction = point.clone().sub(from).normalize();
  return { point, direction };
}
