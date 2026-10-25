import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceTime, advanceDampedSpring, advanceTimeline, exponentialMotion, timelineTimeAt, timelineValueAt } from '../src/animation-time.js';

const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
function steps(duration,rate,update){
  let elapsed = 0;
  while (elapsed < duration){ const dt = Math.min(1/rate,duration-elapsed); update(dt); elapsed += dt; }
}

test('spring position and velocity agree across render rates and a stalled frame', () => {
  for (const [stiffness,damping] of [[85,13],[100,14],[25,10],[25,15]]){
    const target = .12, expected = advanceDampedSpring(-.2,.8,target,stiffness,damping,1.3);
    for (const rate of [15,30,60,144,240]){
      let position = -.2, velocity = .8;
      steps(1.3,rate,dt => ({position,velocity}=advanceDampedSpring(position,velocity,target,stiffness,damping,dt)));
      close(position,expected.position); close(velocity,expected.velocity);
    }
  }
});

test('exponential velocity and its distance integral compose across render rates', () => {
  for (const rate of [0,.2,5,18]){
    const expected = exponentialMotion(1.7,rate);
    for (const fps of [15,30,60,144,240]){
      let velocity = 12, distance = 0;
      steps(1.7,fps,dt => { const motion = exponentialMotion(dt,rate); distance += velocity*motion.integral; velocity *= motion.decay; });
      close(velocity,12*expected.decay); close(distance,12*expected.integral);
    }
  }
});

test('piecewise poses preserve stage timing while unfolding, reversing and crossing several stages', () => {
  const keys = [0,.3,.51,.7,1], durations = [.4,.35,.05,.23];
  for (const value of [0,.2,.3,.4,.51,.6,.7,.9,1]) close(timelineValueAt(timelineTimeAt(value,keys,durations),keys,durations),value);
  for (const fps of [15,30,60,144,240]){
    let value = 0;
    steps(.81,fps,dt => { value = advanceTimeline(value,1,dt,keys,durations); });
    close(value,timelineValueAt(.81,keys,durations));
    steps(.62,fps,dt => { value = advanceTimeline(value,0,dt,keys,durations); });
    close(value,timelineValueAt(.19,keys,durations));
  }
  assert.equal(advanceTimeline(.25,1,10,keys,durations),1);
  assert.equal(advanceTimeline(.8,0,10,keys,durations),0);
});

test('simulation keeps all elapsed time through stalls and sub-millisecond updates', () => {
  for (const duration of [.00001,.001,.05,.051,.25,.75,2.73]){
    let elapsed = 0;
    advanceTime(duration,dt => { assert.ok(dt > 0 && dt <= .05); elapsed += dt; });
    close(elapsed,duration);
  }
  let elapsed = 0;
  for (let i=0;i<10000;i++) advanceTime(.00001,dt => { elapsed += dt; });
  close(elapsed,.1);
  for (const duration of [0,-1,NaN,Infinity]) advanceTime(duration,() => assert.fail('invalid elapsed time advanced simulation'));
});
