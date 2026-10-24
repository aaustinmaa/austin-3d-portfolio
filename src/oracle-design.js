import * as THREE from 'three';
import { glowTex, hazeTex } from './textures.js';
import { withEdges, corners, rhombicTriacontahedron } from './polyhedra.js';

// Option A: crystal armillary ribbons, fine champagne filaments and a nested
// luminous jewel. All curves and glass surfaces exist in world space.
export function buildOracleDesign({ main, reduceMotion }) {
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
  function threads(paths, { parent = group, color = gold, opacity = .72, width = .3, flow = .12 } = {}) {
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
      uniforms: { t: clock, energy, power, col: { value: C(color) }, opacity: { value: opacity }, width: { value: width }, flow: { value: flow } },
      vertexShader: `attribute vec3 tangent; attribute float seed; uniform float width; varying vec2 vUv; varying float vSeed;
        void main(){vUv=uv;vSeed=seed;vec4 mv=modelViewMatrix*vec4(position,1.);vec2 d=(modelViewMatrix*vec4(tangent,0.)).xy;
          d/=max(length(d),.001);mv.xy+=vec2(-d.y,d.x)*(uv.y-.5)*width;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform float t;uniform float energy;uniform float power;uniform vec3 col;uniform float opacity;uniform float flow;varying vec2 vUv;varying float vSeed;
        void main(){float p=abs(vUv.y-.5)*2.;float sigma=max(.055,fwidth(vUv.y)*.65);float thread=exp(-pow((vUv.y-.5)/sigma,2.))+.075*exp(-p*p*3.5);
          float glint=pow(.5+.5*cos(vUv.x*6.283185-t*.22+vSeed),28.);
          float a=thread*opacity*(1.12+glint*flow+energy*.16+power*.05);
          gl_FragColor=vec4(mix(col,vec3(.76,.81,.93),glint*.22),a);}`
    });
    const mesh = new THREE.Mesh(geo, mat); parent.add(mesh); return mat;
  }
  const circle = (r, n = 192, a0 = 0, a1 = TAU) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / n; return [Math.cos(a) * r, Math.sin(a) * r, 0];
  });
  function sparks(parent, points, { size = .65, opacity = .8, color = gold } = {}) {
    const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(points.map((_, i) => i * 1.791), 1));
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { t: clock, energy, px: { value: px }, size: { value: size }, opacity: { value: opacity }, col: { value: C(color) } },
      vertexShader: `attribute float seed;uniform float t;uniform float energy;uniform float px;uniform float size;varying float vLight;
        void main(){vLight=.86+.14*sin(seed+t*.6);vec4 mv=modelViewMatrix*vec4(position,1.);
          gl_PointSize=clamp(size*px*850./max(1.,-mv.z),1.,56.*px);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform vec3 col;uniform float opacity;varying float vLight;
        void main(){vec2 p=gl_PointCoord-.5;float d=dot(p,p);float ray=(exp(-abs(p.x)*95.)*exp(-abs(p.y)*6.)+exp(-abs(p.y)*95.)*exp(-abs(p.x)*6.))*.65;
          float a=(exp(-d*90.)+exp(-d*13.)*.2+ray)*opacity*vLight;gl_FragColor=vec4(mix(col,vec3(.78,.79,1.),exp(-d*100.)*.35),a);}`
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

  // A dense blue center supplies real depth, so rear rings and rear filaments
  // disappear behind it instead of accumulating into a transparent wire ball.
  function solidCrystal() {
    return new THREE.ShaderMaterial({ depthWrite: true, side: THREE.FrontSide, fog: false,
      uniforms: { energy, power },
      vertexShader: `varying vec3 vN;varying vec3 vV;varying vec2 vCenter;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=-mv.xyz;
          vCenter=mv.xy-(modelViewMatrix*vec4(0.,0.,0.,1.)).xy;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform float energy;uniform float power;varying vec3 vN;varying vec3 vV;varying vec2 vCenter;
        void main(){vec3 n=normalize(vN),v=normalize(vV),r=reflect(-v,n);
          float key=max(dot(n,normalize(vec3(-.5,.8,.65))),0.);
          float fill=max(dot(n,normalize(vec3(.65,-.2,.5))),0.);
          float rim=pow(1.-max(dot(n,v),0.),3.);
          float spec=pow(max(dot(r,normalize(vec3(-.5,.8,.65))),0.),42.);
          float heart=exp(-dot(vCenter,vCenter)*.3);
          vec3 col=mix(vec3(.035,.065,.14),vec3(.19,.32,.49),key*.8+fill*.22);
          col+=vec3(.055,.075,.14)*rim+vec3(.28,.4,.57)*spec*.55;
          col+=vec3(.15,.27,.43)*heart*(.6+energy*.25+power*.12);
          gl_FragColor=vec4(col,1.);}`
    });
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
  function bandGeometry(radius, width) {
    const section = [[-.5, 0], [-.42, -.045], [0, -.075], [.42, -.045], [.5, 0], [.42, .065], [0, .105], [-.42, .065]];
    const pos = [], uv = [], N = 224;
    const push = (a, j, u) => { const [x, z] = section[j % 8]; pos.push(Math.cos(a) * (radius + x * width), Math.sin(a) * (radius + x * width), z); uv.push(u, x + .5); };
    for (let i = 0; i < N; i++) for (let j = 0; j < 8; j++) {
      const a = i / N * TAU, b = (i + 1) / N * TAU, u = i / N, v = (i + 1) / N;
      push(a, j, u); push(b, j, v); push(a, j + 1, u); push(a, j + 1, u); push(b, j, v); push(b, j + 1, v);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals(); return geo;
  }
  const rings = [
    { r: 10.5, w: 1.22, tilt: [.78, .32, -.48], axis: [.3, 1, .2], speed: .1 },
    { r: 10.7, w: 1.13, tilt: [-.59, .58, .65], axis: [1, .25, -.3], speed: -.085 },
    { r: 10.9, w: .92, tilt: [.2, 1.16, -.3], axis: [-.2, .45, 1], speed: .095 },
  ].map((spec, i) => {
    const gimbal = new THREE.Group(); armillary.add(gimbal);
    const pivot = new THREE.Group(); pivot.rotation.set(...spec.tilt); gimbal.add(pivot);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
      uniforms: { map: { value: engraving }, t: clock, energy, power, restored: { value: 0 }, offset: { value: i * 2.1 } },
      vertexShader: `varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying float vFace;
        void main(){vUv=uv;vFace=abs(normal.z);vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform sampler2D map;uniform float t;uniform float energy;uniform float power;uniform float restored;uniform float offset;varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying float vFace;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
        float nebula(vec2 p){return noise(p)*.55+noise(p*2.03+7.)*.27+noise(p*4.13-3.)*.13;}
        void main(){vec3 n=normalize(vN),v=normalize(vV),r=reflect(-v,n);float rim=pow(1.-abs(dot(n,v)),2.);
          float glint=pow(max(dot(r,normalize(vec3(-.4,.7,.7))),0.),38.)+pow(max(dot(r,normalize(vec3(.6,-.4,.7))),0.),60.)*.55;
          float cloud=smoothstep(.23,.78,nebula(vec2(vUv.x*30.+offset+t*.012,vUv.y*3.4+sin(vUv.x*16.+offset)*.8)));
          float etch=texture2D(map,vUv).a*smoothstep(.5,.85,vFace);float filament=pow(.5+.5*cos(vUv.x*6.283185-t*.18+offset),18.);
          vec3 col=mix(vec3(.3,.48,.78),vec3(.52,.44,.76),cloud*.35);col=mix(col,vec3(.64,.76,.94),rim*.45+glint*.2);
          col=mix(col,vec3(.8,.68,.51),etch*.5+restored*.04);
          float a=(.115+rim*.28+glint*.38+cloud*.17+etch*.22+restored*.025)*(gl_FrontFacing?1.:.22)*(1.+energy*.12);
          a+=etch*filament*.08;gl_FragColor=vec4(col,a);}`
    });
    pivot.add(new THREE.Mesh(bandGeometry(spec.r, spec.w), mat));
    threads([circle(spec.r - spec.w / 2), circle(spec.r + spec.w / 2)], { parent: pivot, opacity: .9, width: .27, flow: .22 });
    const ruler = [];
    for (let j = 0; j < 84; j++) {
      const a = j / 84 * TAU, inner = spec.r - spec.w * .43, outer = inner + (j % 7 ? .12 : .27);
      ruler.push([[Math.cos(a) * inner, Math.sin(a) * inner, .12], [Math.cos(a) * outer, Math.sin(a) * outer, .12]]);
    }
    threads(ruler, { parent: pivot, opacity: .46, width: .14, flow: 0 });
    return { pivot, gimbal, axis: new THREE.Vector3(...spec.axis).normalize(), speed: spec.speed, mat, radius: spec.r };
  });

  // The reference globe stays delicate: four great circles, tiny angular marks,
  // and a few jewel-like junctions. Its long pole establishes the vertical axis.
  const frame = new THREE.Group(); armillary.add(frame);
  for (const tilt of [[0, 0, 0], [0, .97, 0], [0, -1.06, 0], [1.32, 0, .1]]) {
    const p = new THREE.Group(); p.rotation.set(...tilt); frame.add(p);
    threads([circle(12.05)], { parent: p, opacity: .67, width: .23, flow: .1 });
  }
  const graduations = [];
  for (let i = 0; i < 144; i++) {
    const a = i / 144 * TAU, r = 12.05, end = r + (i % 12 ? .065 : .19);
    graduations.push([[Math.cos(a) * r, Math.sin(a) * r, 0], [Math.cos(a) * end, Math.sin(a) * end, 0]]);
  }
  threads(graduations, { parent: frame, width: .15, opacity: .55, flow: 0 });
  threads([[[0, -15.15, 0], [0, 15.15, 0]]], { parent: frame, width: .19, opacity: .7, flow: .08 });

  const jewelMat = crystal({ color: '#A3B9DB', body: .85, edge: .12 });
  function jewel(parent, point, radius = .27) {
    const geo = withEdges(new THREE.IcosahedronGeometry(radius, 1)); const mesh = new THREE.Mesh(geo, jewelMat);
    mesh.position.set(...point); parent.add(mesh); return mesh;
  }
  const polePoints = [[0, -13.55, 0], [0, -12.05, 0], [0, 12.05, 0], [0, 13.55, 0], [0, -15, 0], [0, 15, 0]];
  polePoints.slice(0, 4).forEach(p => jewel(frame, p, .36));
  sparks(frame, polePoints, { size: 1.28, opacity: 1 });
  for (const y of [-13.55, -12.05, 12.05, 13.55]) {
    const path = circle(.31, 48).map(([x, py, z]) => [x, py + y, z]);
    threads([path], { parent: frame, width: .15, opacity: .55, flow: 0 });
  }

  const core = new THREE.Group(); core.scale.setScalar(1.3 * 1.3); core.rotation.set(.03, 0, .1); group.add(core);
  const alignment = new THREE.Group(); alignment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, (1 + Math.sqrt(5)) / 2).normalize(), new THREE.Vector3(0, 0, 1)); core.add(alignment);
  alignment.add(new THREE.Mesh(rhombicTriacontahedron(2.75), solidCrystal()));
  const coreShapes = [new THREE.IcosahedronGeometry(4.05, 0), new THREE.DodecahedronGeometry(3.2, 0), new THREE.OctahedronGeometry(2.4, 0), rhombicTriacontahedron(1.7)];
  coreShapes.forEach((geo, i) => {
    const holder = new THREE.Group(); holder.rotation.set(0, i === 2 ? Math.PI / 4 : 0, 0); alignment.add(holder);
    const g = withEdges(geo); holder.add(new THREE.Mesh(g, crystal({ color: ['#789DD0', '#8495C6', '#9697CE', '#869ECF'][i], body: .48 + i * .05, edge: .012 })));
    const edges = new THREE.EdgesGeometry(geo, 1).attributes.position, paths = [];
    for (let j = 0; j < edges.count; j += 2) paths.push([[edges.getX(j), edges.getY(j), edges.getZ(j)], [edges.getX(j + 1), edges.getY(j + 1), edges.getZ(j + 1)]]);
    threads(paths, { parent: holder, color: i % 2 ? '#91A8D0' : '#A69CBF', opacity: .45 + i * .018, width: .21, flow: .09 });
    sparks(holder, corners(geo).map(v => v.toArray()), { size: .3, opacity: .6, color: i % 2 ? '#9FBBDD' : '#AEAAD0' }); geo.dispose();
  });
  const heartGlow = sprite(core, '#7C94C7', 5.4, .3);
  sprite(core, '#B2C6E7', 1.25, .62);
  sparks(core, [[0, 0, 0]], { size: 2, opacity: .65, color: '#A4BEDF' });

  const dust = [];
  for (let i = 0; i < 120; i++) {
    const a = i * 2.399963, h = 1 - 2 * (i + .5) / 120, r = 5.2 + random() * 6.6, s = Math.sqrt(1 - h * h);
    dust.push([Math.cos(a) * r * s, h * r, Math.sin(a) * r * s]);
  }
  sparks(armillary, dust, { size: .22, opacity: .32, color: '#A8B9ED' });

  const slots = main.map((relic, i) => {
    const ring = rings[Math.floor(i / 2) % rings.length], a = (i % 2 ? .78 : .28) * TAU;
    const p = [Math.cos(a) * ring.radius, Math.sin(a) * ring.radius, 0];
    const holder = new THREE.Group(); holder.position.set(...p); ring.pivot.add(holder); jewel(holder, [0, 0, 0], .34);
    const glow = sparks(holder, [[0, 0, 0]], { size: 1.55, opacity: 1 });
    const medallion = [circle(.44, 64), circle(.34, 56)];
    for (let j = 0; j < 8; j++) {
      const angle = j / 8 * TAU;
      medallion.push([[Math.cos(angle) * .13, Math.sin(angle) * .13, .1], [Math.cos(angle) * .36, Math.sin(angle) * .36, .1]]);
    }
    threads(medallion, { parent: holder, opacity: .62, width: .14, flow: 0 });
    return { relic, glow, lit: 0, target: 0, flash: 0, color: C(relic.color).lerp(gold, .65) };
  });
  let rotation = 0, orbitTime = 0;
  function update(dt, T, { power: p, speak, flash, finale }) {
    clock.value = T * motion; energy.value = speak + flash * .35; power.value = p;
    rotation += dt * motion * .018 * (1 - p * .5);
    orbitTime += dt * motion;
    core.rotation.y = rotation * .7; frame.rotation.y = orbitTime * .045;
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
    rings.forEach((r, i) => { r.mat.uniforms.restored.value = (slots[i * 2]?.lit + slots[i * 2 + 1]?.lit) / 2 || 0; });
    heartGlow.material.opacity = .28 + speak * .04 + flash * .04;
    haze.material.opacity = .28 + p * .025; aura.material.opacity = .15 + p * .02 + speak * .02;
  }
  return { group, update, receive(relic) { const s = slots.find(x => x.relic === relic); if (s) { s.target = 1; s.flash = 1; } }, bloom() { slots.forEach(s => s.flash = 1); } };
}
