import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, Vector3 } from 'three';
import { CollisionWorld } from '../src/colliders.js';
import { CameraBoom } from '../src/camera-rig.js';

const v = (x,y,z) => new Vector3(x,y,z);
function setup(box, position){
  const world = new CollisionWorld();
  const object = new Mesh(new BoxGeometry(...box)); object.position.copy(position);
  world.addMesh(object); world.build();
  return { world, object, boom:new CameraBoom((from,to) => world.segmentHit(from,to)) };
}

test('an unobstructed follow camera preserves the chosen distance and framing', () => {
  const { boom } = setup([1,1,1],v(20,0,0)), anchor = v(0,1.55,0), desired = v(0,2,9);
  assert.ok(boom.resolve(anchor,desired).position.distanceTo(desired) < 1e-6);
  assert.equal(boom.lift,0);
});

test('near-plane edge probes catch a grazing wall missed by the centre ray', () => {
  const { world, boom } = setup([.2,4,2],v(.25,1,5)), anchor = v(0,1,0), desired = v(0,1,9);
  assert.equal(world.segmentHit(anchor,desired),null);
  const result = boom.constrain(anchor,desired);
  assert.ok(result.distance < 4 && result.distance > 3.7);
});

test('a low ledge raises the camera to preserve distance instead of forcing a head close-up', () => {
  const { boom } = setup([8,1.3,.2],v(0,.65,2.7)), anchor = v(0,1.55,0), desired = v(0,.5,9);
  assert.ok(boom.constrain(anchor,desired).distance < 3.2);
  const result = boom.resolve(anchor,desired);
  assert.ok(result.distance > 8);
  assert.ok(result.position.y > desired.y + .7);
});

test('a raised view stays stable near an edge and recovers when there is clear room', () => {
  const { world, object, boom } = setup([8,1.3,.2],v(0,.65,2.7)), anchor = v(0,1.55,0), desired = v(0,.5,9);
  boom.resolve(anchor,desired); const lift = boom.lift; assert.ok(lift > 0);
  object.position.z = 3.8; world.build(); boom.resolve(anchor,desired);
  assert.equal(boom.lift,lift);
  object.position.z = 20; world.build();
  const result = boom.resolve(anchor,desired);
  assert.equal(boom.lift,0); assert.ok(result.position.distanceTo(desired) < 1e-6);
});

test('confined space still respects solid geometry, including after follow smoothing', () => {
  const { world, boom } = setup([10,10,.1],v(0,2,.8)), anchor = v(0,1.55,0), desired = v(0,2,9);
  const result = boom.resolve(anchor,desired);
  assert.ok(result.distance < .75);
  assert.equal(world.segmentHit(anchor,result.position),null);
  assert.ok(boom.constrain(anchor,desired.clone().lerp(result.position,.1)).distance < .75);
});

test('vertical camera probes remain finite when looking directly overhead', () => {
  const { boom } = setup([8,.2,8],v(0,4,0));
  const result = boom.constrain(v(0,1,0),v(0,10,0));
  assert.ok(result.position.toArray().every(Number.isFinite));
  assert.ok(result.position.y < 3.9);
});
