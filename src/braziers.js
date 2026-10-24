import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowTex } from './textures.js';

// All four braziers share geometry. Decoration never consumes the valley's random sequence.
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
const poolGeo = new THREE.CircleGeometry(.43,32).rotateX(-Math.PI/2).translate(0,1.06,0);
const plumeGeo = new THREE.BoxGeometry(1.3,1.55,1.3).translate(0,1.855,0);

// Integrate light through a volume, so the fire has soft depth from every angle. Three uneven
// tongues share a bright base; noise travels upward through them and thins into luminous wisps.
const plumeVertex = `varying vec3 vWorld;
  void main(){ vec4 p = modelMatrix*vec4(position,1.); vWorld = p.xyz;
    gl_Position = projectionMatrix*viewMatrix*p; }`;
const plumeFragment = `
  uniform vec3 origin; uniform float time; uniform float seed; uniform float strength;
  varying vec3 vWorld;
  float hash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
  float noise(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float tongue(vec3 p, vec2 offset, float h, float width, float phase, float n){
    float y = p.y/h;
    if(y<0. || y>1.) return 0.;
    vec2 curl = vec2(sin(y*7. - time*2.5 + phase),cos(y*5. - time*2.1 + phase))*y*y*.13;
    float radius = width*pow(1.-y,.72)*(.75 + n*.6);
    float edge = radius - length(p.xz - offset*(1.-y*.35) - curl);
    return smoothstep(-.065,.055,edge)*smoothstep(0.,.08,p.y)*(1.-smoothstep(.78,1.,y));
  }
  float density(vec3 p){
    float t = time + seed;
    float n = noise(p*vec3(7.,5.,7.) - vec3(0.,t*2.8,0.));
    float fine = noise(p*13. - vec3(0.,t*4.2,0.));
    float d = tongue(p,vec2(0),1.22 + sin(t*2.1)*.12,.25,seed,n);
    d = max(d,tongue(p,vec2(-.19,.09),.91 + sin(t*2.7 + 2.)*.12,.17,seed+2.,n));
    d = max(d,tongue(p,vec2(.18,-.08),1.02 + sin(t*2.3 + 4.)*.13,.16,seed+4.,n));
    float lift = mix(1.,smoothstep(.17,.7,n*.75 + fine*.25),smoothstep(.2,1.2,p.y));
    return d*lift*(.65 + fine*.6);
  }
  void main(){
    vec3 ro = cameraPosition - origin, rd = normalize(vWorld - cameraPosition);
    vec3 inv = 1./rd, lo = (-vec3(.65,.775,.65)-ro)*inv, hi = (vec3(.65,.775,.65)-ro)*inv;
    vec3 nearBox = min(lo,hi), farBox = max(lo,hi);
    float enter = max(0.,max(max(nearBox.x,nearBox.y),nearBox.z));
    float leave = min(min(farBox.x,farBox.y),farBox.z);
    if(leave<=enter) discard;
    float stepSize = (leave-enter)/40.; vec4 sum = vec4(0.);
    for(int i=0;i<40;i++){
      vec3 p = ro + rd*(enter + (float(i)+.5)*stepSize) + vec3(0.,.775,0.);
      float d = density(p), alpha = 1.-exp(-d*stepSize*6.);
      vec3 color = mix(vec3(1.,.86,.64),vec3(1.,.96,.83),smoothstep(.12,.85,d));
      sum.rgb += (1.-sum.a)*color*alpha; sum.a += (1.-sum.a)*alpha;
    }
    gl_FragColor = vec4(sum.rgb*.88,strength);
  }`;

export function createBrazier(scene, position, { seed=0, reduceMotion=false }={}){
  const root = new THREE.Group(); root.name = 'brazier'; root.position.copy(position); scene.add(root);
  const solid = (g,m) => { const o = new THREE.Mesh(g,m); o.castShadow = o.receiveShadow = true; root.add(o); };
  solid(bodyGeo,metal); solid(trimGeo,trim);

  const uniforms = { origin:{value:position.clone().add(new THREE.Vector3(0,1.855,0))}, time:{value:0}, seed:{value:seed}, strength:{value:0} };
  const plume = new THREE.Mesh(plumeGeo,new THREE.ShaderMaterial({
    uniforms, vertexShader:plumeVertex, fragmentShader:plumeFragment, transparent:true,
    side:THREE.BackSide, depthWrite:false, blending:THREE.AdditiveBlending,
  })); root.add(plume);
  // Match the path and carried lanterns' cream / honey glow, concentrated around the rising fire.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFB86B, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }));
  halo.position.y = 1.58; halo.scale.set(1.65,1.95,1); root.add(halo);
  const pool = new THREE.Mesh(poolGeo,new THREE.MeshBasicMaterial({ map:glowTex, color:0xFFD6A0, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }));
  root.add(pool);
  const light = new THREE.PointLight(0xFFB070,0,6,2); light.position.y = 1.5; root.add(light);
  const b = { root, pos:root.position.clone(), top:position.y, lit:false, ignition:0, light, plume,
    update(dt,time){
      b.ignition = b.lit ? Math.min(1,b.ignition + dt*2.4) : 0;
      const strength = reduceMotion ? (b.lit ? 1 : 0) : THREE.MathUtils.smoothstep(b.ignition,0,1);
      const breath = reduceMotion ? 0 : Math.sin(time*3.1 + seed);
      const brightness = strength*(1 + breath*.035);
      uniforms.time.value = reduceMotion ? 0 : time; uniforms.strength.value = strength;
      plume.visible = halo.visible = strength>0; halo.material.opacity = brightness*.14;
      pool.visible = strength>0; pool.material.opacity = brightness*.16;
      light.intensity = brightness*.85;
    },
  };
  b.update(0,0); return b;
}
