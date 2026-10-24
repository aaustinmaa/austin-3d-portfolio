import * as THREE from 'three';
import { glowTex, hazeTex, rayTex } from './textures.js';
import { withEdges, rhombicTriacontahedron } from './polyhedra.js';

// Fixed analytic lights shared by the glass, the metal and the glints. They live
// in world space, so every highlight stays on its own surface as the hoops turn.
const LIGHTS = 'const vec3 KEY=vec3(-.5514,.7018,.4511),FILL=vec3(.654,.1811,.7345),UNDER=vec3(-.4015,-.6324,-.6625);';
const NOISE = `float hash1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash1(i),hash1(i+vec2(1.,0.)),f.x),mix(hash1(i+vec2(0.,1.)),hash1(i+vec2(1.)),f.x),f.y);}
  float fbm2(vec2 p){return noise2(p)*.58+noise2(p*2.03+7.)*.28+noise2(p*4.13-3.)*.14;}`;
const SURFACE = `${LIGHTS}${NOISE}
  vec3 sky(vec3 d){float cloud=noise2(d.xy*3.1+d.z*1.7)*.6+noise2(d.yz*6.3-d.x)*.4;
    vec3 c=mix(vec3(.02,.03,.08),vec3(.16,.23,.46),cloud*cloud);
    c+=vec3(.62,.76,1.)*exp(-pow((d.y+d.x*.46-.16)/.1,2.))*(.35+cloud);
    c+=vec3(.58,.52,1.)*exp(-pow((d.y-d.x*.68+.39)/.03,2.))*.7;
    return c+vec3(1.,.87,.62)*pow(max(dot(d,KEY),0.),40.)*2.2+vec3(.7,.84,1.)*pow(max(dot(d,FILL),0.),70.)*1.5
      +vec3(.46,.56,.96)*pow(max(dot(d,UNDER),0.),24.)*.9;}
  // Polished yellow gold: a warm body mirroring the sky, broken into
  // leaf-like patches so its light gathers unevenly along an edge. The bloom,
  // glints and glitter drawn over it stay white.
  vec3 metal(vec3 n,vec3 v,float leaf){vec3 r=reflect(-v,n);
    float hot=pow(max(dot(r,KEY),0.),60.)*2.6+pow(max(dot(r,FILL),0.),110.)*1.5+pow(max(dot(r,UNDER),0.),36.)*.9;
    return vec3(.36,.27,.1)*(.7+.6*leaf)+vec3(1.,.82,.42)*sky(r)*(.6+.8*leaf)+vec3(1.,.88,.55)*hot*(.3+1.6*leaf);}
  // Sparse flakes, each tilted at random, flash when they mirror a light.
  float glitter(vec2 p,vec3 n,vec3 v,float density){vec2 c=floor(p),f=fract(p)-.5;float h=hash1(c);
    vec3 m=normalize(n+(vec3(hash1(c+3.1),hash1(c+5.7),hash1(c+9.2))-.5)*.9),r=reflect(-v,m);
    float s=pow(max(dot(r,KEY),0.),160.)+pow(max(dot(r,FILL),0.),220.)*.7+pow(max(dot(r,UNDER),0.),120.)*.5;
    float a=h*40.;vec2 q=mat2(cos(a),-sin(a),sin(a),cos(a))*f;q.x*=1.+2.5*hash1(c+1.3);
    return step(1.-density,h)*s*smoothstep(.32,.08,length(q))*4.;}
  // Nebula crystal shared by the hoops and the core: dark glass with violet
  // clouds and fine white fractures that mirrors the sky, more so at grazing.
  vec4 nebula(vec3 n,vec3 v,vec2 q,float t){vec3 env=sky(reflect(-v,n));float fres=.05+.95*pow(1.-abs(dot(n,v)),4.);
    float neb=fbm2(q+vec2(t*.01,0.)),vio=smoothstep(.5,.82,fbm2(q*.55+11.));
    float crack=exp(-abs(fbm2(q*1.6+4.)-.5)*55.)*smoothstep(.4,.75,noise2(q*.7-2.));
    vec3 col=mix(vec3(.04,.07,.18),vec3(.2,.33,.64),smoothstep(.25,.85,neb));
    col=mix(col,vec3(.38,.23,.62),vio*.75)*.8+env*(.35+fres*1.5)+vec3(.78,.88,1.)*crack*.55;
    return vec4(col,min(.95,.85+fres*.1+crack*.05));}
  bool hidden(vec3 w,vec3 center,float hemi){return dot(w-center,w-cameraPosition)*hemi>0.;}`;
// A glint drawn as a thin four-point star with fainter diagonals, not a disc.
const STAR = `uniform vec3 col;varying float vI;varying float vA;varying vec3 vCol;
  void main(){vec2 p=gl_PointCoord-.5;float c=cos(vA),s=sin(vA);p=mat2(c,-s,s,c)*p;
    float ray=exp(-abs(p.x)*70.)*exp(-abs(p.y)*5.5)+exp(-abs(p.y)*70.)*exp(-abs(p.x)*5.5);
    vec2 d=mat2(.7071,-.7071,.7071,.7071)*p;
    float diag=(exp(-abs(d.x)*90.)*exp(-abs(d.y)*13.)+exp(-abs(d.y)*90.)*exp(-abs(d.x)*13.))*.45;
    float core=exp(-dot(p,p)*900.);
    gl_FragColor=vec4(mix(vCol,vec3(1.),min(1.,core+ray*.3)),(ray+diag+core*1.5)*min(vI,1.6));}`;

// Option A: crystal armillary hoops edged in platinum, fine filaments and a nested
// luminous jewel. All curves and glass surfaces exist in world space.
export function buildOracleDesign({ main, reduceMotion }) {
  const solid = mesh => { mesh.userData.solid = true; return mesh; };
  const TAU = Math.PI * 2, C = v => new THREE.Color(v), motion = reduceMotion ? 0 : 1;
  const group = new THREE.Group(), clock = { value: 0 }, energy = { value: 0 }, power = { value: 0 };
  const center = { value: new THREE.Vector3() };
  // Tighten the armillary silhouette without scaling the central polyhedra.
  const armillary = new THREE.Group(); armillary.scale.setScalar(.88 * .88); group.add(armillary);
  const platinum = C('#DCDEEA');
  const px = Math.min(devicePixelRatio || 1, 1.75);
  // A private seed, so the valley's shared decoration never shifts.
  let seed = 23;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const sprite = (parent, color, size, opacity, map = glowTex) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, opacity, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.set(size, size, 1); parent.add(s); return s;
  };
  const haze = sprite(group, '#546A9F', 54, .3, hazeTex);
  const aura = sprite(group, '#617DAD', 29, .16);
  // Local blue mist with a trace of violet; leave the shared valley fog alone.
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { t: clock, power },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
      center.xy+=position.xy;center.z-=2.;gl_Position=projectionMatrix*center;}`,
    fragmentShader: `uniform float t;uniform float power;varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
      float cloud(vec2 p){return noise(p)*.57+noise(p*2.03+7.)*.28+noise(p*4.1-3.)*.15;}
      void main(){vec2 p=(vUv-.5)*2.;float feather=pow(max(0.,1.-dot(p,p)),2.);
        vec2 drift=vec2(t*.012,-t*.008);float n=cloud(p*3.2+drift+cloud(p*2.-drift)*1.6);
        float w=smoothstep(.22,.78,n);vec3 col=mix(vec3(.18,.2,.34),vec3(.2,.3,.47),w);
        gl_FragColor=vec4(col,feather*w*(.28+power*.025));}`
  }));
  mist.frustumCulled = false; group.add(mist);

  // Glass and metal hide part of what lies behind them, so draw order matters.
  // Each such surface draws twice: its half beyond the Oracle's centre (seen
  // from the camera) before the core, its near half after. Nested shells then
  // sort by radius: outermost first behind the core, last in front of it.
  const PREMUL = { transparent: true, depthWrite: false, fog: false, side: THREE.FrontSide, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };
  function layered(parent, geo, make, shell) {
    for (const hemi of [-1, 1]) {
      const mesh = new THREE.Mesh(geo, make(hemi)); mesh.renderOrder = hemi > 0 ? 60 + shell : 24 - shell; parent.add(mesh);
    }
  }
  const tilted = (path, tilt) => { const e = new THREE.Euler(...tilt), p = new THREE.Vector3(); return path.map(q => p.set(...q).applyEuler(e).toArray()); };

  // World-space ribbons are expanded perpendicular to their projected tangent.
  // A bloom thread lights up only where the metal beneath it mirrors a light.
  function threads(paths, { parent = group, color = platinum, opacity = .72, width = .3, flow = .12, bloom = false, leaf = 70, order = 50 } = {}) {
    const pos = [], tangent = [], uv = [], seeds = [], index = [];
    paths.forEach((path, n) => {
      const offset = pos.length / 3;
      path.forEach((p, i) => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
        for (let side = 0; side < 2; side++) {
          pos.push(...p); tangent.push(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          uv.push(i / (path.length - 1), side); seeds.push(n * .731);
        }
        if (i < path.length - 1) { const k = offset + i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      });
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('tangent', new THREE.Float32BufferAttribute(tangent, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1)); geo.setIndex(index);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false, extensions: { derivatives: true }, defines: bloom ? { BLOOM: '' } : {},
      uniforms: { t: clock, energy, power, center, col: { value: C(color) }, opacity: { value: opacity }, width: { value: width }, flow: { value: flow }, leafScale: { value: leaf } },
      vertexShader: `attribute vec3 tangent;attribute float seed;uniform float width;uniform vec3 center;varying vec2 vUv;varying float vSeed;varying float vSpec;${LIGHTS}
        float kk(vec3 L,vec3 T,vec3 V){float h=dot(T,normalize(L+V));return pow(max(0.,1.-h*h),20.);}
        void main(){vUv=uv;vSeed=seed;vSpec=1.;
          #ifdef BLOOM
          vec4 w=modelMatrix*vec4(position,1.);vec3 T=normalize(mat3(modelMatrix)*tangent),V=normalize(cameraPosition-w.xyz);
          vSpec=kk(KEY,T,V)+kk(FILL,T,V)*.7+kk(UNDER,T,V)*.5;
          if(dot(w.xyz-center,w.xyz-cameraPosition)>0.)vSpec*=.45;
          #endif
          vec4 mv=modelViewMatrix*vec4(position,1.);vec2 d=(modelViewMatrix*vec4(tangent,0.)).xy;
          d/=max(length(d),.001);mv.xy+=vec2(-d.y,d.x)*(uv.y-.5)*width;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform float t;uniform float energy;uniform float power;uniform vec3 col;uniform float opacity;uniform float flow;uniform float leafScale;varying vec2 vUv;varying float vSeed;varying float vSpec;${NOISE}
        void main(){float p=abs(vUv.y-.5)*2.;
          #ifdef BLOOM
          float leaf=smoothstep(.25,.8,noise2(vec2(vUv.x*leafScale+vSeed*13.,vSeed)));
          float a=exp(-p*p*5.)*pow(vSpec,1.6)*(.3+leaf)*opacity*(1.+energy*.2+power*.1);
          gl_FragColor=vec4(mix(col,vec3(1.,.99,.97),min(1.,vSpec*.5)),a);
          #else
          float sigma=max(.055,fwidth(vUv.y)*.65);float thread=exp(-pow((vUv.y-.5)/sigma,2.))+.075*exp(-p*p*3.5);
          float glint=pow(.5+.5*cos(vUv.x*6.283185-t*.22+vSeed),28.);
          gl_FragColor=vec4(mix(col,vec3(.76,.81,.93),glint*.22),thread*opacity*(1.12+glint*flow+energy*.16+power*.05));
          #endif
        }`
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = order; parent.add(mesh); return mat;
  }
  const circle = (r, n = 192, a0 = 0, a1 = TAU, z = 0) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / n; return [Math.cos(a) * r, Math.sin(a) * r, z];
  });

  // Star glints along metal edges. Each point is a tiny facet with its own
  // tilt, so it flashes only while that facet mirrors a light at the viewer.
  function glints(parent, paths, { size = 1, gain = 1, density = .5, color = '#F0F1FA' } = {}) {
    const pos = [], tangent = [], seeds = [];
    for (const path of paths) path.forEach((p, i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      pos.push(...p); tangent.push(b[0] - a[0], b[1] - a[1], b[2] - a[2]); seeds.push(random() * 100);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('tangent', new THREE.Float32BufferAttribute(tangent, 3));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { t: clock, energy, power, center, px: { value: px }, size: { value: size }, gain: { value: gain }, density: { value: density }, col: { value: C(color) } },
      vertexShader: `attribute vec3 tangent;attribute float seed;uniform vec3 center;uniform vec3 col;uniform float px,size,gain,density,t,energy,power;
        varying float vI;varying float vA;varying vec3 vCol;${LIGHTS}
        float kk(vec3 L,vec3 T,vec3 V){float h=dot(T,normalize(L+V));return pow(max(0.,1.-h*h),260.);}
        void main(){vec4 w=modelMatrix*vec4(position,1.);vec3 T=normalize(mat3(modelMatrix)*tangent),V=normalize(cameraPosition-w.xyz);
          vec3 j=(fract(vec3(seed*1.271,seed*3.711,seed*5.923))-.5)*.8;
          float s=kk(normalize(KEY+j),T,V)+kk(normalize(FILL+j.yzx),T,V)*.75+kk(normalize(UNDER+j.zxy),T,V)*.5;
          vI=s*step(1.-density,fract(seed*.7713))*gain*(.8+.2*sin(t*2.7+seed))*(1.+energy*.3+power*.25);
          if(dot(w.xyz-center,w.xyz-cameraPosition)>0.)vI*=.35;
          vA=fract(seed*.0917)*.6-.3;vCol=col;vec4 mv=viewMatrix*w;gl_Position=projectionMatrix*mv;
          gl_PointSize=vI<.04?0.:clamp(size*px*900./max(1.,-mv.z)*min(1.5,.4+vI),1.,96.*px);}`,
      fragmentShader: STAR
    });
    const points = new THREE.Points(geo, mat); points.renderOrder = 71; parent.add(points); return mat;
  }

  // Each ribbon is a zone of a sphere, as on a real armillary: its broad glass
  // face curves with the globe across the band's width, and a rounded
  // (squircle) section gives every edge real thickness. Radius, width and
  // depth stay independent, and nested radii let the hoops turn freely.
  function bandGeometry(radius, width, depth) {
    const N = 288, M = 32, half = width / 2 / radius, pos = [], nor = [], uv = [], face = [], index = [];
    const root = x => Math.sign(x) * Math.sqrt(Math.abs(x));
    const smooth = x => { const k = Math.min(1, Math.max(0, (x - .55) / .37)); return k * k * (3 - 2 * k); };
    const profile = f => {
      const a = root(Math.cos(f)), b = root(Math.sin(f)), lat = a * half, rr = radius + b * depth / 2;
      return [rr * Math.cos(lat), rr * Math.sin(lat), a, b];
    };
    for (let i = 0; i <= N; i++) {
      const t = i / N * TAU, ct = Math.cos(t), st = Math.sin(t);
      for (let j = 0; j < M; j++) {
        const f = j / M * TAU, [rho, z, a, b] = profile(f), p0 = profile(f - .002), p1 = profile(f + .002);
        const nr = p0[1] - p1[1], nz = p1[0] - p0[0], l = Math.hypot(nr, nz);
        pos.push(rho * ct, rho * st, z); nor.push(nr / l * ct, nr / l * st, nz / l);
        uv.push(i / N, (a + 1) / 2); face.push(smooth(b) + smooth(-b) * .45);
        if (i < N) { const k = i * M + j, k1 = i * M + (j + 1) % M; index.push(k, k1, k + M, k1, k1 + M, k + M); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('face', new THREE.Float32BufferAttribute(face, 1)); geo.setIndex(index);
    return { geo, edge: [radius * Math.cos(half), radius * Math.sin(half)] };
  }

  // The art's inscriptions are tiny abstract diagrams, degree ticks and stars.
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
  for (let i = 0; i < 168; i++) {
    const x = i / 168 * 2048, major = i % 7 === 0; ctx.globalAlpha = major ? .9 : .45; ctx.lineWidth = major ? 2.8 : 1.8;
    ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, major ? 56 : 33); ctx.moveTo(x, 242); ctx.lineTo(x, major ? 200 : 223); ctx.stroke();
  }
  for (let i = 0; i < 56; i++) {
    const x = (i + .35) / 56 * 2048, y = 90 + random() * 60; ctx.lineWidth = 1.8; ctx.globalAlpha = .5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, y - 12); ctx.lineTo(x + 20, y - 4); ctx.lineTo(x + 26, y + 11); ctx.stroke();
    for (const [dx, dy] of [[0, 0], [8, -12], [20, -4], [26, 11]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 2, 0, TAU); ctx.fill(); }
    if (i % 3 === 0) { ctx.globalAlpha = .6; ctx.strokeRect(x + 4, 175, 13, 8); }
  }
  const engraving = new THREE.CanvasTexture(canvas); engraving.wrapS = THREE.RepeatWrapping; engraving.anisotropy = 4;

  // Dark nebula crystal with violet clouds and fine white fractures. A gilded
  // lip wraps both edges, a pinstripe and metal inscriptions run inside it, and
  // star medallions mark the chapter jewels. All of it shares one surface, so
  // its light belongs to the glass rather than floating over it.
  function ribbonMaterial(hemi, u) {
    return new THREE.ShaderMaterial({ ...PREMUL, extensions: { derivatives: true },
      uniforms: { map: { value: engraving }, t: clock, energy, power, center, hemi: { value: hemi }, ...u },
      vertexShader: `attribute float face;varying vec2 vUv;varying vec3 vW;varying vec3 vN;varying float vFace;
        void main(){vUv=uv;vFace=face;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `uniform sampler2D map;uniform float t,energy,power,hemi,restored,offset,circ,width;uniform vec3 center;
        uniform vec2 slotU,slotLit,slotFlash;uniform vec3 slotColA,slotColB;
        varying vec2 vUv;varying vec3 vW;varying vec3 vN;varying float vFace;${SURFACE}
        float medal(float u0,float y,out float disc){vec2 m=vec2((fract(vUv.x-u0+.5)-.5)*circ,y);float r=length(m),a=atan(m.y,m.x),aa=fwidth(r)*1.2+1e-4;
          disc=smoothstep(.66,.6,r)*step(0.,u0);
          float rings=smoothstep(aa,0.,abs(r-.62)-.028)+smoothstep(aa,0.,abs(r-.5)-.014);
          float star=smoothstep(aa*1.5,0.,r-(.06+.42*pow(abs(cos(2.*a)),14.)+.2*pow(abs(sin(2.*a)),14.)));
          return clamp(rings+star,0.,1.)*step(0.,u0);}
        void main(){if(hidden(vW,center,hemi))discard;
          vec3 n=normalize(vN),v=normalize(cameraPosition-vW);
          vec2 band=vec2(vUv.x*circ,(vUv.y-.5)*width);float edge=(.5-abs(vUv.y-.5))*width,aa=fwidth(edge)+1e-4;
          float outer=step(.9,vFace),faceK=step(.4,vFace);
          vec4 glass=nebula(n,v,band*.45+offset*7.,t);vec3 col=glass.rgb;float alpha=glass.a;
          float discA,discB,ma=medal(slotU.x,band.y,discA)*outer,mb=medal(slotU.y,band.y,discB)*outer;
          col=mix(col,vec3(.02,.03,.08),(discA+discB)*outer*.6);alpha=mix(alpha,.85,(discA+discB)*outer);
          float lip=max(1.-smoothstep(.12,.3,vFace),faceK*smoothstep(aa,0.,edge-.028));
          float stripe=faceK*smoothstep(aa,0.,abs(edge-.15)-.011);
          float glyph=texture2D(map,vec2(vUv.x*2.,vUv.y)).a*faceK*mix(.55,1.,outer);
          float g=clamp(max(max(lip,stripe),max(glyph*.9,max(ma,mb))),0.,1.);
          float leaf=smoothstep(.2,.85,noise2(vec2(vUv.x*circ*1.4+offset*9.,edge*4.)));
          vec3 gc=metal(n,v,leaf)*(1.+energy*.2+restored*.12)+vec3(1.,.99,.97)*glitter(band/.09+offset*13.,n,v,.18)*3.;
          col=mix(col,gc,g);alpha=mix(alpha,1.,g);
          float fleck=glitter(band/.06+31.,n,v,.03)*faceK*(1.-g);
          vec3 glow=slotColA*ma*(slotLit.x*1.1+slotFlash.x*1.6)+slotColB*mb*(slotLit.y*1.1+slotFlash.y*1.6)
            +(slotColA*discA*slotFlash.x+slotColB*discB*slotFlash.y)*outer*.35;
          gl_FragColor=vec4(col*alpha+vec3(.96,.97,1.)*fleck*2.5+glow,alpha);}`
    });
  }
  // Clear glass beads: a bright rim, mirrored lights and, for a chapter jewel,
  // its relic's colour waking inside once restored.
  function pearlMaterial(hemi, u) {
    return new THREE.ShaderMaterial({ ...PREMUL,
      uniforms: { center, energy, hemi: { value: hemi }, ...u },
      vertexShader: `attribute float slot;varying vec3 vW;varying vec3 vN;varying float vSlot;
        void main(){vSlot=slot;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `uniform vec3 center;uniform float hemi,energy;uniform vec2 slotLit,slotFlash;uniform vec3 slotColA,slotColB;
        varying vec3 vW;varying vec3 vN;varying float vSlot;${SURFACE}
        void main(){if(hidden(vW,center,hemi))discard;
          vec3 n=normalize(vN),v=normalize(cameraPosition-vW),r=reflect(-v,n);float ndv=abs(dot(n,v)),fres=.04+.96*pow(1.-ndv,3.);
          float hot=pow(max(dot(r,KEY),0.),120.)*3.+pow(max(dot(r,FILL),0.),160.)*2.+pow(max(dot(r,UNDER),0.),90.)*1.2;
          float lit=0.,flash=0.;vec3 rc=vec3(.75,.85,1.);
          if(vSlot>-.5){bool a=vSlot<.5;lit=a?slotLit.x:slotLit.y;flash=a?slotFlash.x:slotFlash.y;rc=a?slotColA:slotColB;}
          vec3 inner=mix(vec3(.72,.82,1.),rc,lit)*pow(ndv,4.)*(.3+lit*.9+flash)*(1.+energy*.2);
          float alpha=.22+fres*.55;
          gl_FragColor=vec4(sky(r)*(.25+fres*1.3)*alpha+inner+vec3(1.,.96,.9)*hot,alpha);}`
    });
  }
  function pearlGeometry(list) {
    const pos = [], nor = [], slot = [];
    for (const { p, r, s = -1 } of list) {
      const g = new THREE.IcosahedronGeometry(r, 3), a = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < a.count; i++) { pos.push(a.getX(i) + p[0], a.getY(i) + p[1], a.getZ(i) + p[2]); nor.push(n.getX(i), n.getY(i), n.getZ(i)); slot.push(s); }
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('slot', new THREE.Float32BufferAttribute(slot, 1)); return geo;
  }
  // Fine platinum wire: tubes along circles and arcs, baked into one geometry.
  function wireGeometry(list, tube) {
    const pos = [], nor = [], along = [], index = [], M = 8, e = new THREE.Euler(), p = new THREE.Vector3(), d = new THREE.Vector3();
    for (const { r, a0 = 0, a1 = TAU, tilt = [0, 0, 0] } of list) {
      e.set(...tilt); const n = Math.max(8, Math.round((a1 - a0) / TAU * 256)), base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n, c = Math.cos(a), s = Math.sin(a);
        for (let j = 0; j < M; j++) {
          const f = j / M * TAU; d.set(c * Math.cos(f), s * Math.cos(f), Math.sin(f)).applyEuler(e);
          p.set(c * r, s * r, 0).applyEuler(e).addScaledVector(d, tube);
          pos.push(p.x, p.y, p.z); nor.push(d.x, d.y, d.z); along.push(a * r);
          if (i < n) { const k = base + i * M + j, k1 = base + i * M + (j + 1) % M; index.push(k, k + M, k1, k1, k + M, k1 + M); }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1)); geo.setIndex(index); return geo;
  }
  const wireMaterial = hemi => new THREE.ShaderMaterial({ ...PREMUL,
    uniforms: { center, energy, power, hemi: { value: hemi } },
    vertexShader: `attribute float along;varying vec3 vW;varying vec3 vN;varying float vAlong;
      void main(){vAlong=along;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform vec3 center;uniform float hemi,energy,power;varying vec3 vW;varying vec3 vN;varying float vAlong;${SURFACE}
      void main(){if(hidden(vW,center,hemi))discard;vec3 n=normalize(vN),v=normalize(cameraPosition-vW);
        float leaf=smoothstep(.2,.85,noise2(vec2(vAlong*1.6,3.)));
        vec3 c=metal(n,v,leaf)*(1.+energy*.15+power*.08)+vec3(1.,.99,.97)*glitter(vec2(vAlong/.08,.5),n,v,.22)*2.5;
        gl_FragColor=vec4(c,1.);}`
  });
  // Star medallions that always face the viewer: dark glass behind a platinum
  // double ring and an eight-point star.
  const medallionMaterial = hemi => new THREE.ShaderMaterial({ ...PREMUL, extensions: { derivatives: true },
    uniforms: { center, energy, hemi: { value: hemi }, size: { value: .72 } },
    vertexShader: `attribute vec3 origin;uniform float size;varying vec2 vP;varying vec3 vW;
      void main(){vP=position.xy;vec4 c=modelViewMatrix*vec4(origin,1.);c.xy+=position.xy*size;vW=(modelMatrix*vec4(origin,1.)).xyz;gl_Position=projectionMatrix*c;}`,
    fragmentShader: `uniform vec3 center;uniform float hemi,energy;varying vec2 vP;varying vec3 vW;${SURFACE}
      void main(){if(hidden(vW,center,hemi))discard;float r=length(vP),a=atan(vP.y,vP.x),aa=fwidth(r)*1.2;if(r>1.)discard;
        float ring=smoothstep(aa,0.,abs(r-.93)-.045)+smoothstep(aa,0.,abs(r-.78)-.018);
        float star=smoothstep(aa*2.,0.,r-(.07+.62*pow(abs(cos(2.*a)),16.)+.3*pow(abs(sin(2.*a)),16.)));
        float g=clamp(ring+star,0.,1.);
        vec3 v=normalize(cameraPosition-vW),right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        vec3 n=normalize(v+(right*vP.x+up*vP.y)*.6);
        vec3 col=mix(vec3(.02,.035,.09)+sky(reflect(-v,n))*.15,metal(n,v,smoothstep(.2,.8,noise2(vec2(a*3.,r*5.)+vW.xz)))*1.2,g);
        float alpha=mix(.55,1.,g)*smoothstep(1.,.97,r);
        gl_FragColor=vec4(col*alpha*(1.+energy*.15)+vec3(.97,.98,1.)*exp(-r*r*60.)*1.2,alpha);}`
  });

  // Four nested hoops of one globe. Their radial spacing exceeds a band's depth
  // plus its jewel, so no two ever touch while their planes turn.
  const rings = [
    { r: 10.2, w: 2.7, tilt: [.05, .87, 0], axis: [.3, 1, .2], speed: .1 },
    { r: 10.75, w: 2.35, tilt: [-1.19, -.2, 0], axis: [1, .25, -.3], speed: -.085 },
    { r: 11.3, w: 2.05, tilt: [-.98, .36, 1.1], axis: [-.2, .45, 1], speed: .095 },
    { r: 11.85, w: 1.8, tilt: [-.34, -.93, 2.2], axis: [.5, -.3, .8], speed: -.07 },
  ].map((spec, i) => {
    const depth = .4, gimbal = new THREE.Group(); armillary.add(gimbal);
    const pivot = new THREE.Group(); pivot.rotation.set(...spec.tilt); gimbal.add(pivot);
    const band = bandGeometry(spec.r, spec.w, depth), [edgeRadius, edgeZ] = band.edge;
    const u = { restored: { value: 0 }, offset: { value: i * 2.1 }, circ: { value: TAU * spec.r }, width: { value: spec.w },
      slotU: { value: new THREE.Vector2(-1, -1) }, slotLit: { value: new THREE.Vector2() }, slotFlash: { value: new THREE.Vector2() },
      slotColA: { value: C('#FFFFFF') }, slotColB: { value: C('#FFFFFF') } };
    layered(pivot, band.geo, hemi => ribbonMaterial(hemi, u), i);
    const edges = [circle(edgeRadius, 192, 0, TAU, edgeZ), circle(edgeRadius, 192, 0, TAU, -edgeZ)];
    threads(edges, { parent: pivot, color: '#EEF0FA', width: 1.1, opacity: .55, bloom: true, order: 70 });
    glints(pivot, edges.map(e => e.filter((_, k) => k % 2)), { size: 1.25, gain: 1.2, density: .55 });
    return { pivot, gimbal, axis: new THREE.Vector3(...spec.axis).normalize(), speed: spec.speed, u, radius: spec.r, depth, slots: [] };
  });

  // The reference globe stays delicate: four great circles, tiny angular marks,
  // loose orbit arcs and a few jewel-like junctions on a long polar axis.
  const frame = new THREE.Group(); armillary.add(frame);
  const FR = 12.45, wires = [];
  for (const tilt of [[0, 0, 0], [0, .97, 0], [0, -1.06, 0], [1.32, 0, .1]]) wires.push({ r: FR, tilt });
  const arcs = [[13.15, 2.25, 3.95, [.1, .35, .18]], [12.95, -.55, .75, [.3, -.5, 0]], [13.45, 3.7, 4.45, [-.2, .85, .1]]];
  for (const [r, a0, a1, tilt] of arcs) wires.push({ r, a0, a1, tilt });
  layered(frame, wireGeometry(wires, .018), wireMaterial, 4);
  const wirePaths = wires.map(({ r, a0 = 0, a1 = TAU, tilt }) => tilted(circle(r, Math.round((a1 - a0) / TAU * 192), a0, a1), tilt));
  threads(wirePaths, { parent: frame, color: '#EEF0FA', width: .8, opacity: .35, bloom: true, order: 70 });
  glints(frame, wirePaths, { size: 1.1, gain: 1.1, density: .5 });
  const graduations = [], spurs = [];
  for (let i = 0; i < 144; i++) {
    const a = i / 144 * TAU, end = FR + (i % 12 ? .065 : .19);
    graduations.push([[Math.cos(a) * FR, Math.sin(a) * FR, 0], [Math.cos(a) * end, Math.sin(a) * end, 0]]);
  }
  for (const [r, a0, a1, tilt] of arcs) for (let a = a0 + .05; a < a1; a += .09) spurs.push(tilted([[Math.cos(a) * r, Math.sin(a) * r, 0], [Math.cos(a) * (r + .22), Math.sin(a) * (r + .22), 0]], tilt));
  threads(graduations, { parent: frame, width: .15, opacity: .55, flow: 0, order: 65 });
  threads(spurs, { parent: frame, width: .1, opacity: .3, flow: 0, order: 65 });
  // The polar axis and the equatorial diameter cross at the core, as in the art.
  threads([[[0, -15.5, 0], [0, 15.5, 0]]], { parent: frame, width: .19, opacity: .7, flow: .08 });
  threads([[[-13.55, 0, 0], [13.55, 0, 0]]], { parent: frame, width: .16, opacity: .5, flow: .08 });
  layered(frame, pearlGeometry([[0, -13.9, 0], [0, -FR, 0], [0, FR, 0], [0, 13.9, 0]].map(p => ({ p, r: p[1] ** 2 > 13 ** 2 ? .36 : .27 }))),
    hemi => pearlMaterial(hemi, { slotLit: { value: new THREE.Vector2() }, slotFlash: { value: new THREE.Vector2() }, slotColA: { value: C('#FFFFFF') }, slotColB: { value: C('#FFFFFF') } }), 4.5);
  // Star medallions close the equatorial diameter.
  const medallions = new THREE.BufferGeometry(), mPos = [], mOrigin = [], mIndex = [];
  for (const x of [-13.55, 13.55]) {
    const k = mPos.length / 3;
    for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { mPos.push(qx, qy, 0); mOrigin.push(x, 0, 0); }
    mIndex.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  medallions.setAttribute('position', new THREE.Float32BufferAttribute(mPos, 3));
  medallions.setAttribute('origin', new THREE.Float32BufferAttribute(mOrigin, 3)); medallions.setIndex(mIndex);
  layered(frame, medallions, medallionMaterial, 4.6);
  frame.children.forEach(m => { if (m.geometry === medallions) m.frustumCulled = false; });

  // The jewel spans about a third of the globe, so the armillary reads first
  // and the core stays a small, intense heart. Each solid nests in the last.
  const core = new THREE.Group(); core.scale.setScalar(.78); core.rotation.set(.03, 0, .1); group.add(core);
  const alignment = new THREE.Group(); alignment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, (1 + Math.sqrt(5)) / 2).normalize(), new THREE.Vector3(0, 0, 1)); core.add(alignment);
  // Each crystal is the hoops' nebula glass, mapped flat across every facet.
  // Light from the heart grows toward the centre, so the inner crystals glow
  // through the outer ones. The two outer crystals carry platinum lips along
  // their true edges, like the hoops; the inner two keep soft violet outlines.
  const coreMaterial = (side, shell, lipped) => new THREE.ShaderMaterial({ ...PREMUL, side, extensions: { derivatives: true },
    uniforms: { t: clock, energy, power, shell: { value: shell }, lipped: { value: lipped ? 1 : 0 } },
    vertexShader: `attribute vec3 edgeW;varying vec3 vP;varying vec3 vL;varying vec3 vW;varying vec3 vN;varying vec3 vE;
      void main(){vP=position;vL=normal;vE=edgeW;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float t,energy,power,shell,lipped;varying vec3 vP;varying vec3 vL;varying vec3 vW;varying vec3 vN;varying vec3 vE;${SURFACE}
      void main(){vec3 n=normalize(vN),l=normalize(vL),v=normalize(cameraPosition-vW);if(!gl_FrontFacing)n=-n;
        vec3 up=abs(l.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.),t1=normalize(cross(l,up)),t2=cross(l,t1);
        vec2 f=vec2(dot(vP,t1),dot(vP,t2)),q=f*.45+shell*7.3+l.xy*5.;
        vec4 glass=nebula(n,v,q,t);vec3 col=glass.rgb;float alpha=glass.a;
        float d=min(min(vE.x,vE.y),vE.z),lip=lipped*smoothstep(fwidth(d)+1e-4,0.,d-.03);
        vec3 mc=metal(n,v,smoothstep(.2,.85,noise2(q*2.3)))*(1.+energy*.2+power*.08)+vec3(1.,.99,.97)*glitter(f/.09+shell*13.,n,v,.18)*3.;
        col=mix(col,mc,lip);alpha=mix(alpha,1.,lip);
        float fleck=glitter(f/.06+31.+shell,n,v,.03)*(1.-lip),heat=exp(-length(vP)*.55);
        if(!gl_FrontFacing)alpha*=.6;
        gl_FragColor=vec4(col*alpha+vec3(.6,.73,1.)*heat*(1.1+energy*.3+power*.1)*(1.-lip)+vec3(.96,.97,1.)*fleck*2.5,alpha);}`
  });
  // Distance from each point to its solid's true edges, so a lip keeps one
  // width on every facet however that facet is split into triangles.
  function edgeDistances(g) {
    const p = g.attributes.position, bary = g.attributes.edge.array, out = new Float32Array(p.count * 3);
    const v = [0, 1, 2].map(() => new THREE.Vector3()), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let t = 0; t < p.count / 3; t++) {
      v.forEach((x, k) => x.fromBufferAttribute(p, t * 3 + k));
      const area2 = a.subVectors(v[1], v[0]).cross(b.subVectors(v[2], v[0])).length();
      for (let c = 0; c < 3; c++) {
        const seam = bary[(t * 3 + (c + 1) % 3) * 3 + c] > .5, h = area2 / v[(c + 1) % 3].distanceTo(v[(c + 2) % 3]);
        for (let k = 0; k < 3; k++) out[(t * 3 + k) * 3 + c] = seam ? 99 : k === c ? h : 0;
      }
    }
    g.setAttribute('edgeW', new THREE.BufferAttribute(out, 3));
  }
  const coreShapes = [new THREE.IcosahedronGeometry(4.05, 0), new THREE.DodecahedronGeometry(3.2, 0), new THREE.OctahedronGeometry(2.4, 0), rhombicTriacontahedron(1.32)];
  coreShapes.forEach((geo, i) => {
    const holder = new THREE.Group(); holder.rotation.set(0, i === 2 ? Math.PI / 4 : 0, 0); alignment.add(holder);
    const g = withEdges(geo); edgeDistances(g);
    for (const side of [THREE.BackSide, THREE.FrontSide]) {
      const surface = new THREE.Mesh(g, coreMaterial(side, i, i < 2));
      surface.renderOrder = side === THREE.BackSide ? 30 + i : 45 - i; holder.add(surface);
    }
    const edges = new THREE.EdgesGeometry(geo, 1).attributes.position, paths = [];
    for (let j = 0; j < edges.count; j += 2) paths.push([[edges.getX(j), edges.getY(j), edges.getZ(j)], [edges.getX(j + 1), edges.getY(j + 1), edges.getZ(j + 1)]]);
    // Between the back and front faces, so the near crystal softens its outlines.
    if (i >= 2) threads(paths, { parent: holder, color: i % 2 ? '#91A8D0' : '#A69CBF', opacity: .45 + i * .018, width: .17, flow: .09, order: 38 });
    // The two outer crystals share the armillary's light: an ice-white bloom
    // and star glints wherever one of their edges mirrors a light.
    if (i < 2) {
      threads(paths, { parent: holder, color: '#E4ECFF', width: .75, opacity: i ? .32 : .45, bloom: true, leaf: 5, order: 70 });
      glints(holder, paths.map(([a, b]) => [.2, .5, .8].map(k => a.map((x, c) => x + (b[c] - x) * k))), { size: .95, gain: i ? .8 : 1.1, density: .45, color: '#EAF0FF' });
    }
    geo.dispose();
  });
  const heartGlow = sprite(core, '#8BA3D6', 8.5, .34);
  const heartPoint = sprite(core, '#D8E4FA', 2.7, .78);
  const heartRays = sprite(core, '#B9CCF0', 9, .2, rayTex);
  heartGlow.renderOrder = heartPoint.renderOrder = heartRays.renderOrder = 50;

  // A small celestial frame around the jewel: from the front its three circles
  // read as a ring and a cross, matching the art's diagram around the core.
  const halo = new THREE.Group(); group.add(halo);
  for (const tilt of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
    const p = new THREE.Group(); p.rotation.set(...tilt); halo.add(p);
    threads([circle(4.15, 128)], { parent: p, color: '#ABA6D6', width: .13, opacity: .34, flow: .1 });
  }
  threads([circle(4.6, 128)], { parent: halo, color: '#ABA6D6', width: .1, opacity: .22, flow: 0 });

  // Chapter jewels: a pearl set mid-band over a platinum star medallion on the
  // outer face. Restoring a relic wakes its colour in both, with a flare.
  const slots = main.map((relic, i) => {
    const ring = rings[i % rings.length], k = ring.slots.length, a = (k ? .78 : .28) * TAU + i * .4;
    const slot = { relic, ring, k, a, lit: 0, target: 0, flash: 0 };
    ring.u.slotU.value.setComponent(k, (a / TAU) % 1);
    ring.u[k ? 'slotColB' : 'slotColA'].value.set(relic.color).lerp(C('#FFF4DC'), .25);
    ring.slots.push(slot); return slot;
  });
  rings.forEach((ring, i) => {
    const list = ring.slots.map(s => ({ p: [Math.cos(s.a) * ring.radius, Math.sin(s.a) * ring.radius, 0], r: .3, s: s.k }));
    if (!list.length) return;
    layered(ring.pivot, pearlGeometry(list), hemi => pearlMaterial(hemi, ring.u), i + .5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap(l => l.p), 3));
    geo.setAttribute('slot', new THREE.Float32BufferAttribute(list.map(l => l.s), 1));
    const flare = new THREE.Points(geo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { center, px: { value: px }, col: { value: platinum }, ...ring.u },
      vertexShader: `attribute float slot;uniform vec3 center;uniform float px;uniform vec2 slotLit,slotFlash;uniform vec3 slotColA,slotColB;varying float vI;varying float vA;varying vec3 vCol;
        void main(){bool a=slot<.5;vI=(a?slotLit.x:slotLit.y)*.5+(a?slotFlash.x:slotFlash.y)*1.4;vCol=a?slotColA:slotColB;vA=.2;
          vec4 w=modelMatrix*vec4(position,1.);if(dot(w.xyz-center,w.xyz-cameraPosition)>0.)vI*=.4;
          vec4 mv=viewMatrix*w;gl_Position=projectionMatrix*mv;gl_PointSize=vI<.04?0.:clamp(px*2400./max(1.,-mv.z)*min(1.4,.5+vI),1.,120.*px);}`,
      fragmentShader: STAR
    }));
    flare.renderOrder = 71; ring.pivot.add(flare);
  });

  let rotation = 0, orbitTime = 0;
  function update(dt, T, { power: p, speak, flash, finale }) {
    clock.value = T * motion; energy.value = speak + flash * .35; power.value = p + finale * .1;
    group.getWorldPosition(center.value);
    rotation += dt * motion * .018 * (1 - p * .5);
    orbitTime += dt * motion;
    core.rotation.y = rotation * .7; frame.rotation.y = halo.rotation.y = orbitTime * .045;
    // Rotate each ring's plane, not just its circularly symmetric rim. Keep
    // this movement equally legible before and after restoring the relics.
    rings.forEach((r, i) => {
      r.gimbal.quaternion.setFromAxisAngle(r.axis, orbitTime * r.speed);
      r.pivot.rotation.z += dt * motion * (i % 2 ? -.065 : .075);
    });
    slots.forEach(s => {
      s.lit += (s.target - s.lit) * (1 - Math.exp(-dt * (reduceMotion ? 30 : 1.5))); s.flash = Math.max(0, s.flash - dt * .8);
      s.ring.u.slotLit.value.setComponent(s.k, s.lit); s.ring.u.slotFlash.value.setComponent(s.k, s.flash);
    });
    rings.forEach(r => { r.u.restored.value = r.slots.reduce((sum, s) => sum + s.lit, 0) / (r.slots.length || 1) + finale * .5; });
    heartGlow.material.opacity = .32 + speak * .05 + flash * .05;
    haze.material.opacity = .28 + p * .025; aura.material.opacity = .15 + p * .02 + speak * .02;
  }
  return { group, update, receive(relic) { const s = slots.find(x => x.relic === relic); if (s) { s.target = 1; s.flash = 1; } }, bloom() { slots.forEach(s => s.flash = 1); } };
}
