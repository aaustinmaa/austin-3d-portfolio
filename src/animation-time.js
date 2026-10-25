// Exact elapsed-time updates. Durations are seconds, independent of render cadence.
export function exponentialMotion(dt, rate){
  return { decay:Math.exp(-rate*dt), integral:rate === 0 ? dt : -Math.expm1(-rate*dt)/rate };
}

// Solve x'' + damping*x' + stiffness*(x - target) = 0 for a fixed target.
export function advanceDampedSpring(position, velocity, target, stiffness, damping, dt){
  if (dt <= 0) return { position, velocity };
  const offset = position-target, halfDamping = damping/2, discriminant = halfDamping**2-stiffness;
  let a, b;
  if (Math.abs(discriminant) < 1e-10){
    const decay = Math.exp(-halfDamping*dt); a = decay; b = dt*decay;
  } else if (discriminant < 0){
    const frequency = Math.sqrt(-discriminant), decay = Math.exp(-halfDamping*dt);
    a = decay*Math.cos(frequency*dt); b = decay*Math.sin(frequency*dt)/frequency;
  } else {
    const frequency = Math.sqrt(discriminant);
    const slow = Math.exp((-halfDamping+frequency)*dt), fast = Math.exp((-halfDamping-frequency)*dt);
    a = (slow+fast)/2; b = (slow-fast)/(2*frequency);
  }
  return {
    position:target + (a+halfDamping*b)*offset + b*velocity,
    velocity:(a-halfDamping*b)*velocity - stiffness*b*offset,
  };
}

// Convert a piecewise linear pose into/from its timeline, preserving time at stage boundaries.
export function timelineTimeAt(value, keys, durations){
  let time = 0;
  for (let i=0;i<durations.length;i++){
    if (value <= keys[i+1]) return time + Math.max(0,(value-keys[i])/(keys[i+1]-keys[i]))*durations[i];
    time += durations[i];
  }
  return time;
}

export function timelineValueAt(time, keys, durations){
  for (let i=0;i<durations.length;i++){
    if (time < durations[i]) return keys[i] + (keys[i+1]-keys[i])*Math.max(0,time)/durations[i];
    time -= durations[i];
  }
  return keys[keys.length-1];
}

export function advanceTimeline(value, target, dt, keys, durations){
  const time = timelineTimeAt(value,keys,durations), targetTime = timelineTimeAt(target,keys,durations);
  if (dt >= Math.abs(targetTime-time)) return target;
  const next = time + Math.sign(targetTime-time)*Math.min(Math.abs(targetTime-time),Math.max(0,dt));
  return timelineValueAt(next,keys,durations);
}

// Subdivide only for collision stability; consume the complete elapsed duration.
export function advanceTime(seconds, update, maxStep=.05){
  if (!(seconds > 0) || !Number.isFinite(seconds)) return;
  const steps = Math.ceil(seconds/maxStep), dt = seconds/steps;
  for (let i=0;i<steps;i++) update(dt);
}
