import test from 'node:test';
import assert from 'node:assert/strict';
import { acceleratedMotion, dampedAcceleration, dampedMotion } from '../src/motion-time.js';

const close = (actual, expected, tolerance=1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};

function intervals(duration, frame){
  const steps = [];
  for (let remaining=duration; remaining > 1e-12;){
    const dt = Math.min(remaining, typeof frame === 'function' ? frame(steps.length) : frame);
    steps.push(dt); remaining -= dt;
  }
  return steps;
}

function integrate(step, velocity, steps){
  let distance = 0;
  for (const dt of steps){
    const result = step(velocity,dt); velocity = result.velocity; distance += result.distance;
  }
  return { velocity, distance };
}

const rates = [30,60,144,20,2];
const schedules = [
  ...rates.map(fps => [`${fps} FPS`,duration => intervals(duration,1/fps)]),
  ['mixed slow frames',duration => intervals(duration,i => [.004,.017,.09,.8,.007,.21][i%6])],
];

for (const [name,schedule] of schedules){
  test(`damped movement has the same speed and distance at ${name}`, () => {
    const duration = 2.3, expected = dampedMotion(-3,7,14,duration);
    const actual = integrate((v,dt) => dampedMotion(v,7,14,dt),-3,schedule(duration));
    close(actual.velocity,expected.velocity); close(actual.distance,expected.distance);
    // Deceleration is equally independent of how elapsed time is divided.
    const stop = integrate((v,dt) => dampedMotion(v,0,6,dt),actual.velocity,schedule(1.1));
    const expectedStop = dampedMotion(expected.velocity,0,6,1.1);
    close(stop.velocity,expectedStop.velocity); close(stop.distance,expectedStop.distance);
  });

  test(`gravity and terminal speed have the same trajectory at ${name}`, () => {
    const duration = 1.7;
    const expected = acceleratedMotion(9.6,-26,duration,-5);
    const actual = integrate((v,dt) => acceleratedMotion(v,-26,dt,-5),9.6,schedule(duration));
    close(actual.velocity,expected.velocity); close(actual.distance,expected.distance);
  });

  test(`gravity with drag has the same trajectory at ${name}`, () => {
    const duration = 2.3, expected = dampedAcceleration(12,-26,2.5,duration);
    const actual = integrate((v,dt) => dampedAcceleration(v,-26,2.5,dt),12,schedule(duration));
    close(actual.velocity,expected.velocity); close(actual.distance,expected.distance);
  });
}

test('constant gravity integrates the analytical jump arc', () => {
  const result = acceleratedMotion(9.6,-26,.2);
  close(result.velocity,4.4); close(result.distance,1.4);
});

test('terminal velocity only applies after crossing it inside the time step', () => {
  const falling = acceleratedMotion(2,-10,1,-3);
  close(falling.velocity,-3); close(falling.distance,-1.75);
  const rising = acceleratedMotion(-2,10,1,-Infinity,3);
  close(rising.velocity,3); close(rising.distance,1.75);
});

test('velocity already beyond a newly selected terminal limit is clamped immediately', () => {
  assert.deepEqual(acceleratedMotion(-8,-10,.5,-3),{velocity:-3,distance:-1.5});
  assert.deepEqual(acceleratedMotion(8,10,.5,-Infinity,3),{velocity:3,distance:1.5});
});

test('zero elapsed time preserves velocity without moving', () => {
  assert.deepEqual(dampedMotion(3,8,12,0),{velocity:3,distance:0});
  assert.deepEqual(acceleratedMotion(3,-26,0),{velocity:3,distance:0});
  assert.deepEqual(dampedAcceleration(3,-26,2.5,0),{velocity:3,distance:0});
});

test('zero damping preserves velocity and zero drag retains constant acceleration', () => {
  assert.deepEqual(dampedMotion(3,8,0,.5),{velocity:3,distance:1.5});
  assert.deepEqual(dampedAcceleration(3,-4,0,.5),{velocity:1,distance:1});
});
