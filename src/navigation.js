import { Vector3 } from 'three';
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
const directions = [];
for (let x=-1;x<=1;x++) for (let y=-1;y<=1;y++) for (let z=-1;z<=1;z++) if (x||y||z) directions.push(v(x,y,z));

export function waypointRoute(points, walk=false){
  const distances = [0];
  for (let i=1;i<points.length;i++) distances.push(distances[i-1]+points[i].distanceTo(points[i-1]));
  const length = distances[distances.length-1];
  return { from:points[0].clone(), to:points[points.length-1].clone(), points, distances, length, walk, arc:0, t:0, dur:Math.max(.2,length/(walk ? 7 : 12)) };
}

export class Navigator {
  constructor(world, { ground=() => 0, water=() => false, waterY=-.55, radius=.46, height=1.7, extent=33, ceiling=47, budget=5000 }={}){
    Object.assign(this,{world,ground,water,waterY,radius,height,extent,ceiling,budget});
  }
  within(p){ return Math.hypot(p.x,p.z)<=this.extent && p.y>=-5 && p.y<=this.ceiling; }
  clear(a,b,step=0){ return !flightBlocked(this.world.moveBody(a,b,this.radius,this.height,step),b,step); }
  support(p){
    const floor = this.world.floorAt(p.x,p.z,p.y,.3,this.ground(p.x,p.z));
    return v(p.x,!floor.onPlatform && this.water(p.x,p.z) ? Math.max(floor.h,this.waterY) : floor.h,p.z);
  }
  landing(p){ const point = this.support(p); return this.within(point)&&this.clear(point,point) ? point : null; }
  destination(requested){
    const target = requested.clone(), r = Math.hypot(target.x,target.z);
    if (r>this.extent-.5){ target.x *= (this.extent-.5)/r; target.z *= (this.extent-.5)/r; }
    target.y = Math.min(this.ceiling,target.y);
    const exact = this.landing(target); if (exact) return exact;
    // Clicks on a wall or a crowded rim mean "go here", not "stand inside this triangle".
    for (const distance of [.6,1.2,1.8,2.4,3.6,5,7,10]){
      const candidates = [];
      for (let i=0;i<16;i++){
        const angle = i/16*Math.PI*2, point = target.clone().add(v(Math.cos(angle)*distance,0,Math.sin(angle)*distance));
        const landing = this.landing(point); if (landing) candidates.push(landing);
      }
      if (candidates.length) return candidates.sort((a,b)=>a.distanceToSquared(target)-b.distanceToSquared(target))[0];
    }
    return target;
  }
  walkEdge(from,to){
    if (Math.abs(from.y-to.y)>.65+Math.hypot(from.x-to.x,from.z-to.z)) return null;
    const count = Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.4)), points = [];
    let previous = from;
    for (let i=1;i<=count;i++){
      const point = from.clone().lerp(to,i/count);
      const floor = this.world.floorAt(point.x,point.z,previous.y,.6,this.ground(point.x,point.z)); point.y = floor.h;
      if ((!floor.onPlatform&&this.water(point.x,point.z)) || Math.abs(point.y-previous.y)>.61 || !this.within(point) || !this.clear(previous,point,.6)) return null;
      points.push(point); previous = point;
    }
    return previous.distanceTo(to)<.15 ? points : null;
  }
  path(node,tail=[]){
    const edges = [];
    for (let n=node;n.parent;n=n.parent) edges.push(n.edge);
    const points = []; let start = node; while (start.parent) start=start.parent;
    points.push(start.point.clone()); edges.reverse().forEach(edge=>points.push(...edge)); points.push(...tail);
    return points;
  }
  *search(from,goal,walk,cell,budget){
    const queue = new Queue(), costs = new Map(), initial = {point:from.clone(),x:0,y:0,z:0,cost:0,score:from.distanceTo(goal)};
    const key = n => walk ? `${n.x},${n.z},${Math.round(n.point.y*5)}` : `${n.x},${n.y},${n.z}`;
    queue.push(initial); costs.set(key(initial),0);
    let expanded = 0, best = { node:initial, tail:[], distance:from.distanceTo(goal) };
    while (queue.items.length && expanded++<budget){
      if (expanded%32===0) yield;
      const node = queue.pop(); if (node.cost>costs.get(key(node))) continue;
      const distance = node.point.distanceTo(goal);
      if (distance<cell*2.2 || expanded%24===1){
        const edge = walk ? this.walkEdge(node.point,goal) : this.clear(node.point,goal) ? [goal.clone()] : null;
        if (edge) return {points:this.path(node,edge), reached:true};
      }
      // Keep a reachable, supported alternative for clicks into sealed or inaccessible geometry.
      if (distance<best.distance-.1){
        const floor = this.landing(node.point);
        if (floor && floor.distanceTo(goal)<best.distance && this.clear(node.point,floor)) best={node,tail:[floor],distance:floor.distanceTo(goal)};
      }
      for (const d of directions){
        if (walk && d.y) continue;
        const next = {x:node.x+d.x,y:node.y+d.y,z:node.z+d.z};
        let point = v(from.x+next.x*cell,from.y+next.y*cell,from.z+next.z*cell);
        if (!this.within(point)) continue;
        if (walk){
          point.y = this.world.floorAt(point.x,point.z,node.point.y,.6,this.ground(point.x,point.z)).h;
          if (Math.abs(point.y-node.point.y)>.61) continue;
        }
        next.point=point;
        const cost=node.cost+node.point.distanceTo(point), id=key(next);
        if (cost>=(costs.get(id)??Infinity)) continue;
        const edge=walk ? this.walkEdge(node.point,point) : this.clear(node.point,point) ? [point] : null;
        if (!edge) continue;
        costs.set(id,cost); queue.push({...next,cost,score:cost+point.distanceTo(goal)*1.12,parent:node,edge});
      }
    }
    return {points:this.path(best.node,best.tail),reached:false};
  }
  *planSteps(from,requested,{walk=true}={}){
    const goal=this.destination(requested);
    const finish = route => ({...route,navigation:true,requested:requested.clone()});
    if (walk && Math.abs(from.y-goal.y)<1){
      const direct=this.walkEdge(from,goal);
      if (direct) return finish(waypointRoute([from.clone(),...direct],true));
      const ground=yield* this.search(from,goal,true,1,Math.min(1800,this.budget));
      if (ground.reached) return finish(waypointRoute(ground.points,true));
    }
    const flight=planFlight(this.world,from,goal,{radius:this.radius,height:this.height,ceiling:this.ceiling});
    if (flight) return finish(flight);
    const air=yield* this.search(from,goal,false,1.5,this.budget);
    if (air.reached) return finish(waypointRoute(this.simplify(air.points),false));
    const fine=yield* this.search(from,goal,false,.75,this.budget);
    const path=fine.reached || fine.points.at(-1).distanceTo(goal)<air.points.at(-1).distanceTo(goal) ? fine.points : air.points;
    return finish({...waypointRoute(this.simplify(path),false),partial:!fine.reached&&!air.reached});
  }
  plan(from,requested,options){
    const steps=this.planSteps(from,requested,options); let result;
    do { result=steps.next(); } while (!result.done); return result.value;
  }
  async planAsync(from,requested,options,cancelled=()=>false){
    const steps=this.planSteps(from,requested,options); let result, deadline=performance.now()+4;
    do {
      if (cancelled()) return null;
      result=steps.next();
      if (!result.done&&performance.now()>deadline){ await new Promise(resolve=>setTimeout(resolve,0)); deadline=performance.now()+4; }
    } while (!result.done);
    return cancelled() ? null : result.value;
  }
  simplify(points){
    const result=[points[0]];
    for (let i=0;i<points.length-1;){
      let end=points.length-1; while (end>i+1&&!this.clear(points[i],points[end])) end--;
      result.push(points[end]); i=end;
    } return result;
  }
}
