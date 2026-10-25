import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollisionWorld, slideVelocity } from '../src/colliders.js';

const v = (x,y,z) => new THREE.Vector3(x,y,z);
const close = (actual, expected, tolerance=1e-5) => assert.ok(Math.abs(actual-expected) < tolerance, `${actual} != ${expected}`);
function worldFor(mesh, options){ const world = new CollisionWorld(); world.addMesh(mesh, options); world.build(); return world; }
const mesh = geometry => new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side:THREE.DoubleSide }));

test('rotated, nonuniformly scaled instances hit their rendered facets', () => {
  const object = new THREE.InstancedMesh(new THREE.CylinderGeometry(.55,.7,8,8), new THREE.MeshBasicMaterial({ side:THREE.DoubleSide }), 2);
  object.position.set(2,0,-1); object.rotation.y = .3;
  object.setMatrixAt(0, new THREE.Matrix4().compose(v(0,4,0), new THREE.Quaternion().setFromAxisAngle(v(0,1,0), .4), v(1.3,1,.6)));
  object.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4,4,0));
  const world = worldFor(object), ray = new THREE.Raycaster(v(2,4,8), v(0,0,-1));
  const visual = ray.intersectObject(object)[0], hit = world.segmentHit(ray.ray.origin, v(2,4,-8));
  assert.ok(visual && hit); close(hit.point.distanceTo(visual.point), 0);
  assert.equal(world.segmentHit(v(4,4,8), v(4,4,-8)), null);
});

test('floor and ceiling follow a sloped stone instead of its bounding cylinder', () => {
  const object = mesh(new THREE.BoxGeometry(4,.4,4)); object.rotation.z = .2; object.position.y = 5;
  const world = worldFor(object);
  const top = world.floorAt(1,0,6,0,-10).h;
  close(top, 5 + Math.tan(.2) + .2/Math.cos(.2));
  close(world.ceilingAt(1,0,3), 5 + Math.tan(.2) - .2/Math.cos(.2));
  assert.equal(world.floorAt(5,0,6,0,-10).h, -10);
});

test('hollow bowls and rings retain open space and thin metal surfaces', () => {
  const object = mesh(new THREE.TorusGeometry(1,.06,8,32));
  const world = worldFor(object);
  assert.equal(world.segmentHit(v(0,0,2), v(0,0,-2)), null);
  const hit = world.segmentHit(v(1,0,2), v(1,0,-2));
  assert.ok(hit); close(hit.point.z, .06);
  const bowl = mesh(new THREE.LatheGeometry([[0,0],[.4,0],[1,1],[.9,1],[.35,.2],[0,.2]].map(([r,y]) => new THREE.Vector2(r,y)),32));
  const bowlWorld = worldFor(bowl);
  close(bowlWorld.segmentHit(v(0,2,0), v(0,-1,0)).point.y, .2);
});

test('fast arrows stop on thin surfaces from both sides without sample gaps', () => {
  const world = worldFor(mesh(new THREE.BoxGeometry(5,5,.01)));
  close(world.segmentHit(v(0,0,100), v(0,0,-100)).point.z, .005);
  close(world.segmentHit(v(0,0,-100), v(0,0,100)).point.z, -.005);
});

test('fast flight and diagonal movement cannot cross a thin wall; movement slides', () => {
  const world = worldFor(mesh(new THREE.BoxGeometry(.02,20,20)));
  const result = world.moveBody(v(-3,0,0), v(3,0,3), .32, 1.7);
  assert.ok(result.collided); assert.ok(result.position.x < -.329);
  assert.ok(result.position.z > 2.9);
});

test('airborne feet and head collide with the actual slab underside and top', () => {
  const object = mesh(new THREE.BoxGeometry(4,.2,4)); object.position.y = 3;
  const world = worldFor(object);
  const up = world.moveBody(v(0,0,0), v(0,5,0), .32, 1.7);
  assert.ok(up.ceiling); close(up.position.y, 2.9-1.7, .004);
  const down = world.moveBody(v(0,6,0), v(0,0,0), .32, 1.7);
  assert.ok(down.grounded); close(down.position.y, 3.1, .004);
  const side = world.moveBody(v(-3,2.7,0), v(3,2.7,0), .32, 1.7);
  assert.ok(side.collided); assert.ok(side.position.x < -2);
});

test('grounded step allowance permits a stair riser without allowing airborne clipping', () => {
  const object = mesh(new THREE.BoxGeometry(4,.42,4)); object.position.set(1,.21,0);
  const world = worldFor(object);
  const walk = world.moveBody(v(-2,0,0), v(0,.42,0), .32, 1.7, .6);
  close(walk.position.x, 0); close(walk.position.y, .42);
  const air = world.moveBody(v(-2,0,0), v(0,0,0), .32, 1.7);
  assert.ok(air.collided); assert.ok(air.position.x < -1.31);
});

test('dynamic solids follow parent transforms, visibility and deformed vertices', () => {
  const parent = new THREE.Group(), object = mesh(new THREE.BoxGeometry(1,1,1)); parent.add(object);
  const world = worldFor(parent, { dynamic:true, deforming:true });
  parent.position.x = 4; parent.rotation.y = .2; world.updateDynamic();
  assert.equal(world.segmentHit(v(0,0,2),v(0,0,-2)), null);
  assert.ok(world.segmentHit(v(4,0,2),v(4,0,-2)));
  object.geometry.translate(0,3,0); world.updateDynamic();
  assert.equal(world.segmentHit(v(4,0,2),v(4,0,-2)), null);
  assert.ok(world.segmentHit(v(4,3,2),v(4,3,-2)));
  parent.visible = false; world.updateDynamic();
  assert.equal(world.segmentHit(v(4,3,2),v(4,3,-2)), null);
});

test('terrain support uses rendered triangles and stays distinct from platforms', () => {
  const object = mesh(new THREE.PlaneGeometry(10,10,1,1).rotateX(-Math.PI/2)); object.position.y = .15;
  const world = worldFor(object, { terrain:true });
  const floor = world.floorAt(0,0,0,.6,0);
  close(floor.h, .15); assert.equal(floor.onPlatform, false);
});

test('cached moving geometry remains accurate under nested scales, rotation and instancing', () => {
  const parent = new THREE.Group(); parent.scale.set(1,2,.5); parent.rotation.y = .3;
  const object = new THREE.InstancedMesh(new THREE.BoxGeometry(1,3,1), new THREE.MeshBasicMaterial({ side:THREE.DoubleSide }), 2);
  object.rotation.y = .6; parent.add(object);
  object.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0,0,0));
  object.setMatrixAt(1, new THREE.Matrix4().makeTranslation(5,0,0));
  const world = worldFor(parent, { dynamic:true }), from = v(0,0,3), to = v(0,0,-3);
  const visual = new THREE.Raycaster(from, v(0,0,-1)).intersectObject(object)[0];
  close(world.segmentHit(from,to).point.distanceTo(visual.point), 0);
  parent.position.x = 3; world.updateDynamic();
  assert.equal(world.segmentHit(from,to), null);
  const result = world.moveBody(v(0,0,0), v(6,0,0), .32,1.7);
  assert.ok(result.collided); assert.ok(result.position.x < 3);
});

test('walkable banks support gravity without creating downhill drift; walls still slide', () => {
  const resting = v(0,-1.3,0);
  slideVelocity(resting,[v(0,.8,-.6)]);
  close(resting.length(),0);
  const walking = v(0,-1.3,7);
  slideVelocity(walking,[v(0,.8,-.6)]);
  close(walking.y,0); close(walking.z,7);
  const wall = v(3,-2,4);
  slideVelocity(wall,[v(-1,0,0)]);
  close(wall.x,0); close(wall.y,-2); close(wall.z,4);
});
