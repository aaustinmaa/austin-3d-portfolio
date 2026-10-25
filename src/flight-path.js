import { Vector3 } from 'three';

export function flightPoint(flight, progress, out=new Vector3()){
  if (flight.points){
    const distance = progress*flight.length, stops = flight.distances;
    let i=1; while (i<stops.length-1&&stops[i]<distance) i++;
    if (flight.points.length===1) return out.copy(flight.points[0]);
    return out.lerpVectors(flight.points[i-1],flight.points[i],(distance-stops[i-1])/Math.max(1e-8,stops[i]-stops[i-1]));
  }
  if (flight.cruise !== undefined){
    // When already against a wall, rise vertically before travelling across it, then descend onto the perch.
    if (progress < .2) return out.copy(flight.from).setY(flight.from.y + (flight.cruise-flight.from.y)*progress/.2);
    if (progress > .8) return out.copy(flight.to).setY(flight.cruise + (flight.to.y-flight.cruise)*(progress-.8)/.2);
    const across = (progress-.2)/.6;
    out.lerpVectors(flight.from,flight.to,across).setY(flight.cruise);
    if (flight.bend) out.addScaledVector(flight.bend,Math.sin(Math.PI*across));
    return out;
  }
  out.lerpVectors(flight.from, flight.to, progress);
  const arch = Math.sin(Math.PI*progress);
  out.y += arch*flight.arc;
  if (flight.bend) out.addScaledVector(flight.bend, arch);
  return out;
}

// Visit every crossed corner, even in a slow frame, rather than cutting diagonally through a wall.
export function flightStops(flight, before, after){
  const points=[];
  if (flight.points) for (let i=1;i<flight.points.length;i++){
    const progress=flight.distances[i]/Math.max(flight.length,1e-8);
    if (progress>before&&progress<after) points.push(flight.points[i]);
  }
  points.push(flightPoint(flight,after)); return points;
}

// A supporting face touching the feet is normal. Only a meaningful displacement blocks travel.
export function flightBlocked(motion, desired, step=0){
  const delta = motion.position.clone().sub(desired);
  return Math.hypot(delta.x,delta.z) > .06 || delta.y < -.06 || delta.y > Math.max(.06,step + .03);
}

// Validate the complete capsule path before leaving a safe perch. Prefer the original arc,
// then try a little more height or a sideways bend; never disable physical collisions.
export function planFlight(world, from, to, { radius=.46, height=1.7, arc, ceiling=47, minDuration=1.2 }={}){
  const distance = from.distanceTo(to);
  arc ??= Math.max(2 + distance*.12, (to.y-from.y)/Math.PI + height + radius);
  if (flightBlocked(world.moveBody(to,to,radius,height),to)) return null;
  const side = new Vector3(to.z-from.z,0,from.x-to.x).normalize();
  const candidates = [[arc,0],[arc+1.5,0],[arc+3,0],
    ...[3,-3,6,-6].map(bend => [arc+1.5,bend]),
    ...[2,4,8,16,24].flatMap(lift => [0,3,-3].map(bend => [0,bend,Math.max(from.y,to.y)+lift])),
    ...[6,10,16,24,32].map(extra => [arc+extra,0])];
  for (const [rise,bend,cruise] of candidates){
    const route = { from:from.clone(), to:to.clone(), arc:rise, bend:side.clone().multiplyScalar(bend), cruise };
    const vertical = cruise === undefined ? Math.PI*rise : 2*cruise-from.y-to.y;
    const count = Math.max(2,Math.ceil((distance + vertical + Math.PI*Math.abs(bend))/.6));
    let previous = from.clone(), length = 0, clear = true;
    for (let i=1; i<=count; i++){
      const point = flightPoint(route,i/count);
      if (point.y > ceiling || flightBlocked(world.moveBody(previous,point,radius,height),point)){ clear = false; break; }
      length += previous.distanceTo(point); previous = point;
    }
    if (clear) return { ...route, t:0, dur:Math.max(minDuration,length/12) };
  }
  return null;
}
