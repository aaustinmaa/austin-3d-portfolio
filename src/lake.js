import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/* A still, shallow-edged pool. Clear scene reflections sit over a faint cyan
   and violet sheen; the slow colour drift leaves the surface almost motionless. */
export function createLake(scene, { radius, height, groundH, reduceMotion, reflectionSize = 512 }){
  const geometry = new THREE.PlaneGeometry(radius*2, radius*2, 128, 128);
  const positions = geometry.attributes.position, depths = new Float32Array(positions.count);
  for (let i=0; i<positions.count; i++){
    const x = positions.getX(i), z = -positions.getY(i);
    depths[i] = height - groundH(x, z);
  }
  geometry.setAttribute('waterDepth', new THREE.BufferAttribute(depths, 1));

  const waves = `
    // Direction, amplitude, frequency and speed. Their derivatives give a stable
    // surface normal at every pixel, without a normal-map download or flicker.
    vec3 wave(vec2 p, vec2 direction, float amplitude, float frequency, float speed){
      float phase = dot(p, direction)*frequency + t*speed;
      return vec3(amplitude*sin(phase), amplitude*frequency*cos(phase)*direction);
    }
    vec3 surface(vec2 p){
      return wave(p, vec2(.94,.342), .0006, .75, -.035)
        + wave(p, vec2(-.4,.9165), .0003, 1.1, .028);
    }`;
  const lake = new Reflector(geometry, {
    textureWidth:reflectionSize, textureHeight:reflectionSize, clipBias:.003,
    shader:{
      uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        color:{value:new THREE.Color(0x17223D)}, tDiffuse:{value:null}, textureMatrix:{value:new THREE.Matrix4()},
        t:{value:0}, energy:{value:0}, glow:{value:0}, radius:{value:radius}, texel:{value:1/reflectionSize}
      }]),
      vertexShader:`
        uniform float t;
        uniform mat4 textureMatrix;
        attribute float waterDepth;
        varying vec3 vWorld;
        varying vec4 vReflection;
        varying float vDepth;
        #include <fog_pars_vertex>
        ${waves}
        void main(){
          vec3 p = position;
          vec4 world = modelMatrix*vec4(p, 1.);
          p.z += surface(world.xz).x*smoothstep(0., .65, waterDepth);
          vWorld = (modelMatrix*vec4(p, 1.)).xyz;
          vReflection = textureMatrix*vec4(position, 1.);
          vDepth = waterDepth;
          vec4 mvPosition = viewMatrix*vec4(vWorld, 1.);
          gl_Position = projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader:`
        uniform sampler2D tDiffuse;
        uniform float t, energy, glow, radius, texel;
        varying vec3 vWorld;
        varying vec4 vReflection;
        varying float vDepth;
        #include <fog_pars_fragment>
        ${waves}
        void main(){
          float r = length(vWorld.xz);
          if (r > radius || vDepth <= .002) discard;
          float deep = smoothstep(0., 1.7, vDepth);
          float shore = smoothstep(0., .45, vDepth);
          vec3 w = surface(vWorld.xz);
          vec3 normal = normalize(vec3(-w.y*shore, 1., -w.z*shore));
          vec3 view = normalize(cameraPosition - vWorld);
          float facing = max(dot(normal, view), 0.);
          float fresnel = .08 + .78*pow(1. - facing, 3.);

          vec2 uv = vReflection.xy/vReflection.w;
          uv += normal.xz*(.012 + .025/max(length(cameraPosition - vWorld), 2.));
          uv = clamp(uv, vec2(texel*2.), vec2(1. - texel*2.));
          vec2 blur = vec2(texel*.35, 0.);
          vec3 reflected = texture2D(tDiffuse, uv).rgb*.84;
          reflected += (texture2D(tDiffuse, uv + blur).rgb + texture2D(tDiffuse, uv - blur).rgb
            + texture2D(tDiffuse, uv + blur.yx).rgb + texture2D(tDiffuse, uv - blur.yx).rgb)*.04;
          reflected *= vec3(.95, 1.02, 1.12);

          vec3 water = mix(vec3(.055,.092,.15), vec3(.032,.05,.106), deep);
          water *= 1. + glow*.45;
          vec3 c = mix(water, reflected, (.24 + fresnel*.66)*mix(.5, 1., shore));

          // Broad, slow ribbons of colour brighten the pool without moving or
          // warping its reflected silhouettes. No fine stripes or sparkle noise.
          float flow = dot(vWorld.xz, vec2(.23, .16))
            + .8*sin(vWorld.z*.21 - vWorld.x*.12) + t*.018;
          float silk = pow(.5 + .5*sin(flow), 2.);
          vec3 sheen = mix(vec3(.014,.05,.07), vec3(.06,.024,.1), .5 + .5*sin(flow*.75 + .7));
          float veil = shore*(1. - smoothstep(radius*.5, radius, r));
          c += sheen*silk*veil*(.55 + fresnel*.45)*(.65 + glow*.25);
          vec3 moonDirection = normalize(vec3(-.6, 1., .4));
          float glint = pow(max(dot(reflect(-moonDirection, normal), view), 0.), 110.);
          c += vec3(.28,.38,.62)*glint*(.12 + glow*.12)*shore;
          float skySheen = pow(max(dot(normal, normalize(vec3(.12, 1., .18))), 0.), 60.);
          c += vec3(.018,.027,.048)*skySheen*(.3 + fresnel*.9)*shore;

          // The Oracle leaves a soft, steady pool of light on the still surface.
          float lightPool = exp(-r*r*.18)*(.035 + energy*.045 + glow*.035);
          c += vec3(.24,.55,.72)*lightPool*.75;
          float edge = (1. - smoothstep(.03, .24, vDepth))*shore;
          c += vec3(.06,.10,.16)*edge*(.6 + .4*sin(vWorld.x*3. + w.x*12.));
          float alpha = smoothstep(.002, .22, vDepth)*(1. - smoothstep(radius - .2, radius, r));
          gl_FragColor = vec4(c, alpha);
          #include <fog_fragment>
        }`
    }
  });
  lake.name = 'Lake water';
  lake.rotation.x = -Math.PI/2;
  lake.position.y = height;
  lake.material.transparent = true;
  lake.material.fog = true;
  lake.getRenderTarget().texture.minFilter = THREE.LinearMipmapLinearFilter;
  lake.getRenderTarget().texture.generateMipmaps = true;
  lake.geometry.computeBoundingSphere();
  lake.geometry.boundingSphere.radius += .05;

  // Refresh moving views immediately. With a still camera, cap the additional
  // scene pass at 24 Hz; reflection rendering also reuses the main shadow map.
  const renderReflection = lake.onBeforeRender;
  const previousPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  const previousRotation = new THREE.Quaternion();
  let elapsed = 0, lastReflection = -Infinity;
  lake.onBeforeRender = (renderer, world, camera) => {
    const moved = previousPosition.distanceToSquared(camera.position) > .000001
      || 1 - Math.abs(previousRotation.dot(camera.quaternion)) > .000001;
    if (!moved && elapsed - lastReflection < 1/24) return;
    renderReflection(renderer, world, camera);
    previousPosition.copy(camera.position); previousRotation.copy(camera.quaternion);
    lastReflection = elapsed;
  };
  scene.add(lake);
  return {
    mesh:lake,
    update(dt, time, energy, glow){
      elapsed += dt;
      const uniforms = lake.material.uniforms;
      uniforms.t.value = reduceMotion ? 0 : time;
      uniforms.energy.value = energy;
      uniforms.glow.value = glow;
    }
  };
}
