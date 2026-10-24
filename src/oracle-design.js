import * as THREE from 'three';
import { glowTex, hazeTex, rayTex } from './textures.js';
import { withEdges, corners, rhombicTriacontahedron } from './polyhedra.js';
import { crystalMaterial } from './oracle-crystal.js';

// Option A: crystal armillary ribbons, fine champagne filaments and a nested
// luminous jewel. All curves and glass surfaces exist in world space.
export function buildOracleDesign({ main, reduceMotion }) {
  const solid = mesh => { mesh.userData.solid = true; return mesh; };
  const TAU = Math.PI * 2, C = v => new THREE.Color(v), motion = reduceMotion ? 0 : 1;
  const group = new THREE.Group(), clock = { value: 0 }, energy = { value: 0 }, power = { value: 0 };
  // Tighten the armillary silhouette without scaling the central polyhedra.
  const armillary = new THREE.Group(); armillary.scale.setScalar(.88 * .88); group.add(armillary);
  const gold = C('#CDB58E'), ice = C('#9CAFD9');
  const px = Math.min(devicePixelRatio || 1, 1.75);
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

  // World-space ribbons are expanded perpendicular to their projected tangent.
  // The narrow bright thread and wide faint skirt provide their own soft bloom.
  function threads(paths, { parent = group, color = gold, opacity = .72, width = .3, flow = .12, shimmer = 0 } = {}) {
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
      blending: THREE.AdditiveBlending, fog: false, extensions: { derivatives: true },
      uniforms: { t: clock, energy, power, col: { value: C(color) }, opacity: { value: opacity }, width: { value: width }, flow: { value: flow }, shimmer: { value: shimmer } },
      vertexShader: `attribute vec3 tangent; attribute float seed; uniform float width; varying vec2 vUv; varying float vSeed;
        void main(){vUv=uv;vSeed=seed;vec4 mv=modelViewMatrix*vec4(position,1.);vec2 d=(modelViewMatrix*vec4(tangent,0.)).xy;
          d/=max(length(d),.001);mv.xy+=vec2(-d.y,d.x)*(uv.y-.5)*width;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform float t;uniform float energy;uniform float power;uniform vec3 col;uniform float opacity;uniform float flow;uniform float shimmer;varying vec2 vUv;varying float vSeed;
        void main(){float p=abs(vUv.y-.5)*2.;float sigma=max(.055,fwidth(vUv.y)*.65);float thread=exp(-pow((vUv.y-.5)/sigma,2.))+.075*exp(-p*p*3.5);
          float glint=pow(.5+.5*cos(vUv.x*6.283185-t*.22+vSeed),28.);
          float variation=fract(sin(vSeed*12.7+1.3)*43758.5453);
          float flash=pow(.5+.5*sin(t*(.65+variation*.9)+vSeed*5.3+vUv.x*3.),12.+variation*20.);
          float radiance=mix(1.12+glint*flow,.035+flash*1.9,shimmer);
          float envelope=mix(thread,exp(-pow((vUv.y-.5)/(sigma*1.35),2.))+.05*exp(-p*p*2.5),shimmer);
          float taper=mix(1.,pow(max(0.,sin(vUv.x*3.141593)),.7),shimmer);
          float a=envelope*opacity*(radiance+energy*.16+power*.05)*taper;
          vec3 hot=mix(vec3(.76,.81,.93),vec3(1.,.94,.77),shimmer);
          gl_FragColor=vec4(mix(col,hot,mix(glint*.22,flash*.3,shimmer)),a);}`
    });
    const mesh = new THREE.Mesh(geo, mat); parent.add(mesh); return mat;
  }
  const circle = (r, n = 192, a0 = 0, a1 = TAU, z = 0) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / n; return [Math.cos(a) * r, Math.sin(a) * r, z];
  });
  // A star medallion: a double ring around eight fine rays, lying in the xy plane.
  function medallion(z = 0, r = .44) {
    const paths = [circle(r, 64, 0, TAU, z), circle(r * .77, 56, 0, TAU, z)];
    for (let j = 0; j < 8; j++) {
      const angle = j / 8 * TAU, k = j % 2 ? .62 : .82;
      paths.push([[Math.cos(angle) * r * .18, Math.sin(angle) * r * .18, z], [Math.cos(angle) * r * k, Math.sin(angle) * r * k, z]]);
    }
    return paths;
  }
  function sparks(parent, points, { size = .65, opacity = .8, color = gold, twinkle = 0 } = {}) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(points.map((_, i) => i * 1.791), 1));
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { t: clock, energy, px: { value: px }, size: { value: size }, twinkle: { value: twinkle }, opacity: { value: opacity }, col: { value: C(color) } },
      vertexShader: `attribute float seed;uniform float t;uniform float energy;uniform float px;uniform float size;uniform float twinkle;varying float vLight;varying float vSeed;
        void main(){vSeed=seed;float variation=fract(sin(seed*17.3+2.1)*43758.5453);
          float peak=pow(.5+.5*sin(seed*3.7+t*(.7+variation*.9)),16.+variation*22.);
          vLight=mix(.86+.14*sin(seed+t*.6),.015+peak*1.15,twinkle);vec4 mv=modelViewMatrix*vec4(position,1.);
          gl_PointSize=clamp(size*px*850./max(1.,-mv.z)*mix(1.,.25+peak*.95,twinkle),1.,56.*px);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform vec3 col;uniform float opacity;uniform float twinkle;varying float vLight;varying float vSeed;
        void main(){vec2 p=gl_PointCoord-.5;float d=dot(p,p);float ray=(exp(-abs(p.x)*95.)*exp(-abs(p.y)*6.)+exp(-abs(p.y)*95.)*exp(-abs(p.x)*6.))*.65;
          float angle=vSeed*2.39;vec2 q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;
          float slash=exp(-abs(q.y)*150.)*exp(-abs(q.x)*6.5);
          float spike=exp(-abs(q.x)*180.)*exp(-abs(q.y)*18.);
          float chip=exp(-dot(q*vec2(1.,2.7),q*vec2(1.,2.7))*145.);
          float slant=exp(-abs(q.y-q.x*.58)*165.)*exp(-length(q)*21.);
          float jagged=chip+slash*.85+spike*.5+slant*.3+exp(-length(q*vec2(.7,2.))*17.)*.055;
          float a=mix(exp(-d*90.)+exp(-d*13.)*.2+ray,jagged,twinkle)*opacity*vLight;
          vec3 hot=mix(vec3(.78,.79,1.),vec3(1.,.94,.77),twinkle);gl_FragColor=vec4(mix(col,hot,exp(-d*100.)*.35),a);}`
    });
    parent.add(new THREE.Points(geo, mat)); return mat;
  }

  function crystal({ color = ice, body = .1, edge = .1 } = {}) {
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false, extensions: { derivatives: true },
      uniforms: { t: clock, energy, power, col: { value: C(color) }, body: { value: body }, edgeK: { value: edge } },
      vertexShader: `attribute vec3 edge;varying vec3 vEdge;varying vec3 vN;varying vec3 vV;varying vec3 vObject;
        void main(){vEdge=edge;vObject=position;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform vec3 col;uniform float body;uniform float edgeK;uniform float energy;uniform float power;varying vec3 vEdge;varying vec3 vN;varying vec3 vV;varying vec3 vObject;
        void main(){vec3 n=normalize(vN),v=normalize(vV);float facing=abs(dot(n,v)),rim=pow(1.-facing,2.5);vec3 r=reflect(-v,n);
          float shine=pow(max(dot(r,normalize(vec3(-.5,.8,.65))),0.),28.)+pow(max(dot(r,normalize(vec3(.7,-.3,.8))),0.),55.)*.5;
          float d=min(min(vEdge.x,vEdge.y),vEdge.z),w=max(fwidth(d),.0001);float border=exp(-d/(w*3.));
          vec3 c=mix(col,vec3(.47,.4,.7),(.5+.5*sin(dot(normalize(vObject),vec3(2.,3.,1.))))*.22);
          float a=((.1+rim*.48+shine*.42)*body+border*edgeK)*(gl_FrontFacing?1.:.16)*(1.+energy*.12);
          gl_FragColor=vec4(mix(c,vec3(.67,.72,.95),clamp(shine*.4,0.,1.)),a);}`
    });
    return mat;
  }

  // The art's inscriptions are tiny abstract diagrams, degree ticks and stars.
  // Draw them with a private seed so the valley's shared decoration never shifts.
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 256;
  const ctx = canvas.getContext('2d'); let seed = 23;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
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
  // The trim catches scattered shards of light, with no continuous neon arc.
  const goldRimMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    blending: THREE.NormalBlending, fog: false, uniforms: { t: clock, energy, power },
    vertexShader: `varying vec3 vN;varying vec3 vP;varying vec2 vUv;void main(){vec4 world=modelMatrix*vec4(position,1.);
      vUv=uv;vP=world.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float t;uniform float energy;uniform float power;varying vec3 vN;varying vec3 vP;varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
      void main(){vec3 n=normalize(vN),v=normalize(cameraPosition-vP),r=reflect(-v,n);
        float a=pow(max(dot(r,normalize(vec3(-.55,.7,.45))),0.),36.);
        float b=pow(max(dot(r,normalize(vec3(.65,.18,.73))),0.),70.);
        float wave=pow(.5+.5*cos(vUv.x*6.283185-t*.22),20.);
        vec3 col=mix(vec3(.84,.7,.47),vec3(1.,.92,.74),clamp(stripe*.6+a+b+wave,0.,1.));
        float glow=(.13+stripe*.12+(a+b)*.4+wave*.7)*(1.+energy*.12+power*.05);
        gl_FragColor=vec4(col,min(.94,glow));}`
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
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
      uniforms: { map: { value: engraving }, t: clock, energy, power, restored: { value: 0 }, offset: { value: i * 2.1 } },
      vertexShader: `attribute float face;varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying float vFace;
        void main(){vUv=uv;vFace=face;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform sampler2D map;uniform float t;uniform float energy;uniform float power;uniform float restored;uniform float offset;varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying float vFace;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
        float nebula(vec2 p){return noise(p)*.55+noise(p*2.03+7.)*.27+noise(p*4.13-3.)*.13;}
        void main(){vec3 n=normalize(vN),v=normalize(vV),r=reflect(-v,n);float rim=pow(1.-abs(dot(n,v)),2.5);
          float glint=pow(max(dot(r,normalize(vec3(-.4,.7,.7))),0.),38.)+pow(max(dot(r,normalize(vec3(.6,-.4,.7))),0.),60.)*.55;
          float cloud=smoothstep(.23,.78,nebula(vec2(vUv.x*30.+offset+t*.012,vUv.y*3.4+sin(vUv.x*16.+offset)*.8)));
          float violet=smoothstep(.42,.84,nebula(vec2(vUv.x*13.-offset,vUv.y*1.8+cos(vUv.x*9.+offset)*.6)));
          float lip=pow(abs(vUv.y-.5)*2.,7.)*vFace;
          float etch=texture2D(map,vUv).a*vFace;float filament=pow(.5+.5*cos(vUv.x*6.283185-t*.18+offset),18.);
          vec3 col=mix(vec3(.3,.46,.8),vec3(.56,.42,.86),violet*.75);col=mix(col,vec3(.7,.8,.97),rim*.5+glint*.25+lip*.4);
          col=mix(col,vec3(.86,.75,.58),etch*.55+restored*.04);
          float a=(.045+rim*.4+glint*.42+cloud*.11+violet*.12+lip*.2+etch*.3+restored*.025)*(gl_FrontFacing?1.:.22)*(1.+energy*.12);
          a+=etch*filament*.08;gl_FragColor=vec4(col,a);}`
    });
    pivot.add(new THREE.Mesh(band.geo, mat));
    // Rounded champagne beads finish both edges of the glass.
    for (const z of [-edgeZ, edgeZ]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(edgeRadius, .075, 12, 256), goldRimMaterial);
      rim.position.z = z; pivot.add(rim);
    }
    threads([circle(edgeRadius, 192, 0, TAU, edgeZ), circle(edgeRadius, 192, 0, TAU, -edgeZ)], { parent: pivot, color: '#FFD79A', width: 1.05, opacity: .25, shimmer: 1 });
    const glints = [edgeZ, -edgeZ].flatMap(z => circle(edgeRadius, 14, i * .73, TAU + i * .73, z).slice(0, -1));
    sparks(pivot, glints, { size: .82, opacity: .9, color: '#FFD88A', twinkle: 1 });
    // A degree ruler engraved just inside one edge of the outer face.
    const ruler = [], half = spec.w / 2 / spec.r, face = spec.r + depth / 2 + .015;
    for (let j = 0; j < 96; j++) {
      const a = j / 96 * TAU, l0 = half * .9, l1 = l0 - (j % 8 ? .16 : .36) / spec.r;
      ruler.push([l0, l1].map(l => [Math.cos(a) * Math.cos(l) * face, Math.sin(a) * Math.cos(l) * face, Math.sin(l) * face]));
    }
    threads(ruler, { parent: pivot, opacity: .46, width: .14, flow: 0 });
    return { pivot, gimbal, axis: new THREE.Vector3(...spec.axis).normalize(), speed: spec.speed, mat, radius: spec.r, depth, slots: [] };
  });

  // The reference globe stays delicate: four great circles, tiny angular marks,
  // and a few jewel-like junctions. Its long pole establishes the vertical axis.
  const frame = new THREE.Group(); armillary.add(frame);
  const FR = 12.45;
  for (const tilt of [[0, 0, 0], [0, .97, 0], [0, -1.06, 0], [1.32, 0, .1]]) {
    const p = new THREE.Group(); p.rotation.set(...tilt); frame.add(p);
    p.add(new THREE.Mesh(new THREE.TorusGeometry(FR, .032, 8, 192), goldRimMaterial));
    threads([circle(FR)], { parent: p, color: '#FFD79A', width: .7, opacity: .2, shimmer: 1 });
    sparks(p, circle(FR, 10).slice(0, -1), { size: .65, opacity: .7, color: '#FFD88A', twinkle: 1 });
  }
  const graduations = [];
  for (let i = 0; i < 144; i++) {
    const a = i / 144 * TAU, end = FR + (i % 12 ? .065 : .19);
    graduations.push([[Math.cos(a) * FR, Math.sin(a) * FR, 0], [Math.cos(a) * end, Math.sin(a) * end, 0]]);
  }
  threads(graduations, { parent: frame, width: .15, opacity: .55, flow: 0 });
  // The polar axis and the equatorial diameter cross at the core, as in the art.
  threads([[[0, -15.5, 0], [0, 15.5, 0]]], { parent: frame, width: .19, opacity: .7, flow: .08 });
  threads([[[-13.55, 0, 0], [13.55, 0, 0]]], { parent: frame, width: .16, opacity: .5, flow: .08 });
  // Loose orbit arcs and their small spurs reach just past the globe.
  for (const [r, a0, a1, tilt] of [[13.15, 2.25, 3.95, [.1, .35, .18]], [12.95, -.55, .75, [.3, -.5, 0]], [13.45, 3.7, 4.45, [-.2, .85, .1]]]) {
    const p = new THREE.Group(); p.rotation.set(...tilt); frame.add(p);
    const arc = circle(r, 96, a0, a1), spurs = [];
    for (let a = a0 + .05; a < a1; a += .09) spurs.push([[Math.cos(a) * r, Math.sin(a) * r, 0], [Math.cos(a) * (r + .22), Math.sin(a) * (r + .22), 0]]);
    threads([arc], { parent: p, width: .13, opacity: .42, flow: .14 });
    threads(spurs, { parent: p, width: .1, opacity: .3, flow: 0 });
    sparks(p, [arc[0], arc[48], arc[96]], { size: .55, opacity: .75, color: '#FFD88A', twinkle: 1 });
  }

  const jewelMat = crystal({ color: '#A3B9DB', body: .85, edge: .12 });
  function jewel(parent, point, radius = .27) {
    const geo = withEdges(new THREE.IcosahedronGeometry(radius, 1)); const mesh = solid(new THREE.Mesh(geo, jewelMat));
    mesh.position.set(...point); parent.add(mesh); return mesh;
  }
  const polePoints = [[0, -13.9, 0], [0, -FR, 0], [0, FR, 0], [0, 13.9, 0], [0, -15.35, 0], [0, 15.35, 0]];
  polePoints.slice(0, 4).forEach(p => jewel(frame, p, p[1] ** 2 > 13 ** 2 ? .36 : .27));
  sparks(frame, polePoints, { size: 1.28, opacity: 1 });
  for (const y of [-13.9, -FR, FR, 13.9]) {
    const path = circle(.31, 48).map(([x, py, z]) => [x, py + y, z]);
    threads([path], { parent: frame, width: .15, opacity: .55, flow: 0 });
  }
  // Pearls with star medallions close the equatorial diameter.
  for (const x of [-13.55, 13.55]) {
    const holder = new THREE.Group(); holder.position.x = x; frame.add(holder); jewel(holder, [0, 0, 0], .34);
    threads(medallion(0, .5), { parent: holder, opacity: .62, width: .14, flow: 0 });
    sparks(holder, [[0, 0, 0]], { size: 1.35, opacity: 1 });
  }

  // The jewel spans about a third of the globe, so the armillary reads first
  // and the core stays a small, intense heart. Each solid nests in the last.
  const core = new THREE.Group(); core.scale.setScalar(.78); core.rotation.set(.03, 0, .1); group.add(core);
  const alignment = new THREE.Group(); alignment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, (1 + Math.sqrt(5)) / 2).normalize(), new THREE.Vector3(0, 0, 1)); core.add(alignment);
  const coreShapes = [new THREE.IcosahedronGeometry(4.05, 0), new THREE.DodecahedronGeometry(3.2, 0), new THREE.OctahedronGeometry(2.4, 0), rhombicTriacontahedron(1.32)];
  coreShapes.forEach((geo, i) => {
    const holder = new THREE.Group(); holder.rotation.set(0, i === 2 ? Math.PI / 4 : 0, 0); alignment.add(holder);
    const g = withEdges(geo), normals = g.attributes.normal;
    const seeds = new Float32Array(normals.count);
    for (let j = 0; j < normals.count; j++) seeds[j] = normals.getX(j) * 11 + normals.getY(j) * 23 + normals.getZ(j) * 17;
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    g.setAttribute('cut', new THREE.BufferAttribute(new Float32Array(normals.count), 1));
    for (const side of [THREE.BackSide, THREE.FrontSide]) {
      const material = crystalMaterial({ radius: [4.05, 3.2, 2.4, 1.32][i], tint: i % 2 ? '#ADB5E8' : '#A2C4E9', opacity: i === 0 ? 1.04 : .86, side, energy });
      const surface = new THREE.Mesh(g, material);
      surface.userData.solid = side === THREE.FrontSide;
      surface.renderOrder = side === THREE.BackSide ? 10 + i : 45 - i;
      surface.onBeforeRender = (_renderer, _scene, camera) => {
        camera.getWorldPosition(material.uniforms.localCamera.value);
        surface.worldToLocal(material.uniforms.localCamera.value);
      };
      holder.add(surface);
    }
    const edges = new THREE.EdgesGeometry(geo, 1).attributes.position, paths = [];
    for (let j = 0; j < edges.count; j += 2) paths.push([[edges.getX(j), edges.getY(j), edges.getZ(j)], [edges.getX(j + 1), edges.getY(j + 1), edges.getZ(j + 1)]]);
    threads(paths, { parent: holder, color: i % 2 ? '#91A8D0' : '#A69CBF', opacity: .45 + i * .018, width: .17, flow: .09 });
    // The outer jewel's corners catch light like the points of a star.
    sparks(holder, corners(geo).map(v => v.toArray()), i ? { size: .3, opacity: .6, color: i % 2 ? '#9FBBDD' : '#AEAAD0' } : { size: .5, opacity: .85, color: '#C3CCEB' }); geo.dispose();
  });
  const heartGlow = sprite(core, '#8BA3D6', 8.5, .34);
  const heartPoint = sprite(core, '#D8E4FA', 2.7, .78);
  const heartRays = sprite(core, '#B9CCF0', 9, .2, rayTex);
  heartGlow.renderOrder = heartPoint.renderOrder = heartRays.renderOrder = 50;
  sparks(core, [[0, 0, 0]], { size: 2.6, opacity: .8, color: '#C4D5F2' });

  // A small celestial frame around the jewel: from the front its three circles
  // read as a ring and a cross, matching the art's diagram around the core.
  const halo = new THREE.Group(); group.add(halo);
  for (const tilt of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
    const p = new THREE.Group(); p.rotation.set(...tilt); halo.add(p);
    threads([circle(4.15, 128)], { parent: p, color: '#ABA6D6', width: .13, opacity: .34, flow: .1 });
  }
  threads([circle(4.6, 128)], { parent: halo, color: '#ABA6D6', width: .1, opacity: .22, flow: 0 });
  sparks(halo, [[4.15, 0, 0], [-4.15, 0, 0], [0, 4.15, 0], [0, -4.15, 0], [0, 0, 4.15], [0, 0, -4.15]], { size: .42, opacity: .75, color: '#C9D3F0' });

  const dust = [];
  for (let i = 0; i < 120; i++) {
    const a = i * 2.399963, h = 1 - 2 * (i + .5) / 120, r = 5.2 + random() * 6.6, s = Math.sqrt(1 - h * h);
    dust.push([Math.cos(a) * r * s, h * r, Math.sin(a) * r * s]);
  }
  sparks(armillary, dust, { size: .22, opacity: .32, color: '#A8B9ED' });

  // Chapter jewels sit mid-band, their medallions lying on the outer face.
  const slots = main.map((relic, i) => {
    const ring = rings[i % rings.length], a = (Math.floor(i / rings.length) ? .78 : .28) * TAU + i * .4;
    const holder = new THREE.Group(); holder.position.set(Math.cos(a) * ring.radius, Math.sin(a) * ring.radius, 0);
    holder.rotation.set(0, Math.PI / 2, a, 'ZYX'); ring.pivot.add(holder); jewel(holder, [0, 0, 0], .3);
    const glow = sparks(holder, [[0, 0, 0]], { size: 1.55, opacity: 1 });
    threads(medallion(ring.depth / 2 + .02), { parent: holder, opacity: .62, width: .14, flow: 0 });
    const slot = { relic, glow, lit: 0, target: 0, flash: 0, color: C(relic.color).lerp(gold, .65) };
    ring.slots.push(slot); return slot;
  });
  let rotation = 0, orbitTime = 0;
  function update(dt, T, { power: p, speak, flash, finale }) {
    clock.value = T * motion; energy.value = speak + flash * .35; power.value = p;
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
      s.glow.uniforms.col.value.copy(gold).lerp(s.color, s.lit * .35).lerp(ice, finale * .25);
      s.glow.uniforms.opacity.value = 1 + s.lit * .12 + s.flash * .12;
    });
    rings.forEach(r => { r.mat.uniforms.restored.value = r.slots.reduce((sum, s) => sum + s.lit, 0) / (r.slots.length || 1); });
    heartGlow.material.opacity = .32 + speak * .05 + flash * .05;
    haze.material.opacity = .28 + p * .025; aura.material.opacity = .15 + p * .02 + speak * .02;
  }
  return { group, update, receive(relic) { const s = slots.find(x => x.relic === relic); if (s) { s.target = 1; s.flash = 1; } }, bloom() { slots.forEach(s => s.flash = 1); } };
}
