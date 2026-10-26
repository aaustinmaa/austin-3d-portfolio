import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, Vector3 } from 'three';
import { CollisionWorld } from '../src/colliders.js';
import { Navigator, waypointRoute, advanceRoute, PACE } from '../src/navigation.js';
import { flightPoint, flightStops, flightBlocked } from '../src/flight-path.js';

const v=(x,y,z)=>new Vector3(x,y,z);
function setup(boxes=[],options={}){
  const world=new CollisionWorld();
  for (const [size,position] of [[[60,1,60],[0,-.5,0]],...boxes]){
    const mesh=new Mesh(new BoxGeometry(...size)); mesh.position.fromArray(position); world.addMesh(mesh);
  } world.build(); return {world,nav:new Navigator(world,{extent:24,budget:1600,...options})};
}
function follow(world,route,dt=.05){
  let position=route.from.clone(), before=0;
  for (let time=dt;time<route.dur+dt;time+=dt){
    const t=Math.min(1,time/route.dur),e=t<.5?2*t*t:1-2*(1-t)**2;
    for (const point of flightStops(route,before,e)){
      const motion=world.moveBody(position,point,.46,1.7,route.walk?.6:0);
      assert.equal(flightBlocked(motion,point,route.walk?.6:0),false); position=motion.position;
    } before=e;
  } assert.ok(position.distanceTo(route.to)<.06); return position;
}

test('clicks around several corners take a connected ground route rather than a guessed arc',()=>{
  const {world,nav}=setup([[[9,6,.4],[-2,3,-2]],[[9,6,.4],[2,3,2]]]);
  const route=nav.plan(v(0,0,-7),v(0,0,7));
  assert.equal(route.walk,true); assert.ok(route.points.some(p=>p.x>2.9)); assert.ok(route.points.some(p=>p.x< -2.9)); follow(world,route);
});

test('a click inside a pillar resolves to nearby supported ground without an error state',()=>{
  const {world,nav}=setup([[[3,6,3],[0,3,5]]]);
  const route=nav.plan(v(0,0,-5),v(0,1,5));
  assert.ok(route.to.distanceTo(v(0,0,5))<4);
  assert.ok(route.to.distanceTo(v(0,0,5))>1.5); follow(world,route);
});

test('waypoint traversal visits each corner in a long frame instead of cutting through the inside wall',()=>{
  const {world}=setup([[[2,4,2],[0,2,0]]]);
  const route=waypointRoute([v(-2,0,0),v(-2,0,2),v(2,0,2),v(2,0,0)],true);
  assert.equal(flightStops(route,0,1).length,3); follow(world,route,route.dur);
});

test('air search finds a multi-turn route under a roof when fixed flight arcs cannot fit',()=>{
  const {world,nav}=setup([[[12,.4,20],[0,5,0]],[[9,5,.4],[-2,2.5,-2]],[[9,5,.4],[2,2.5,2]]],{ceiling:3});
  const route=nav.plan(v(0,1,-7),v(0,0,7),{walk:false});
  assert.ok(route.to.distanceTo(v(0,0,7))<.1); assert.ok(route.points); follow(world,route);
});

test('an inaccessible enclosed click chooses a reachable landing and never crosses the enclosure',()=>{
  const {world,nav}=setup([[[.3,8,8],[-4,4,0]],[[.3,8,8],[4,4,0]],[[8,8,.3],[0,4,-4]],[[8,8,.3],[0,4,4]],[[9,.3,9],[0,8,0]]],{ceiling:6,budget:500});
  const from=v(0,0,-8),route=nav.plan(from,v(0,0,0),{walk:false});
  assert.ok(route.to.distanceTo(v(0,0,0))<from.length()); assert.ok(route.to.z< -4); follow(world,route);
});

test('after an obstacle appears, a fresh route still reaches the original destination',()=>{
  const {world,nav}=setup(); const goal=v(0,0,7);
  const first=nav.plan(v(0,0,-7),goal); const current=flightPoint(first,.3);
  const wall=new Mesh(new BoxGeometry(5,4,.4)); wall.position.set(0,2,0); world.addMesh(wall); world.build();
  const reroute=nav.plan(current,goal);
  assert.ok(reroute.to.distanceTo(goal)<.1); follow(world,reroute);
});

test('incremental searches can be superseded by a newer click',async()=>{
  const {nav}=setup();
  const cancelled=await nav.planAsync(v(0,0,-5),v(0,0,5),{},()=>true);
  assert.equal(cancelled,null);
  const route=await nav.planAsync(v(0,0,-5),v(0,0,5)); assert.ok(route.to.distanceTo(v(0,0,5))<.1);
});

const turns=route=>{ const out=[]; for (let i=2;i<route.points.length;i++){
  const a=route.points[i-1].clone().sub(route.points[i-2]).setY(0), b=route.points[i].clone().sub(route.points[i-1]).setY(0);
  if (a.lengthSq()>1e-6&&b.lengthSq()>1e-6) out.push(a.angleTo(b)); } return out; };
function ride(world,route,dt){
  let position=route.from.clone(), before=0, time=0, top=0, last=0;
  while (time<20){
    const e=advanceRoute(route,dt); time+=dt; top=Math.max(top,route.v);
    for (const point of flightStops(route,before,e)){
      const motion=world.moveBody(position,point,.46,1.7,route.walk?.6:0);
      assert.equal(flightBlocked(motion,point,route.walk?.6:0),false); position=motion.position;
    } before=e; if (e>=1) break; last=route.v;
  } assert.ok(position.distanceTo(route.to)<.06); return {time,top,last};
}

test('a detour around a pillar is pulled tight and rounded rather than following grid steps',()=>{
  const {world,nav}=setup([[[2,6,2],[0,3,0]]]);
  const route=nav.plan(v(.3,0,-6),v(-.2,0,6));
  assert.equal(route.walk,true);
  assert.ok(Math.max(...turns(route))<.35);
  assert.ok(route.length<route.from.distanceTo(route.to)*1.15);
  follow(world,route); ride(world,{...route,s:0,v:0},1/60);
});

test('click routes ease in, cruise at walking pace and ease out the same way at any frame rate',()=>{
  const {world}=setup(), points=[]; for (let x=-8;x<=8;x+=.4) points.push(v(x,0,0));
  const fast=ride(world,waypointRoute(points.map(p=>p.clone()),true),1/120), slow=ride(world,waypointRoute(points.map(p=>p.clone()),true),.05);
  assert.ok(Math.abs(fast.time-slow.time)<.1);
  assert.ok(fast.top<=PACE.walk.speed+1e-9 && fast.top>PACE.walk.speed-.01);
  assert.ok(fast.last<1.2&&slow.last<1.6);
});

test('a sharp corner that cannot be rounded is taken slowly',()=>{
  const route=waypointRoute([v(0,0,0),v(0,0,6),v(6,0,6)],true); let slowest=Infinity;
  while (advanceRoute(route,1/60)<1) if (Math.abs(route.s-6)<.2) slowest=Math.min(slowest,route.v);
  assert.ok(slowest<3);
});

test('a new click mid-stride curves onto the new route and keeps its pace',()=>{
  const {world,nav}=setup(), from=v(0,0,0);
  const route=nav.plan(from,v(8,0,8)), next=nav.resume(route,from,PACE.walk.speed,0);
  assert.ok(next.v>PACE.walk.speed-.01);
  const first=next.points[1].clone().sub(next.points[0]); assert.ok(Math.atan2(first.x,first.z)<.35);
  ride(world,next,1/60);
});

test('reversing mid-stride skids to a stop a little way on before turning back',()=>{
  const {world,nav}=setup(), from=v(0,0,0);
  const next=nav.resume(nav.plan(from,v(0,0,-8)),from,PACE.walk.speed,0);
  assert.ok(next.skid>.8&&next.skid<1.6); assert.ok(next.points.some(p=>p.z>.8));
  ride(world,next,1/60);
});
