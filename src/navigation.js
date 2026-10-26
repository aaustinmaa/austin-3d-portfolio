import { Box3, Vector3 } from 'three';
import { flightBlocked, planFlight } from './flight-path.js';

class Queue {
  constructor(){ this.items = []; }
  push(node){
    const a = this.items; a.push(node); let i = a.length-1;
    while (i){ const p = (i-1)>>1; if (a[p].score <= node.score) break; a[i] = a[p]; i = p; } a[i] = node;
  }
  pop(){
    const a = this.items, first = a[0], last = a.pop();
    if (a.length){ let i = 0;
      while (i*2+1 < a.length){ let c = i*2+1; if (c+1<a.length && a[c+1].score<a[c].score) c++;
        if (a[c].score>=last.score) break; a[i]=a[c]; i=c; } a[i]=last;
    } return first;
  }
}

const v = (x,y,z) => new Vector3(x,y,z);
const STEP = .6, RISE = .61, SAMPLE = .4, GROUND_CELL = 1, HUG = 1.6, SKID = 28;
const flat = [], directions = [];
for (let x=-1;x<=1;x++) for (let z=-1;z<=1;z++) if (x||z) flat.push([x,z]);
for (let x=-1;x<=1;x++) for (let y=-1;y<=1;y++) for (let z=-1;z<=1;z++) if (x||y||z) directions.push([x,y,z]);

// Walking cruises at the wanderer's own pace; navigated flights keep the original route speed.
// Accelerations are in metres per second squared; `lateral` bounds the sideways pull through a bend.
export const PACE = { walk:{ speed:7, accel:16, brake:12, lateral:16 }, air:{ speed:12, accel:14, brake:12, lateral:24 } };

const run = steps => { let result; do { result = steps.next(); } while (!result.done); return result.value; };
const heading = (a, b, walk) => { const d = b.clone().sub(a); if (walk) d.y = 0; return d.lengthSq() > 1e-10 ? d.normalize() : null; };
const bezier = (a, c, b, t) => a.clone().multiplyScalar((1-t)*(1-t)).addScaledVector(c,2*(1-t)*t).addScaledVector(b,t*t);

// Bends are taken no faster than the sideways pull allows; a sharp unrounded corner is walked through slowly.
function cornerLimits(points, walk, lateral){
  const limits = points.map(() => Infinity);
  for (let i=1;i<points.length-1;i++){
    const a = heading(points[i-1],points[i],walk), b = heading(points[i],points[i+1],walk);
    if (!a || !b) continue;
    const angle = Math.acos(Math.min(1,Math.max(-1,a.dot(b)))); if (angle < 1e-3) continue;
    const span = Math.min(.5, points[i].distanceTo(points[i-1]), points[i].distanceTo(points[i+1]));
    limits[i] = Math.max(1.2, Math.sqrt(lateral*span/angle));
  }
  return limits;
}

// Walking is measured along the ground, so stepping onto a stone neither slows the stride nor rushes it.
export function waypointRoute(points, walk=false, pace=walk ? PACE.walk : PACE.air){
  const distances = [0];
  for (let i=1;i<points.length;i++) distances.push(distances[i-1]+(walk ? Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z) : points[i].distanceTo(points[i-1])));
  const length = distances[distances.length-1], { speed, accel, brake } = pace;
  return { from:points[0].clone(), to:points[points.length-1].clone(), points, distances, length, limits:cornerLimits(points,walk,pace.lateral), walk, arc:0, t:0, s:0, v:0,
    speed, accel, brake, dur:Math.max(.2,length/speed + speed/(2*accel) + speed/(2*brake)) };
}

// Advance along a waypoint route in real seconds: ease in, cruise, slow for bends and ease out on arrival.
// `align` (0–1) holds the pace down while the body is still turning to face the way ahead.
export function advanceRoute(route, dt, { align=1, stop=false }={}){
  if (!(route.length > 1e-6)){ route.s = route.length || 0; return 1; }
  // A reversal skids harder; elsewhere, plan on a little less braking than is available so it can be followed.
  const { distances, limits } = route, brake = route.s < (route.skid || 0) ? SKID : route.brake, plan = brake*.8;
  let allowed = 0;
  if (!stop){
    allowed = Math.min(route.speed*Math.max(0,Math.min(1,align)), Math.sqrt(2*plan*(route.length-route.s)));
    const reach = route.s + route.v*route.v/(2*plan) + route.speed*dt;
    let i = route.next || 1; while (i<distances.length-1 && distances[i]<=route.s) i++; route.next = i;
    for (;i<distances.length-1 && distances[i]<=reach;i++) allowed = Math.min(allowed, Math.sqrt(limits[i]*limits[i] + 2*plan*(distances[i]-route.s)));
    allowed = Math.max(allowed, .25);
  }
  route.v = route.v < allowed ? Math.min(allowed, route.v + route.accel*dt) : Math.max(allowed, route.v - brake*dt);
  route.s = Math.min(route.length, route.s + route.v*dt);
  if (route.length - route.s < 1e-4) route.s = route.length;
  return route.s/route.length;
}

// The horizontal direction a little way ahead on a waypoint route, so turns are anticipated rather than snapped.
export function routeHeading(route, lookahead=.6){
  const at = s => { const d = route.distances; let i = 1; while (i<d.length-1 && d[i]<s) i++;
    return route.points[i-1].clone().lerp(route.points[i], Math.min(1,Math.max(0,(s-d[i-1])/Math.max(1e-8,d[i]-d[i-1])))); };
  if (route.points.length < 2) return null;
  const s = Math.min(route.s, route.length), a = at(s), b = at(Math.min(route.length, s + lookahead));
  if (Math.hypot(b.x-a.x,b.z-a.z) < 1e-3) return null;
  return Math.atan2(b.x-a.x, b.z-a.z);
}

export class Navigator {
  constructor(world, { ground=() => 0, water=() => false, waterY=-.55, radius=.46, height=1.7, extent=33, ceiling=47, budget=5000, slice=6 }={}){
    Object.assign(this,{world,ground,water,waterY,radius,height,extent,ceiling,budget,slice});
    this.cache = new Map(); this.cacheTree = null; this.box = new Box3();
  }
  within(p){ return Math.hypot(p.x,p.z)<=this.extent && p.y>=-5 && p.y<=this.ceiling; }
  clear(a,b,step=0){ return !flightBlocked(this.world.moveBody(a,b,this.radius,this.height,step),b,step); }
  support(p){
    const floor = this.world.floorAt(p.x,p.z,p.y,.3,this.ground(p.x,p.z));
    return v(p.x,!floor.onPlatform && this.water(p.x,p.z) ? Math.max(floor.h,this.waterY) : floor.h,p.z);
  }
  // Nothing solid in the given height above the head: no tree canopy or overhang to come down through or stand under.
  open(p, headroom){
    for (const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
      const from = v(p.x+dx*this.radius,p.y+this.height,p.z+dz*this.radius);
      if (this.world.segmentHit(from,from.clone().setY(from.y+headroom),solid => solid.body)) return false;
    }
    return true;
  }
  landing(p, headroom=0){ const point = this.support(p); return this.within(point)&&this.clear(point,point)&&(!headroom||this.open(point,headroom)) ? point : null; }
  destination(requested, { headroom=0, rim=this.extent-.5 }={}){
    const target = requested.clone(), r = Math.hypot(target.x,target.z);
    if (r>rim){ target.x *= rim/r; target.z *= rim/r; }
    target.y = Math.min(this.ceiling,target.y);
    const exact = this.landing(target,headroom); if (exact) return exact;
    // Clicks on a wall or a crowded rim mean "go here", not "stand inside this triangle".
    for (const distance of [.6,1.2,1.8,2.4,3.6,5,7,10]){
      const candidates = [];
      for (let i=0;i<16;i++){
        const angle = i/16*Math.PI*2, point = target.clone().add(v(Math.cos(angle)*distance,0,Math.sin(angle)*distance));
        const landing = this.landing(point,headroom); if (landing) candidates.push(landing);
      }
      if (candidates.length) return candidates.sort((a,b)=>a.distanceToSquared(target)-b.distanceToSquared(target))[0];
    }
    return target;
  }
  // Static scenery is measured once per cell and reused across searches until the collision world is rebuilt.
  // Anything near a moving solid (the folding crane, the turning Oracle) is always measured afresh.
  fresh(){ if (this.cacheTree !== this.world.tree){ this.cache.clear(); this.cacheTree = this.world.tree; } }
  volatile(a, b=a){
    const box = this.box.makeEmpty().expandByPoint(a).expandByPoint(b);
    box.min.x -= this.radius; box.min.z -= this.radius; box.max.x += this.radius; box.max.z += this.radius; box.max.y += this.height;
    return this.world.dynamic.some(solid => solid.body && solid.bounds && box.intersectsBox(solid.bounds));
  }
  remember(key, a, b, value){ if (!this.volatile(a,b)) this.cache.set(key,value); return value; }
  // A walkable floor cell, found the way a step finds it: the first standable face below a step above `fromY`.
  floorCell(ix, iz, fromY){
    const top = Math.ceil((fromY+STEP)/.25)*.25, key = `f${ix},${iz},${top}`;
    const known = this.cache.get(key); if (known) return known;
    const x = ix*GROUND_CELL, z = iz*GROUND_CELL, floor = this.world.floorAt(x,z,top-STEP,STEP,this.ground(x,z)), point = v(x,floor.h,z);
    const ok = this.within(point) && (floor.onPlatform || !this.water(x,z)) && this.clear(point,point,STEP);
    return this.remember(key, point, point, { point, ok, ix, iz, key:`g${ix},${iz},${Math.round(floor.h*5)}` });
  }
  airCell(ix, iy, iz, cell){
    const key = `a${cell}:${ix},${iy},${iz}`, known = this.cache.get(key); if (known) return known;
    const point = v(ix*cell,iy*cell,iz*cell);
    return this.remember(key, point, point, { point, ok:this.within(point)&&this.clear(point,point), ix, iy, iz, key });
  }
  // Walk a straight line on the actual floor, checking every short step as the player would take it.
  *trace(from, to, exact=true){
    if (exact && Math.abs(from.y-to.y)>.65+Math.hypot(from.x-to.x,from.z-to.z)) return null;
    const count = Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/SAMPLE)), points = [];
    let previous = from;
    for (let i=1;i<=count;i++){
      if (i%6===0) yield;
      const point = from.clone().lerp(to,i/count);
      const floor = this.world.floorAt(point.x,point.z,previous.y,STEP,this.ground(point.x,point.z)); point.y = floor.h;
      if ((!floor.onPlatform&&this.water(point.x,point.z)) || Math.abs(point.y-previous.y)>RISE || !this.within(point) || !this.clear(previous,point,STEP)) return null;
      points.push(point); previous = point;
    }
    return !exact || previous.distanceTo(to)<.15 ? points : null;
  }
  walkEdge(from,to){ return run(this.trace(from,to)); }
  // Start from where the body actually fits, in case the player is resting slightly inside a rock.
  settle(from, step){
    const position = this.world.moveBody(from,from,this.radius,this.height,step).position;
    return position.distanceTo(from) > .05 ? position : from.clone();
  }
  chain(node, tail){ const points = []; for (let n=node;n;n=n.parent) points.push(n.point.clone()); return points.reverse().concat(tail); }
  // Lazy A*: cells are measured when first seen, but the swept edge into a cell is only checked when the
  // cell is taken from the queue. Every neighbour may queue a cell, so a blocked edge leaves other ways in.
  *groundSearch(start, goal, budget){
    const queue = new Queue(), closed = new Set(), weight = 1.25;
    const estimate = p => { const dx = Math.abs(p.x-goal.x), dz = Math.abs(p.z-goal.z); return (Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz))*weight; };
    queue.push({ point:start, key:'start', ix:Math.round(start.x/GROUND_CELL), iz:Math.round(start.z/GROUND_CELL), g:0, score:estimate(start), checked:true });
    let expanded = 0;
    while (queue.items.length && expanded<budget){
      const node = queue.pop(); if (closed.has(node.key)) continue;
      if (!node.checked){
        const key = node.parent.key==='start' ? null : `e${node.parent.key}>${node.key}`;
        let ok = key && this.cache.get(key);
        if (ok === undefined || ok === null) ok = !!(yield* this.trace(node.parent.point,node.point));
        if (key) this.remember(key,node.parent.point,node.point,ok);
        if (!ok) continue;
      }
      closed.add(node.key); if (++expanded%8===0) yield;
      if (Math.hypot(node.point.x-goal.x,node.point.z-goal.z)<GROUND_CELL*2.5){
        const last = yield* this.trace(node.point,goal); if (last) return this.chain(node,[goal.clone()]);
      }
      // Walking right along a wall, a rock or the water's edge costs a little more, so routes keep a natural
      // berth where there is room. That margin is also what lets the corners be rounded.
      const cells = flat.map(([dx,dz]) => this.floorCell(node.ix+dx,node.iz+dz,node.point.y));
      const open = cells.map(cell => cell.ok && Math.abs(cell.point.y-node.point.y)<=RISE), margin = open.every(Boolean) ? 1 : HUG;
      cells.forEach((cell,i) => {
        if (!open[i] || closed.has(cell.key)) return;
        const g = node.g+node.point.distanceTo(cell.point)*margin;
        queue.push({ point:cell.point, key:cell.key, ix:cell.ix, iz:cell.iz, g, score:g+estimate(cell.point), parent:node });
      });
    }
    return null;
  }
  *airSearch(start, goal, cell, budget){
    const queue = new Queue(), closed = new Set(), weight = 1.2;
    queue.push({ point:start, key:'start', ix:Math.round(start.x/cell), iy:Math.round(start.y/cell), iz:Math.round(start.z/cell), g:0, score:start.distanceTo(goal)*weight, checked:true });
    let expanded = 0, best = { node:null, tail:[], distance:start.distanceTo(goal) };
    while (queue.items.length && expanded<budget){
      const node = queue.pop(); if (closed.has(node.key)) continue;
      if (!node.checked){
        const key = node.parent.key==='start' ? null : `e${node.parent.key}>${node.key}`;
        let ok = key && this.cache.get(key);
        if (ok === undefined || ok === null) ok = this.clear(node.parent.point,node.point);
        if (key) this.remember(key,node.parent.point,node.point,ok);
        if (!ok) continue;
      }
      closed.add(node.key); if (++expanded%8===0) yield;
      const distance = node.point.distanceTo(goal);
      if ((distance<cell*2.2 || expanded%24===1) && this.clear(node.point,goal)) return { chain:this.chain(node,[goal.clone()]), reached:true };
      // Keep a reachable, supported alternative for clicks into sealed or inaccessible geometry.
      if (distance<best.distance-.1){
        const floor = this.landing(node.point);
        if (floor && floor.distanceTo(goal)<best.distance && this.clear(node.point,floor)) best = { node, tail:[floor], distance:floor.distanceTo(goal) };
      }
      const cells = directions.map(([dx,dy,dz]) => this.airCell(node.ix+dx,node.iy+dy,node.iz+dz,cell)), margin = cells.every(next => next.ok) ? 1 : HUG;
      for (const next of cells){
        if (!next.ok || closed.has(next.key)) continue;
        const g = node.g+node.point.distanceTo(next.point)*margin;
        queue.push({ point:next.point, key:next.key, ix:next.ix, iy:next.iy, iz:next.iz, g, score:g+next.point.distanceTo(goal)*weight, parent:node });
      }
    }
    return { chain:best.node ? this.chain(best.node,best.tail) : [start.clone()], reached:false };
  }
  // A cheap look along measured cells. Final legs are always confirmed with the real swept checks.
  *sight(a, b, walk, cell){
    const length = walk ? Math.hypot(b.x-a.x,b.z-a.z) : a.distanceTo(b), count = Math.ceil(length/(cell*.3));
    let y = a.y;
    for (let i=1;i<count;i++){
      const t = i/count; if (t*length<.6 || (1-t)*length<.6) continue;
      if (i%12===0) yield;
      const p = a.clone().lerp(b,t);
      if (walk){
        const c = this.floorCell(Math.round(p.x/cell),Math.round(p.z/cell),y);
        if (!c.ok || Math.abs(c.point.y-y)>RISE) return false; y = c.point.y;
      } else if (!this.airCell(Math.round(p.x/cell),Math.round(p.y/cell),Math.round(p.z/cell),cell).ok) return false;
    }
    return !walk || Math.abs(b.y-y)<=RISE+.3;
  }
  *link(a, b, walk, exact=true){
    if (walk) return yield* this.trace(a,b,exact);
    return this.clear(a,b) ? [b.clone()] : null;
  }
  // Pull a grid path tight, then round each corner with the widest bend that still clears the scenery.
  *refine(chain, walk, cell){
    if (chain.length<2) return chain.map(p => p.clone());
    const keep = [0]; let anchor = 0;
    for (let i=2;i<chain.length;i++) if (!(yield* this.sight(chain[anchor],chain[i],walk,cell))){ keep.push(i-1); anchor = i-1; }
    keep.push(chain.length-1);
    const legs = [], self = this;
    function* confirm(i, j){
      const points = yield* self.link(chain[i],chain[j],walk);
      if (points || j-i<2){ legs.push({ from:chain[i], points:points || [chain[j].clone()] }); return; }
      const middle = (i+j)>>1; yield* confirm(i,middle); yield* confirm(middle,j);
    }
    for (let k=1;k<keep.length;k++) yield* confirm(keep[k-1],keep[k]);
    legs.forEach(leg => { let d = 0, p = leg.from; leg.stops = [0]; for (const q of leg.points){ d += p.distanceTo(q); leg.stops.push(d); p = q; } leg.length = d; });
    const along = (leg, d) => { const poly = [leg.from,...leg.points]; let i = 1; while (i<poly.length-1 && leg.stops[i]<d) i++;
      return poly[i-1].clone().lerp(poly[i],Math.min(1,Math.max(0,(d-leg.stops[i-1])/Math.max(1e-8,leg.stops[i]-leg.stops[i-1])))); };
    const cut = legs.map(() => ({ head:0, tail:0, curve:null }));
    for (let k=0;k<legs.length-1;k++){
      const a = legs[k], b = legs[k+1], corner = b.from, din = heading(a.from,corner,walk), dout = heading(corner,b.points[b.points.length-1],walk);
      if (!din || !dout || din.dot(dout)>.998) continue;
      let r = Math.min(walk ? 2.4 : 4, a.length-cut[k].head, b.length*(k+2<legs.length ? .5 : .85));
      for (; r>=.3; r*=.5){
        const curve = yield* this.bend(along(a,a.length-r),corner,along(b,r),walk);
        if (curve){ cut[k].tail = r; cut[k+1].head = r; cut[k].curve = curve; break; }
      }
    }
    const out = [chain[0].clone()];
    legs.forEach((leg,k) => {
      const from = cut[k].head, to = leg.length-cut[k].tail;
      leg.points.forEach((p,i) => { if (leg.stops[i+1]>from+1e-3 && leg.stops[i+1]<to-1e-3) out.push(p); });
      out.push(along(leg,to)); if (cut[k].curve) out.push(...cut[k].curve);
    });
    return out.filter((p,i) => !i || p.distanceTo(out[i-1])>.02 || i===out.length-1);
  }
  *bend(a, corner, b, walk){
    const count = Math.max(2,Math.ceil((a.distanceTo(corner)+corner.distanceTo(b))/SAMPLE)), points = [];
    let previous = a;
    for (let i=1;i<=count;i++){
      const q = bezier(a,corner,b,i/count), part = yield* this.link(previous,q,walk,false);
      if (!part) return null;
      points.push(...part); previous = points[points.length-1];
    }
    return points;
  }
  // With `fly:false` only a ground route is sought; when there is none, `{ hop }` names the supported
  // landing so the caller can use its own flight.
  *planSteps(from,requested,{walk=true,fly=true,landing}={}){
    this.fresh();
    const goal=this.destination(requested,landing);
    const finish = route => ({...route,navigation:true,requested:requested.clone()});
    if (walk && (!fly || Math.abs(from.y-goal.y)<1)){
      const start=this.settle(from,STEP), lead=start.equals(from) ? [] : [from.clone()];
      const direct=yield* this.trace(start,goal);
      if (direct) return finish(waypointRoute([...lead,start,...direct],true));
      const ground=yield* this.groundSearch(start,goal,Math.min(1800,this.budget));
      if (ground) return finish(waypointRoute([...lead,...(yield* this.refine(ground,true,GROUND_CELL))],true));
    }
    if (!fly) return { hop:goal, requested:requested.clone() };
    const flight=planFlight(this.world,from,goal,{radius:this.radius,height:this.height,ceiling:this.ceiling});
    if (flight) return finish(flight);
    const start=this.settle(from,0), lead=start.equals(from) ? [] : [from.clone()];
    const air=yield* this.airSearch(start,goal,1.5,this.budget);
    if (air.reached) return finish(waypointRoute([...lead,...(yield* this.refine(air.chain,false,1.5))],false));
    const fine=yield* this.airSearch(start,goal,.75,this.budget);
    const [path,cell]=fine.reached || fine.chain.at(-1).distanceTo(goal)<air.chain.at(-1).distanceTo(goal) ? [fine.chain,.75] : [air.chain,1.5];
    return finish({...waypointRoute([...lead,...(yield* this.refine(path,false,cell))],false),partial:!fine.reached&&!air.reached});
  }
  plan(from,requested,options){ return run(this.planSteps(from,requested,options)); }
  async planAsync(from,requested,options,cancelled=()=>false){
    const steps=this.planSteps(from,requested,options); let result, deadline=performance.now()+this.slice;
    do {
      if (cancelled()) return null;
      result=steps.next();
      if (!result.done&&performance.now()>deadline){ await new Promise(resolve=>setTimeout(resolve,0)); deadline=performance.now()+this.slice; }
    } while (!result.done);
    return cancelled() ? null : result.value;
  }
  // Join a route found from where a click happened to where the walker is now. A walker still in stride
  // curves from its current heading onto the new route instead of stopping dead and pivoting.
  resume(route, position, speed=0, facing=null){
    if (!route.points) return position.distanceTo(route.from)>.05 ? { ...route, from:position.clone() } : route;
    const points = route.points, moving = route.walk && speed>.3 && facing!==null;
    if (!moving && position.distanceTo(route.from)<=.05) return route;
    let best = 0;
    for (let i=1;i<points.length && route.distances[i]<3;i++) if (points[i].distanceTo(position)<points[best].distanceTo(position)) best = i;
    let join = null, at = best, skid = 0;
    if (moving){
      const reach = route.distances[best]+Math.min(2,.3+.25*speed), ahead = v(Math.sin(facing),0,Math.cos(facing));
      while (at<points.length-1 && route.distances[at]<reach) at++;
      const toward = heading(position,points[at],true), lead = Math.min(position.distanceTo(points[at])*.6, .3+.2*speed);
      if (toward && toward.dot(ahead)>-.35) join = run(this.bend(position,position.clone().addScaledVector(ahead,lead),points[at],true));
      if (join && Math.hypot(join[join.length-1].x-points[at].x,join[join.length-1].z-points[at].z)>.05) join = null;
      // Past about 110 degrees a curve would fold back on itself: skid to a stop a short way on, then turn back.
      if (!join && speed>2){
        at = best; skid = speed*speed/(2*.8*SKID)+.05;
        const out = run(this.trace(position,position.clone().addScaledVector(ahead,skid),false)), back = out && this.walkEdge(out[out.length-1],points[at]);
        join = out && back ? [...out,...back] : null; if (!join) skid = 0;
      }
    }
    if (!join){ at = best; join = at && route.walk ? this.walkEdge(position,points[at]) : null; }
    const tail = join ? [position.clone(),...join,...points.slice(at+1)] : [position.clone(),...points];
    const next = { ...route, ...waypointRoute(tail,route.walk,{ speed:route.speed, accel:route.accel, brake:route.brake, lateral:route.walk ? PACE.walk.lateral : PACE.air.lateral }), skid };
    if (speed>0 && facing!==null){
      const ahead = routeHeading(next);
      next.v = ahead===null ? 0 : Math.min(next.speed,speed)*(moving && join ? 1 : Math.max(0,Math.cos(ahead-facing)));
    }
    return next;
  }
}
