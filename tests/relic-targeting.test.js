import test from 'node:test';
import assert from 'node:assert/strict';
import { Ray, Vector3 } from 'three';
import { guidedRelic, relicArrowHit, relicAimPoint } from '../src/relic-targeting.js';

const v = (x,y,z) => new Vector3(x,y,z);
const relic = (pos, state='orbit', visible=true) => ({ pos, state, group:{ visible } });

test('manual arrows retain the original tolerance without touching model geometry, even in a fast frame', () => {
  const r = relic(v(0,0,0));
  assert.equal(relicArrowHit(v(1.8,0,-10), v(1.8,0,10), [r]).relic, r);
  assert.equal(relicArrowHit(v(1.91,0,-10), v(1.91,0,10), [r]), null);
  assert.equal(relicArrowHit(v(0,0,0), v(0,0,0), [r]).distance, 0);
});

test('manual hits select the first eligible relic along the arrow path', () => {
  const near = relic(v(0,0,4)), far = relic(v(0,0,9));
  const ignored = [relic(v(0,0,1),'hidden'), relic(v(0,0,2),'open'), relic(v(0,0,3),'orbit',false)];
  assert.equal(relicArrowHit(v(0,0,0), v(0,0,12), [far,...ignored,near]).relic, near);
});

test('guided arrows use their original arrival radius and can catch a returning relic', () => {
  const target = relic(v(0,0,0),'rising'), other = relic(v(0,0,-3));
  assert.equal(relicArrowHit(v(1.1,0,-6),v(1.1,0,6),[other],target).relic, target);
  assert.equal(relicArrowHit(v(1.21,0,-6),v(1.21,0,6),[other],target), null);
  target.state = 'open'; assert.equal(guidedRelic(target),false);
});

test('aim assistance converges at relic depth within tolerance, respecting nearer scenery', () => {
  const ray = new Ray(v(0,0,0),v(0,0,1)), near = relic(v(1.8,0,10)), far = relic(v(0,0,20));
  assert.deepEqual(relicAimPoint(ray,[far,near]).point.toArray(), [0,0,10]);
  assert.equal(relicAimPoint(ray,[near,far],8),null);
  assert.equal(relicAimPoint(ray,[relic(v(1.91,0,10)),relic(v(0,0,-5))]),null);
});
