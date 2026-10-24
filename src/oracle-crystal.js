import * as THREE from 'three';

// Optical material adapted from oracle-jewel/src/oracle-optics.js.
// Keep option A geometry; reuse its clear reflections, dispersion and internal veins.
// The lighting environment is analytic and fixed in world space. Camera motion
// therefore moves the reflections across each genuinely cut 3D facet. Fresnel,
// separated RGB refraction and the internal source share the same face normal.
export function crystalMaterial({ radius, tint = '#9FBFE8', opacity = 1, side = THREE.FrontSide, energy = { value: 0 } }) {
  return new THREE.ShaderMaterial({
    side, transparent: true, depthWrite: false, blending: THREE.NormalBlending, fog: false,
    uniforms: {
      tint: { value: new THREE.Color(tint) }, radius: { value: radius },
      opacity: { value: opacity }, energy,
      localCamera: { value: new THREE.Vector3() }
    },
    vertexShader: `
      attribute float cut; attribute float seed;
      varying vec3 vP; varying vec3 vN; varying vec3 vWN;
      varying vec3 vWP; varying float vCut; varying float vSeed;
      void main() {
        vP = position; vN = normal; vCut = cut; vSeed = seed;
        vWN = normalize(mat3(modelMatrix) * normal);
        vec4 world = modelMatrix * vec4(position, 1.); vWP = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 tint; uniform float radius; uniform float opacity;
      uniform float energy; uniform vec3 localCamera;
      varying vec3 vP; varying vec3 vN; varying vec3 vWN;
      varying vec3 vWP; varying float vCut; varying float vSeed;
      float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      vec3 environment(vec3 d) {
        float cloud = noise(d * 7.) * .68 + noise(d * 19.) * .32;
        vec3 c = mix(vec3(.025,.037,.095), vec3(.22,.32,.59), cloud * cloud);
        float ribbon = exp(-pow((d.y + d.x * .46 - .16) / .095, 2.));
        float silk = exp(-pow((d.y - d.x * .68 + .39) / .027, 2.));
        c += vec3(.68,.82,1.) * ribbon * (.48 + 1.3 * cloud);
        c += vec3(.61,.54,1.) * silk * 1.1;
        c += vec3(1.,.86,.59) * pow(max(dot(d, normalize(vec3(-.55,.7,.45))), 0.), 48.) * 2.4;
        c += vec3(.69,.85,1.) * pow(max(dot(d, normalize(vec3(.65,.18,.73))), 0.), 80.) * 2.;
        c += vec3(.42,.52,.91) * pow(max(dot(d, normalize(vec3(-.4,-.63,-.66))), 0.), 28.) * .8;
        return c;
      }
      void main() {
        vec3 n = normalize(vWN), localN = normalize(vN);
        if (!gl_FrontFacing) { n = -n; localN = -localN; }
        vec3 view = normalize(cameraPosition - vWP), localView = normalize(localCamera - vP);
        float fresnel = .055 + .945 * pow(1. - abs(dot(n, view)), 4.);
        vec3 reflected = environment(reflect(-view, n));
        vec3 rr = refract(-view, n, .676), rg = refract(-view, n, .664), rb = refract(-view, n, .651);
        vec3 transmitted = vec3(environment(rr).r, environment(rg).g, environment(rb).b);
        vec3 p = vP / radius;
        vec3 warp = vec3(noise(p*3.1), noise(p*3.1+4.), noise(p*3.1+8.));
        vec3 q = p * 13. + warp * 3.5;
        float cloud = noise(q) * .56 + noise(q * 2.13) * .28 + noise(q * 4.67) * .11 + noise(q * 10.1) * .05;
        float fog = smoothstep(.43,.74,cloud);
        float web = exp(-abs(cloud-.515)*165.) * smoothstep(.3,.66,noise(p*7.+vSeed));
        float fracture = exp(-abs(cloud - .52) * 105.);
        float silk = exp(-abs(noise(p * 13. + vSeed) - .5) * 135.);
        float lamina = pow(.5 + .5 * sin(dot(p, vec3(11.,23.,17.)) + cloud * 15.), 24.);
        vec3 ray = refract(-localView, localN, .665);
        float travel = max(0., dot(-p, ray));
        float source = exp(-dot(p + ray * travel, p + ray * travel) * 230.) * .11;
        float cutLight = vCut * (.1 + pow(max(dot(n, normalize(vec3(-.5,.7,.6))), 0.), 6.) * .65);
        vec3 c = tint * (.07 + cloud * .12) + transmitted * .65 + reflected * (1.6 + fresnel * 1.9);
        c += mix(vec3(.32,.46,.98), vec3(1.1,1.45,1.8), cloud) * fog * .12;
        c += vec3(.9,1.22,1.6) * (web*.45 + fracture*.08 + lamina*.04 + silk*.03);
        c += vec3(.94,.92,.78) * (cutLight + source * (1. + energy * .3));
        float a = (.09 + fresnel * .29 + length(reflected) * .24 + vCut * .15 + source * .18 + web * .05 + fog * .07) * opacity;
        a *= gl_FrontFacing ? 1. : .55;
        gl_FragColor = vec4(c, min(.84, a));
      }`
  });
}

