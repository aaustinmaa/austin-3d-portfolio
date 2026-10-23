import * as THREE from 'three';

// Seeded randomness and value noise. The seed is fixed so the valley is the same on every visit.
let seed = 23;
function rand(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function hash(x,y){ const s = Math.sin(x*127.1 + y*311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x,y){ const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi; const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const a=hash(xi,yi), b=hash(xi+1,yi), c=hash(xi,yi+1), d=hash(xi+1,yi+1); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
function fbm(x,y){ let t=0, a=.5, f=1; for (let i=0;i<4;i++){ t+=a*vnoise(x*f,y*f); f*=2; a*=.5; } return t/.9375; }
const sstep = (a,b,x) => { const t=Math.min(1,Math.max(0,(x-a)/(b-a))); return t*t*(3-2*t); };
const lerp = (a,b,t) => a+(b-a)*t;
const ease = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const C = h => new THREE.Color(h);
const mixHex = (a,b,t) => C(a).lerp(C(b), t);
const randUnit = () => { const u = rand()*2-1, a = rand()*Math.PI*2, r = Math.sqrt(1-u*u); return new THREE.Vector3(r*Math.cos(a), u, r*Math.sin(a)); };


export { rand, hash, vnoise, fbm, sstep, lerp, ease, C, mixHex, randUnit };
