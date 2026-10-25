import * as THREE from 'three';
import { glowTex } from './textures.js';

// All four braziers share geometry. Decoration never consumes the valley's random sequence.
// Plain faceted stone like the wish pillars: an eight-sided stem flaring into a shallow eight-sided bowl.
const stone = new THREE.MeshStandardMaterial({ color:0x3A4054, roughness:.95, flatShading:true });
// The inside is sooty, so the fire light warms it without lighting up a bright band.
const soot = new THREE.MeshStandardMaterial({ color:0x1C1922, roughness:1, flatShading:true });
const lathe = points => new THREE.LatheGeometry(points.map(([r,y]) => new THREE.Vector2(r,y)),8);
const bodyGeo = lathe([[0,0],[.3,0],[.2,.78],[.42,.86],[.55,1.23],[.49,1.23]]);
const sootGeo = lathe([[.49,1.23],[.36,1],[0,1]]);
const coalGeo = new THREE.CircleGeometry(.38,8).rotateX(-Math.PI/2).translate(0,1.05,0);
const plumeBox = new THREE.Box3(new THREE.Vector3(-.56,1,-.56),new THREE.Vector3(.56,2.5,.56));
const plumeGeo = new THREE.BoxGeometry(...plumeBox.getSize(new THREE.Vector3()).toArray())
  .translate(...plumeBox.getCenter(new THREE.Vector3()).toArray());

const noiseGLSL = `
  float hash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
  float noise(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }`;

// Integrate light through a volume, so the fire has depth from every angle: a single flame rising
// from the coals, its edge rippled and its tip flickering as noise streams up through it.
// Temperature sets the colour, all in the valley's champagne gold: white-hot at the heart, gold through
// the body and soft amber gold at the edges, never orange or red.
const plumeVertex = `varying vec3 vWorld;
  void main(){ vec4 p = modelMatrix*vec4(position,1.); vWorld = p.xyz;
    gl_Position = projectionMatrix*viewMatrix*p; }`;
const plumeFragment = `
  uniform vec3 base; uniform float time; uniform float seed; uniform float strength;
  varying vec3 vWorld;
  const float FLOOR = 1.05, RIM = 1.23;
  const vec3 LO = vec3(${plumeBox.min.toArray()}), HI = vec3(${plumeBox.max.toArray()});
  ${noiseGLSL}
  vec3 ramp(float k){
    vec3 c = mix(vec3(.82,.5,.16),vec3(1.,.74,.3),smoothstep(0.,.35,k));
    c = mix(c,vec3(1.,.88,.55),smoothstep(.3,.65,k));
    return mix(c,vec3(1.,.98,.93),smoothstep(.62,.95,k));
  }
  // One flame, 1 on its axis and 0 at its edge. It narrows to a single tip, sways more toward the top,
  // and noise rising through it ripples the edge and breaks the tip into flickering licks.
  vec4 flame(vec3 p, float t, float grow){
    vec3 q = p - vec3(0.,FLOOR,0.);
    if(q.y<=0. || (p.y<RIM && length(p.xz)>.35 + q.y*.55)) return vec4(0.);
    float H = (1.2 + sin(t*2.3)*.08 + sin(t*3.9 + 1.)*.05)*grow, h = q.y/H;
    if(h>=1.) return vec4(0.);
    vec3 s = vec3(q.x*4.,q.y*3. - t*2.8,q.z*4.);
    float n = noise(s)*.6 + noise(s*2.2 + vec3(3.1,-t*1.6,7.7))*.4;
    vec2 sway = vec2(sin(t*1.9 + seed + q.y*2.6),cos(t*1.5 + seed + q.y*2.1))*.06*h*h;
    float f = 1. - length(q.xz - sway)/(.3*pow(1.-h,.65)) - (n-.45)*(.3 + .7*h);
    f *= 1. - smoothstep(.7,1.,h + n*.2);
    if(f<=0.) return vec4(0.);
    // The coals feed it a deeper glow; it burns hottest a little above them.
    float feed = smoothstep(0.,.2,q.y), heat = clamp(f*1.8*(1.-h*.5)*(.6 + .4*feed),0.,1.);
    // A dense body with a white-hot heart brighter than the screen can show, so it glares like a real flame.
    return vec4(ramp(heat) + vec3(1.,.96,.88)*smoothstep(.6,1.,heat)*1.6,smoothstep(0.,.07,f)*(.6 + .6*feed)*(1.25 - h*.6)*(.85 + .3*n));
  }
  void main(){
    vec3 ro = cameraPosition - base, rd = normalize(vWorld - cameraPosition);
    vec3 inv = 1./rd, t0 = (LO-ro)*inv, t1 = (HI-ro)*inv, tn = min(t0,t1), tf = max(t0,t1);
    float enter = max(0.,max(max(tn.x,tn.y),tn.z)), leave = min(min(tf.x,tf.y),tf.z);
    vec2 oc = ro.xz, dc = rd.xz; float A = dot(dc,dc), B = dot(oc,dc), C = dot(oc,oc) - .3136;
    if(A>1e-6){ float d = B*B - A*C; if(d<=0.) discard; d = sqrt(d); enter = max(enter,(-B-d)/A); leave = min(leave,(-B+d)/A); }
    // The bowl hides everything below its rim except what is seen down through its opening.
    float tr = (RIM - ro.y)/(abs(rd.y)>1e-5 ? rd.y : 1e-5), rc = length(ro.xz + rd.xz*tr);
    if(ro.y>RIM){ if(rd.y<0. && rc>.45) leave = min(leave,tr); }
    else { if(rd.y<=0. || rc<.56) discard; enter = max(enter,tr); }
    if(leave<=enter) discard;
    float t = time + seed*13., grow = .3 + .7*strength;
    float stepSize = (leave-enter)/32., jitter = fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
    vec3 sum = vec3(0.); float trans = 1.;
    for(int i=0;i<32;i++){
      vec4 e = flame(ro + rd*(enter + (float(i)+jitter)*stepSize),t,grow);
      sum += trans*e.rgb*e.a*stepSize*4.; trans *= exp(-e.a*stepSize*5.);
    }
    gl_FragColor = vec4(sum*strength,1.);
  }`;

// Embers in the bowl: broken lumps, some hot through and some glowing only along their cracks, pulsing unevenly.
const coalVertex = `varying vec2 vXZ;
  #include <fog_pars_vertex>
  void main(){ vXZ = position.xz; vec4 mvPosition = modelViewMatrix*vec4(position,1.);
    gl_Position = projectionMatrix*mvPosition;
    #include <fog_vertex>
  }`;
const coalFragment = `
  uniform float time; uniform float seed; uniform float strength;
  varying vec2 vXZ;
  #include <fog_pars_fragment>
  vec2 hash2(vec2 p){ return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453); }
  void main(){
    vec2 p = vXZ*19. + seed*3.7;
    p += .3*sin(p.yx*.9 + seed);
    vec2 i = floor(p), f = fract(p);
    float d1 = 8., d2 = 8., id = 0.;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
      vec2 g = vec2(x,y), r = g + hash2(i+g)*.85 - f; float d = dot(r,r);
      if(d<d1){ d2 = d1; d1 = d; id = hash2(i+g+.37).x; } else if(d<d2) d2 = d;
    }
    d1 = sqrt(d1); d2 = sqrt(d2);
    float lump = 1. - d1, crack = 1. - smoothstep(0.,.12,d2-d1);
    float heat = 1. - smoothstep(0.,.95,length(vXZ)/.38);
    float pulse = .6 + .4*sin(time*(.6 + id*1.3) + id*6.283);
    float glow = (smoothstep(.45,1.,id)*(.2 + .8*lump*lump)*pulse + crack*.45*id)*heat*heat*strength;
    gl_FragColor = vec4(vec3(.045,.038,.05)*(.4 + lump*.9) + vec3(1.,.6,.24)*glow*1.2 + vec3(1.,.88,.6)*glow*glow*glow*.8,1.);
    #include <fog_fragment>
  }`;

// A few sparks now and then, lifting off the flame and winking out above it.
const sparkGeo = new THREE.BufferGeometry(), sparkSeeds = [];
for (let i=0;i<10;i++) sparkSeeds.push(i*.61803398875%1);
sparkGeo.setAttribute('position',new THREE.Float32BufferAttribute(new Array(30).fill(0),3));
sparkGeo.setAttribute('seed',new THREE.Float32BufferAttribute(sparkSeeds,1));
// Positions are generated on the GPU; culling must cover their full path.
sparkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,2.1,0),1.4);
const sparkVertex = `attribute float seed; uniform float time; uniform float offset; uniform float px; uniform float strength;
  varying float vAlpha;
  float h1(float n){ return fract(sin(n)*43758.5453); }
  void main(){
    float cycle = time*(.42 + seed*.3) + seed*7.3 + offset, age = fract(cycle), n = floor(cycle);
    float a = h1(n*4.1 + seed*9.)*6.283, r = .04 + h1(n*7.7 + seed)*.16;
    vec3 p = vec3(cos(a)*r,1.3 + age*(1. + seed*.7),sin(a)*r);
    p.xz += vec2(sin(age*5. + a),cos(age*4.3 + a))*.13*age;
    vAlpha = step(.5,h1(n*12.99 + seed*78.2))*strength*smoothstep(0.,.08,age)*(1.-smoothstep(.3,1.,age));
    vec4 mv = modelViewMatrix*vec4(p,1.);
    gl_PointSize = clamp((8. + seed*5.)*px/max(1.,-mv.z),1.,3.5*px);
    gl_Position = projectionMatrix*mv;
  }`;
const sparkFragment = `varying float vAlpha;
  void main(){ float d = length(gl_PointCoord-.5); gl_FragColor = vec4(vec3(1.,.86,.55)*(1.-smoothstep(.1,.5,d))*vAlpha,1.); }`;

export function createBrazier(scene, position, { seed=0, reduceMotion=false, pixelRatio=1 }={}){
  const root = new THREE.Group(); root.name = 'brazier'; root.position.copy(position); scene.add(root);
  const solid = (g,m) => { const o = new THREE.Mesh(g,m); o.castShadow = o.receiveShadow = true; root.add(o); return o; };
  const solids = [solid(bodyGeo,stone), solid(sootGeo,soot)];

  const uniforms = { base:{value:position.clone()}, time:{value:0}, seed:{value:seed}, strength:{value:0} };
  const coals = new THREE.Mesh(coalGeo,new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{ time:{value:0}, seed:{value:seed}, strength:{value:0} }]),
    vertexShader:coalVertex, fragmentShader:coalFragment, fog:true,
  })); coals.receiveShadow = true; root.add(coals);
  const plume = new THREE.Mesh(plumeGeo,new THREE.ShaderMaterial({
    uniforms, vertexShader:plumeVertex, fragmentShader:plumeFragment, transparent:true,
    depthWrite:false, blending:THREE.AdditiveBlending,
  })); root.add(plume);
  // From outside, its front faces let the bowl and the wanderer hide the fire. With the camera inside
  // the box only back faces remain, and those lie behind the bowl, so draw them without the depth test.
  const eye = new THREE.Vector3();
  plume.onBeforeRender = (renderer,scene,camera) => {
    const inside = plumeBox.containsPoint(eye.setFromMatrixPosition(camera.matrixWorld).sub(root.position));
    plume.material.side = inside ? THREE.BackSide : THREE.FrontSide; plume.material.depthTest = !inside;
  };
  const sparks = new THREE.Points(sparkGeo,new THREE.ShaderMaterial({
    uniforms:{ time:uniforms.time, strength:uniforms.strength, offset:{value:seed*3.1}, px:{value:pixelRatio} },
    vertexShader:sparkVertex, fragmentShader:sparkFragment, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  })); root.add(sparks);
  // A soft gold glow around the rising fire, like the Oracle's champagne light.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFD38A, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }));
  halo.position.y = 1.75; halo.scale.set(1.6,1.6,1); root.add(halo);
  // A tight white glare over the heart of the flame.
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTex, color:0xFFF2D6, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }));
  glare.position.y = 1.52; glare.scale.set(.85,1.05,1); root.add(glare);
  const light = new THREE.PointLight(0xFFCF8A,0,6,2); light.position.y = 1.85; root.add(light);
  const b = { root, solids, pos:root.position.clone(), top:position.y, lit:false, ignition:0, light, plume,
    update(dt,time){
      b.ignition = b.lit ? Math.min(1,b.ignition + dt*1.6) : 0;
      const strength = reduceMotion ? (b.lit ? 1 : 0) : THREE.MathUtils.smoothstep(b.ignition,0,1);
      const t = reduceMotion ? 0 : time + seed*13;
      const flicker = 1 + Math.sin(t*7.3)*.05 + Math.sin(t*13.1 + 1.3)*.035 + Math.sin(t*2.9 + .4)*.03;
      uniforms.time.value = coals.material.uniforms.time.value = reduceMotion ? 0 : time;
      uniforms.strength.value = coals.material.uniforms.strength.value = strength;
      plume.visible = halo.visible = glare.visible = strength>0; sparks.visible = strength>0 && !reduceMotion;
      halo.material.opacity = strength*flicker*.13; glare.material.opacity = strength*flicker*.32;
      light.intensity = strength*flicker*.9;
    },
  };
  b.update(0,0); return b;
}
