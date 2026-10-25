import { Vector3 } from 'three';
import { dampedAcceleration } from './motion-time.js';

// Sample the continuous path, so collision events can split a step without losing time.
export function sampleArrowMotion(position, velocity, dt, drag=0){
  const x = dampedAcceleration(velocity.x,0,drag,dt);
  const y = dampedAcceleration(velocity.y,-6,drag,dt);
  const z = dampedAcceleration(velocity.z,0,drag,dt);
  const nextPosition = position.clone().add(new Vector3(x.distance,y.distance,z.distance));
  const nextVelocity = new Vector3(x.velocity,y.velocity,z.velocity);
  const tip = nextPosition.clone().addScaledVector(nextVelocity.clone().normalize(),.5);
  return { position:nextPosition, velocity:nextVelocity, tip };
}

// A dry ballistic arrow's tip has at most one height maximum. When it starts above
// the surface, an endpoint below it therefore brackets the descending entry event.
export function arrowWaterEntry(position, velocity, dt, waterY){
  const start = sampleArrowMotion(position,velocity,0);
  if (start.tip.y <= waterY) return { time:0, ...start };
  if (dt <= 0) return null;
  const end = sampleArrowMotion(position,velocity,dt);
  if (end.tip.y > waterY) return null;
  let before = 0, after = dt;
  for (let i=0;i<64 && after-before > 1e-12;i++){
    const middle = (before+after)/2;
    if (sampleArrowMotion(position,velocity,middle).tip.y > waterY) before = middle;
    else after = middle;
  }
  return { time:after, ...sampleArrowMotion(position,velocity,after) };
}
