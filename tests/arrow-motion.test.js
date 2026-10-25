import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { arrowWaterEntry, sampleArrowMotion } from '../src/arrow-motion.js';

const v = (x,y,z) => new Vector3(x,y,z);
const close = (actual,expected,tolerance=1e-9) => {
  assert.ok(Math.abs(actual-expected) <= tolerance,`${actual} differs from ${expected}`);
};
const closeVector = (actual,expected,tolerance=1e-9) => {
  close(actual.x,expected.x,tolerance); close(actual.y,expected.y,tolerance); close(actual.z,expected.z,tolerance);
};

test('dry motion samples a continuous ballistic path and points the tip along velocity', () => {
  const start = v(1,3,2), velocity = v(10,4,-2), result = sampleArrowMotion(start,velocity,.5);
  closeVector(result.position,v(6,4.25,1)); closeVector(result.velocity,v(10,1,-2));
  close(result.tip.distanceTo(result.position),.5);
  closeVector(result.tip.clone().sub(result.position).normalize(),result.velocity.clone().normalize());
  assert.deepEqual(start,v(1,3,2)); assert.deepEqual(velocity,v(10,4,-2));
});

test('the exact descending tip crossing supplies the position and velocity at entry', () => {
  const position = v(1,3,2), velocity = v(10,4,-2), waterY = -.55;
  const entry = arrowWaterEntry(position,velocity,3,waterY);
  assert.ok(entry && entry.time > 0 && entry.time < 3);
  close(entry.tip.y,waterY);
  closeVector(entry.position,sampleArrowMotion(position,velocity,entry.time).position);
  closeVector(entry.velocity,v(10,4-6*entry.time,-2));
  assert.ok(sampleArrowMotion(position,velocity,entry.time-1e-6).tip.y > waterY);
  assert.ok(sampleArrowMotion(position,velocity,entry.time+1e-6).tip.y < waterY);
});

test('no entry is reported while the complete motion stays above the surface', () => {
  assert.equal(arrowWaterEntry(v(0,5,0),v(12,3,0),.5,0),null);
  assert.equal(arrowWaterEntry(v(0,5,0),v(12,3,0),0,0),null);
});

test('a vertical falling arrow enters at the analytical tip crossing time', () => {
  const time = (-2+Math.sqrt(22))/6;
  const entry = arrowWaterEntry(v(0,2,0),v(0,-2,0),1,0);
  close(entry.time,time); close(entry.position.y,.5); close(entry.tip.y,0);
  close(entry.velocity.y,-2-6*time);
});

test('an arrow already at or below the surface enters at time zero', () => {
  for (const height of [0,-1]){
    const position = v(0,height,0), velocity = v(12,0,0);
    const entry = arrowWaterEntry(position,velocity,.5,0);
    close(entry.time,0); closeVector(entry.position,position); closeVector(entry.velocity,velocity);
  }
});

function wetFlight(frame){
  let position = v(1,3,2), velocity = v(30,4,-2), elapsed = 0, wet = false, entry;
  const duration = 3, waterY = -.55;
  while (duration-elapsed > 1e-12){
    const dt = Math.min(frame,duration-elapsed);
    let sample;
    if (!wet){
      const crossing = arrowWaterEntry(position,velocity,dt,waterY);
      if (crossing){
        entry = { time:elapsed+crossing.time, position:crossing.position.clone(), velocity:crossing.velocity.clone(), tip:crossing.tip.clone() };
        sample = sampleArrowMotion(crossing.position,crossing.velocity.clone().multiplyScalar(.4),dt-crossing.time,2.5);
        wet = true;
      } else sample = sampleArrowMotion(position,velocity,dt);
    } else sample = sampleArrowMotion(position,velocity,dt,2.5);
    position = sample.position; velocity = sample.velocity; elapsed += dt;
  }
  return { position,velocity,entry };
}

const expected = wetFlight(3);
for (const [name,frame] of [['30 FPS',1/30],['60 FPS',1/60],['144 FPS',1/144],['50 ms steps',.05]]){
  test(`water entry and underwater remainder are independent of ${name}`, () => {
    const actual = wetFlight(frame);
    assert.ok(actual.entry && expected.entry);
    close(actual.entry.time,expected.entry.time);
    closeVector(actual.entry.position,expected.entry.position);
    closeVector(actual.entry.velocity,expected.entry.velocity);
    closeVector(actual.entry.tip,expected.entry.tip);
    closeVector(actual.position,expected.position);
    closeVector(actual.velocity,expected.velocity);
  });
}
