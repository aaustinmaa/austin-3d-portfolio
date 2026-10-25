import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, Ray, Vector3 } from 'three';
import { CollisionWorld } from '../src/colliders.js';
import { resolveBowAim } from '../src/bow-aim.js';

const v = (x,y,z) => new Vector3(x,y,z);
function worldWith(size,position){
  const world = new CollisionWorld();
  if (size){ const box = new Mesh(new BoxGeometry(...size)); box.position.copy(position); world.addMesh(box); }
  world.build(); return world;
}
const ray = new Ray(v(0,1,5),v(0,0,-1)), bow = v(-1,1,0);

test('scenery between the camera and bow cannot turn an arrow back toward the camera', () => {
  const world = worldWith([8,8,.4],v(0,1,2));
  const oldPoint = world.rayHit(ray.origin,ray.direction,140).point;
  assert.ok(oldPoint.clone().sub(bow).dot(ray.direction)<0);
  const aim = resolveBowAim(world,ray,bow,[]);
  assert.ok(aim.direction.dot(ray.direction)>.99);
  assert.equal(world.segmentHit(bow,aim.point),null);
});

test('a camera inside a pillar still aims forward from the bow', () => {
  const world = worldWith([4,8,4],v(0,1,5));
  const aim = resolveBowAim(world,ray,bow,[]);
  assert.ok(aim.direction.dot(ray.direction)>.99);
});

test('a pillar edge on the bow path remains solid even when the centre camera ray is clear', () => {
  const world = worldWith([.4,4,.4],v(-.98,1,-1));
  assert.equal(world.rayHit(ray.origin,ray.direction,140),null);
  const aim = resolveBowAim(world,ray,bow,[]);
  const hit = world.segmentHit(bow,aim.point);
  assert.ok(hit && hit.distance<2);
  assert.ok(hit.point.distanceTo(aim.point)>100);
});

test('surfaces ahead remain accurate targets and relic assistance ignores targets behind the bow', () => {
  const world = worldWith([8,8,.4],v(0,1,-10));
  const relic = pos => ({pos,state:'orbit',group:{visible:true}});
  const aim = resolveBowAim(world,ray,bow,[relic(v(0,1,2)),relic(v(1.8,1,-5))]);
  assert.ok(aim.point.distanceTo(v(0,1,-5))<1e-6);
  const solidAim = resolveBowAim(world,ray,bow,[]);
  assert.ok(solidAim.point.distanceTo(v(0,1,-9.8))<1e-6);
});
