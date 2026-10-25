import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Scene, Vector3 } from 'three';

// These tests inspect scene state; no browser or GPU is needed to draw the texture canvases.
const noop = () => {};
const context = new Proxy({
  createLinearGradient:() => ({ addColorStop:noop }),
  createRadialGradient:() => ({ addColorStop:noop }),
  measureText:() => ({ width:100 }),
}, { get:(target,key) => key in target ? target[key] : noop });
globalThis.document = { createElement:type => type === 'canvas' ? { getContext:() => context } : {
  style:{}, classList:{ toggle:noop }, offsetWidth:80, offsetHeight:20,
} };
globalThis.devicePixelRatio = 1; globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
const [{ createPaperBird }, { createOracle }, { buildHero, animateHero }, { createConstellation }] = await Promise.all([
  import('../src/paperbird.js'), import('../src/oracle.js'), import('../src/hero.js'), import('../src/constellation.js'),
]);
const camera = new PerspectiveCamera(55,16/9,.1,1000); camera.position.set(3,3,6); camera.updateMatrixWorld();
const close = (actual,expected,tolerance=1e-9) => assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function advance(duration,fps,update,start=0){
  let elapsed = 0;
  while (elapsed < duration){ const dt = Math.min(1/fps,duration-elapsed); elapsed += dt; update(dt,start+elapsed); }
}

test('paper unfolding, writing and refolding keep the same pose across stage crossings', () => {
  const pose = fps => {
    const bird = createPaperBird(new Scene(),{ perch:new Vector3(), star:() => new Vector3(0,100,0), reduceMotion:false });
    bird.setWriting(true,new Vector3(3,3,3));
    advance(1.7,fps,(dt,T) => bird.update(dt,T,camera));
    const writing = bird.position.clone();
    bird.setWriting(false);
    advance(1,fps,(dt,T) => bird.update(dt,T,camera),1.7);
    return { writing, position:bird.position.clone(), k:bird.k };
  };
  const expected = pose(1/10); // One update crosses the whole fold timeline and part of the next stage.
  for (const fps of [15,30,60,144,240]){
    const actual = pose(fps); close(actual.k,expected.k);
    assert.ok(actual.writing.distanceTo(expected.writing)<1e-9);
    assert.ok(actual.position.distanceTo(expected.position)<1e-9);
  }
});

test('a returning paper crane uses the time left after its delivery animation', () => {
  const pose = fps => {
    const bird = createPaperBird(new Scene(),{ perch:new Vector3(), star:() => new Vector3(0,100,0), reduceMotion:false });
    bird.setNear(true); bird.send();
    advance(5.2,fps,(dt,T) => bird.update(dt,T,camera));
    return bird;
  };
  const expected = pose(1/10); assert.equal(expected.busy,false); close(expected.k,.2775);
  for (const fps of [15,30,60,144,240]){
    const actual = pose(fps); close(actual.k,expected.k); assert.ok(actual.position.distanceTo(expected.position)<1e-9);
  }
});

test('Oracle light trails keep their elapsed-time shape at different frame rates', () => {
  const pose = fps => {
    const scene = new Scene(), oracle = createOracle(scene,{ y:18,main:[],reduceMotion:false });
    oracle.sendLight(new Vector3(30,2,5),'#CFF6FF',noop);
    advance(1,fps,(dt,T) => oracle.update(dt,T,{ power:0,speak:0 }));
    return scene.children.filter(s => s.isSprite).map(s => s.position.clone());
  };
  const expected = pose(1/10); assert.equal(expected.length,23);
  for (const fps of [15,30,60,144,240]){
    const actual = pose(fps);
    actual.forEach((position,i) => assert.ok(position.distanceTo(expected[i])<1e-9,`tail ${i} at ${fps} Hz`));
  }
});

test('cloth springs retain the same motion through slow and fast render updates', () => {
  const motion = fps => {
    const hero = buildHero(new Scene()); hero.motion.ready = true;
    // Geometry deformation does not affect the spring state under test.
    hero.clothPanels = [];
    advance(.7,fps,(dt,T) => {
      hero.root.position.set(T*3,0,T); hero.root.rotation.y = T*.4;
      animateHero(hero,{ dt,T,moving:1,airborne:false,flight:false,flying:false,reduceMotion:false,aiming:false,pitch:0,draw:0,onGround:false });
    });
    return hero.motion;
  };
  const expected = motion(1/10);
  for (const fps of [15,30,60,144,240]){
    const actual = motion(fps); close(actual.turn,expected.turn); close(actual.turnVelocity,expected.turnVelocity); close(actual.speed,expected.speed);
    assert.ok(actual.offset.distanceTo(expected.offset)<1e-9); assert.ok(actual.velocity.distanceTo(expected.velocity)<1e-9);
  }
});

test('constellation wake times and highlights advance even at very high frame rates', () => {
  const pose = fps => {
    const scene = new Scene(), relic = { id:'project',color:'#FFFFFF',lightGiven:true };
    const skills = ['a','b'].map(id => ({ id,name:id,group:'apps',relics:['project'] }));
    const constellation = createConstellation(scene,{ skills,relics:[relic],labelsEl:{ appendChild:noop },reduceMotion:false });
    constellation.lightRelic('project');
    advance(3,fps,(dt,T) => constellation.update(dt,T,camera,{showAll:true,hover:null,focus:relic}));
    let highlight;
    scene.traverse(o => { if (o.geometry?.attributes.aProg) highlight = o.geometry.attributes.aHi.getX(0); });
    return { stars:constellation.stars,highlight };
  };
  for (const fps of [15,30,60,144,240,2000]){
    const actual = pose(fps);
    actual.stars.forEach(star => close(star.lit,1-Math.exp(-3*(3-star.at))));
    close(actual.highlight,1-Math.exp(-2.5*3),.0021);
  }
});
