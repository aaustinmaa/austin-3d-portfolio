import { exponentialMotion } from './animation-time.js';

/** Integrate dv/dt = rate * (target - v), including the distance travelled.
 * dt and rate are seconds and a nonnegative rate per second.
 */
export function dampedMotion(velocity, target, rate, dt){
  if (dt <= 0) return { velocity, distance:0 };
  const { decay, integral } = exponentialMotion(dt, rate);
  return {
    velocity:target + (velocity - target)*decay,
    distance:target*dt + (velocity - target)*integral,
  };
}

/** Integrate constant acceleration, stopping acceleration at either velocity limit.
 * If a limit is reached during dt, the remaining time travels at that limit.
 */
export function acceleratedMotion(velocity, acceleration, dt, minVelocity=-Infinity, maxVelocity=Infinity){
  if (dt <= 0) return { velocity, distance:0 };
  const start = Math.min(maxVelocity, Math.max(minVelocity, velocity));
  if (acceleration === 0) return { velocity:start, distance:start*dt };
  const limit = acceleration > 0 ? maxVelocity : minVelocity;
  const acceleratingTime = Math.min(dt, Math.max(0, (limit - start)/acceleration));
  const end = start + acceleration*acceleratingTime;
  return { velocity:end, distance:start*acceleratingTime + .5*acceleration*acceleratingTime**2 + end*(dt - acceleratingTime) };
}

/** Integrate dv/dt = acceleration - rate*v (for gravity with drag).
 * dt and rate are seconds and a nonnegative drag rate per second.
 */
export function dampedAcceleration(velocity, acceleration, rate, dt){
  if (rate === 0) return acceleratedMotion(velocity, acceleration, dt);
  return dampedMotion(velocity, acceleration/rate, rate, dt);
}
