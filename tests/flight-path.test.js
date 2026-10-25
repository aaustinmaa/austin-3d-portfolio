import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, Vector3 } from 'three';
import { CollisionWorld } from '../src/colliders.js';
import { flightPoint, flightBlocked, planFlight } from '../src/flight-path.js';

const v = (x,y,z) => new Vector3(x,y,z);
function worldWith(boxes=[]){
  const world = new CollisionWorld();
  for (const [size,position] of [[[40,1,40],[0,-.5,0]],...boxes]){
    const mesh = new Mesh(new BoxGeometry(...size)); mesh.position.fromArray(position); world.addMesh(mesh);
  }
  world.build(); return world;
}
function follow(world,route,dt){
  let position = route.from.clone();
  for (let t=dt; t<route.dur+dt; t+=dt){
    const progress = Math.min(1,t/route.dur), e = progress<.5 ? 2*progress*progress : 1-2*(1-progress)**2;
    const desired = flightPoint(route,e), motion = world.moveBody(position,desired,.46,1.7);
    assert.equal(flightBlocked(motion,desired),false); position.copy(motion.position);
  }
  assert.ok(position.distanceTo(route.to)<.06);
}

test('normal support contact does not cancel a flight or a ground glide', () => {
  assert.equal(flightBlocked({ position:v(0,.002,0),collided:true },v(0,0,0)),false);
  assert.equal(flightBlocked({ position:v(0,.3,0),collided:true },v(0,0,0),.6),false);
  assert.equal(flightBlocked({ position:v(.3,0,0),collided:true },v(0,0,0),.6),true);
});

test('a blocked original arc is raised before takeoff and completes at different frame rates', () => {
  const world = worldWith([[[8,4,.3],[0,2,0]]]);
  const route = planFlight(world,v(0,0,-5),v(0,0,5),{arc:2});
  assert.ok(route && route.arc>2);
  follow(world,route,1/60); follow(world,route,.05);
});

test('low overhead clearance chooses a side route around a tall narrow obstacle', () => {
  const world = worldWith([[[1,8,.5],[0,4,0]],[[30,.5,30],[0,6,0]]]);
  const route = planFlight(world,v(0,0,-5),v(0,0,5),{arc:1,ceiling:4});
  assert.ok(route && Math.abs(route.bend.x)>0);
  follow(world,route,.05);
});

test('an occupied destination is rejected while the player is still at the departure point', () => {
  const world = worldWith([[[4,4,4],[0,2,5]]]), from = v(0,0,-5), original = from.clone();
  assert.equal(planFlight(world,from,v(0,1,5)),null);
  assert.deepEqual(from,original);
});

test('a high perch is approached above its edge and lands with the whole body clear', () => {
  const world = worldWith([[[2,8,2],[0,4,5]]]);
  const route = planFlight(world,v(0,0,-5),v(0,8,5));
  assert.ok(route); follow(world,route,.05);
});

test('a player already touching a wall can rise first instead of cancelling at takeoff', () => {
  const world = worldWith([[[8,2,.3],[0,1,0]]]);
  const route = planFlight(world,v(0,0,-.612),v(0,0,5));
  assert.ok(route && route.cruise !== undefined);
  follow(world,route,.05);
});
