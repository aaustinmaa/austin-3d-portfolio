import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowTex } from './textures.js';

// All four braziers share geometry. Decoration never consumes the valley's random sequence.
const TAU = Math.PI*2;
const metal = new THREE.MeshStandardMaterial({ color:0x454459, roughness:.68, metalness:.38, emissive:0x1B1A30, emissiveIntensity:.45 });
const trim = new THREE.MeshStandardMaterial({ color:0x79718B, roughness:.5, metalness:.5, emissive:0x252138, emissiveIntensity:.3 });
const footGeo = new THREE.CylinderGeometry(.23,.34,.1,12).translate(0,.05,0);
const stemGeo = new THREE.CylinderGeometry(.13,.21,.73,12).translate(0,.455,0);
const collarGeo = new THREE.TorusGeometry(.18,.035,6,24).rotateX(Math.PI/2).translate(0,.79,0);
const bowlGeo = new THREE.LatheGeometry([
  [0,.82],[.19,.82],[.28,.87],[.4,.98],[.51,1.12],[.55,1.19],
  [.54,1.23],[.49,1.23],[.46,1.14],[.36,1.03],[.22,.97],[0,.97],
].map(([r,y]) => new THREE.Vector2(r,y)),32);
const rimGeo = new THREE.TorusGeometry(.518,.027,8,40).rotateX(Math.PI/2).translate(0,1.215,0);
const bodyGeo = BufferGeometryUtils.mergeBufferGeometries([footGeo,stemGeo,bowlGeo]);
const trimGeo = BufferGeometryUtils.mergeBufferGeometries([collarGeo,rimGeo]);
const coalGeo = new THREE.DodecahedronGeometry(1,0);

// Rounded tongues taper separately and lean in different directions. Their bases stay in the coals
// while the upper vertices curl with the heat. Merge them into one draw call per fire.
function flameGeometry(){
  const positions = [], heights = [], phases = [], indices = [];
  const rows = 18, sides = 12;
  const tongues = [[0,0,.96,.24,0],[.20,.04,.65,.15,1.7],[-.16,.12,.72,.14,3.4],[.02,-.19,.8,.15,5.1],[-.16,-.13,.54,.12,6.8]];
  tongues.forEach(([x,z,h,r,phase]) => {
    const start = positions.length/3;
    for (let i=0;i<=rows;i++){
      const v = i/rows, radius = r*Math.pow(1-v,.75)*(.75 + Math.sin(v*Math.PI)*.45), curl = v*v*.16;
      for (let j=0;j<=sides;j++){
        const a = j/sides*TAU, ripple = 1 + .09*Math.sin(a*3 + v*7 + phase);
        positions.push(x + Math.cos(a)*radius*ripple + Math.sin(phase + v*3)*curl, 1.08 + v*h, z + Math.sin(a)*radius*ripple + Math.cos(phase + v*4)*curl);
        heights.push(v); phases.push(phase);
        if (i<rows && j<sides){ const k = start + i*(sides+1) + j; indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2); }
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('height',new THREE.Float32BufferAttribute(heights,1));
  g.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
  g.setIndex(indices); g.computeBoundingSphere(); g.boundingSphere.radius += .25;
  return g;
}
const flameGeo = flameGeometry();
const flameVertex = `
  attribute float height; attribute float phase;
  uniform float time; uniform float seed;
  varying float vHeight; varying vec3 vPos;
  void main(){
    vec3 p = position; float t = time + seed + phase, bend = height*height;
    p.x += (sin(t*3.7 - height*6.)*.07 + sin(t*6.1 + height*9.)*.025)*bend;
    p.z += (cos(t*3.1 - height*5.)*.065 + sin(t*5.3)*.025)*bend;
    p.y += sin(t*5. + height*4.)*.06*height;
    vHeight = height; vPos = p;
    gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.);
  }`;
const flameFragment = `
  uniform float time; uniform float seed; uniform float strength;
  varying float vHeight; varying vec3 vPos;
  float hash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
  float noise(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  void main(){
    float n = noise(vPos*vec3(11.,7.,11.) - vec3(0.,time*3.4 + seed,0.));
    float fine = noise(vPos*23. - vec3(0.,time*5.,0.));
    float heat = clamp(vHeight*.85 + n*.3,0.,1.);
    vec3 color = mix(vec3(.78,.96,1.),vec3(.26,.70,1.),smoothstep(.05,.5,heat));
    color = mix(color,vec3(.40,.28,.85),smoothstep(.55,1.,heat));
    float alpha = mix(.92,.5,vHeight)*smoothstep(.08,.38,n + (1.-vHeight)*.3);
    alpha *= 1. - smoothstep(.88,1.,vHeight);
    gl_FragColor = vec4(color*(.88 + fine*.12),alpha*strength);
  }`;

const emberGeo = new THREE.BufferGeometry(), emberPos = [], emberSeeds = [];
for (let i=0;i<12;i++){ emberPos.push(0,0,0); emberSeeds.push(i*.61803398875%1); }
emberGeo.setAttribute('position',new THREE.Float32BufferAttribute(emberPos,3));
emberGeo.setAttribute('seed',new THREE.Float32BufferAttribute(emberSeeds,1));
// Positions are generated on the GPU; culling must cover their full path.
emberGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,2,0),1.6);

export function createBrazier(scene, position, { seed=0, reduceMotion=false, pixelRatio=1 }={}){
  const root = new THREE.Group(); root.name = 'brazier'; root.position.copy(position); scene.add(root);
  const solid = (g,m) => { const o = new THREE.Mesh(g,m); o.castShadow = o.receiveShadow = true; root.add(o); return o; };
  const solids = [solid(bodyGeo,metal), solid(trimGeo,trim)];
  const coals = new THREE.MeshStandardMaterial({ color:0x25212C, roughness:1, flatShading:true, emissive:0x4868D6, emissiveIntensity:0 });
  const coalBed = new THREE.InstancedMesh(coalGeo,coals,11), c = new THREE.Object3D();
  for (let i=0;i<11;i++){
    const a = i*2.39996 + seed, r = i ? .09 + (i%3)*.085 : 0;
    c.scale.set(.115 + i%2*.035,.065,.10 + i%3*.014);
    c.position.set(Math.cos(a)*r,1.045 + i%2*.025,Math.sin(a)*r); c.rotation.set(i*.6,a,i*.37);
    c.updateMatrix(); coalBed.setMatrixAt(i,c.matrix);
  }
  coalBed.castShadow = coalBed.receiveShadow = true; root.add(coalBed);
  solids.push(coalBed);
  const uniforms = { time:{value:0}, seed:{value:seed}, strength:{value:0} };
  const flame = new THREE.Mesh(flameGeo,new THREE.ShaderMaterial({
    uniforms, vertexShader:flameVertex, fragmentShader:flameFragment, transparent:true, depthWrite:false,
  })); root.add(flame);
  // Keep the halo faint enough to leave the silhouette and the bowl readable up close.
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0x748CFF, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }));
  aura.position.y = 1.45; aura.scale.set(1.8,2.1,1); root.add(aura);
  const embers = new THREE.Points(emberGeo,new THREE.ShaderMaterial({
    uniforms:{ time:uniforms.time, strength:uniforms.strength, offset:{value:seed}, px:{value:pixelRatio} },
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`attribute float seed; uniform float time; uniform float offset; uniform float px; varying float vAlpha;
      void main(){
        float age = fract(time*(.22 + seed*.12) + seed + offset*.1), a = seed*62.83 + offset, r = .1 + age*age*.35;
        vec3 p = vec3(cos(a + age*2.)*r,1.14 + age*(1.2 + seed*.7),sin(a + age*1.7)*r);
        vAlpha = smoothstep(0.,.12,age)*(1.-smoothstep(.35,1.,age));
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_PointSize = clamp((11. + seed*8.)*px/max(1.,-mv.z),1.,4.*px);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader:`uniform float strength; varying float vAlpha;
      void main(){ float d = length(gl_PointCoord-.5), a = (1.-smoothstep(.12,.5,d))*vAlpha*strength;
        gl_FragColor = vec4(.58,.82,1.,a); }`,
  })); root.add(embers);
  const light = new THREE.PointLight(0x93B7FF,0,7,2); light.position.y = 1.5; root.add(light);
  const b = { root, solids, pos:root.position.clone(), top:position.y, lit:false, ignition:0, flame, embers, light,
    update(dt,time){
      b.ignition = b.lit ? Math.min(1,b.ignition + dt*2.4) : 0;
      const strength = reduceMotion ? (b.lit ? 1 : 0) : THREE.MathUtils.smoothstep(b.ignition,0,1);
      const t = reduceMotion ? 0 : time;
      uniforms.time.value = t; uniforms.strength.value = strength;
      flame.visible = aura.visible = strength>0; embers.visible = b.lit && !reduceMotion;
      const flicker = reduceMotion ? 1 : 1 + Math.sin(t*7.3 + seed)*.055 + Math.sin(t*13.1 + seed*2)*.035;
      aura.material.opacity = strength*.18*flicker;
      coals.emissiveIntensity = strength*.95*flicker;
      light.intensity = strength*1.15*flicker;
    },
  };
  b.update(0,0); return b;
}
