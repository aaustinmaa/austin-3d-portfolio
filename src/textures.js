import * as THREE from 'three';
import { rand } from './noise.js';

// Canvas-drawn textures: soft glows, light rays, runes, sigils, paper and dials.
const canvas2d = (w, h=w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
export function radialTex(stops, size=128){ const [c,g] = canvas2d(size);
  const gr=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2); stops.forEach(([o,col])=>gr.addColorStop(o,col)); g.fillStyle=gr; g.fillRect(0,0,size,size); return new THREE.CanvasTexture(c); }
const glowTex = radialTex([[0,'rgba(255,255,255,1)'],[.2,'rgba(255,255,255,.7)'],[.5,'rgba(255,255,255,.18)'],[1,'rgba(255,255,255,0)']]);
const softTex = radialTex([[0,'rgba(255,255,255,1)'],[.45,'rgba(255,255,255,.4)'],[1,'rgba(255,255,255,0)']], 64);
const hazeTex = radialTex([[0,'rgba(255,255,255,.55)'],[.25,'rgba(255,255,255,.22)'],[.6,'rgba(255,255,255,.05)'],[1,'rgba(255,255,255,0)']], 256);
const ringTex = radialTex([[0,'rgba(255,255,255,0)'],[.80,'rgba(255,255,255,0)'],[.9,'rgba(255,255,255,1)'],[.94,'rgba(255,255,255,.35)'],[1,'rgba(255,255,255,0)']], 256);

/* thin light rays streaming out of a centre, for the star's ray fan */
const rayTex = (() => { const s = 512, [c,g] = canvas2d(s); g.translate(s/2, s/2); g.globalCompositeOperation = 'lighter';
  for (let i=0;i<150;i++){ const a = rand()*Math.PI*2, len = s*(.16 + Math.pow(rand(),1.6)*.34), w = .004 + rand()*.014;
    const gr = g.createLinearGradient(0,0,Math.cos(a)*len,Math.sin(a)*len); gr.addColorStop(0,`rgba(255,255,255,${.10+rand()*.22})`); gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0,0); g.lineTo(Math.cos(a-w)*len, Math.sin(a-w)*len); g.lineTo(Math.cos(a+w)*len, Math.sin(a+w)*len); g.closePath(); g.fill(); }
  return new THREE.CanvasTexture(c); })();

const runeTex = (() => { const w=1024, h=96, [c,g] = canvas2d(w,h);
  g.strokeStyle='#fff'; g.lineCap='round'; g.lineWidth=4; g.shadowColor='#fff'; g.shadowBlur=6;
  for (let x=20; x<w-20; x+=34+rand()*10){ const s=26; g.beginPath(); const n=2+Math.floor(rand()*3); let px=x, py=h/2-s/2+rand()*s;
    g.moveTo(px,py); for (let i=0;i<n;i++){ px = x + rand()*s*.8; py = h/2 - s/2 + rand()*s; g.lineTo(px,py); } g.stroke();
    if (rand()<.4){ g.beginPath(); g.arc(x+s*.4, h/2, 4, 0, Math.PI*2); g.stroke(); } }
  g.globalAlpha=.6; g.lineWidth=2; g.beginPath(); g.moveTo(0,14); g.lineTo(w,14); g.moveTo(0,h-14); g.lineTo(w,h-14); g.stroke();
  const t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; return t; })();

/* a sigil of nested convex polygons (hexagon, pentagon, square, triangle) inside a ticked 24-gon, used on the book
   cover and behind the star */
const sigilTex = (() => { const s = 512, [c,g] = canvas2d(s); g.translate(s/2,s/2); g.strokeStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 8; g.lineCap = 'round'; g.lineJoin = 'round';
  const poly = (n, r, rot=-Math.PI/2, step=1, lw=2.5) => { g.lineWidth = lw; g.beginPath(); for (let i=0;i<=n;i++){ const a = rot + (i*step % n)/n*Math.PI*2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a)*r*s, Math.sin(a)*r*s); } g.stroke(); };
  poly(24, .47, 0, 1, 4); poly(24, .43, Math.PI/24, 1, 1.5);
  g.lineWidth = 2; for (let i=0;i<24;i++){ const a = i/24*Math.PI*2; g.beginPath(); g.moveTo(Math.cos(a)*.43*s, Math.sin(a)*.43*s); g.lineTo(Math.cos(a)*.47*s, Math.sin(a)*.47*s); g.stroke(); }
  poly(6, .4, -Math.PI/2, 1, 3); poly(5, .3, -Math.PI/2, 1, 2.5); poly(4, .21, Math.PI/4, 1, 2); poly(3, .13, -Math.PI/2, 1, 2);
  for (let i=0;i<12;i++) rand(); /* the earlier sigil drew 12 random values; keep the seeded sequence so the valley layout does not shift */
  return new THREE.CanvasTexture(c); })();

/* the astrolabe's dial: degree ticks, hour ring and a cut-out star map */
const dialTex = (() => { const s = 512, [c,g] = canvas2d(s); g.translate(s/2,s/2); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  [[.48,6],[.40,2],[.25,2]].forEach(([r,lw]) => { g.lineWidth = lw; g.beginPath(); g.arc(0,0,r*s,0,Math.PI*2); g.stroke(); });
  for (let i=0;i<120;i++){ const a = i/120*Math.PI*2, r0 = i%10 ? .445 : .41; g.lineWidth = i%10 ? 1.5 : 3; g.beginPath(); g.moveTo(Math.cos(a)*r0*s, Math.sin(a)*r0*s); g.lineTo(Math.cos(a)*.475*s, Math.sin(a)*.475*s); g.stroke(); }
  g.lineWidth = 2.5; g.beginPath(); g.ellipse(0, -.05*s, .3*s, .28*s, 0, 0, Math.PI*2); g.stroke();
  for (let i=0;i<18;i++){ const a = rand()*Math.PI*2, r = (.08 + rand()*.27)*s; g.beginPath(); g.arc(Math.cos(a)*r, Math.sin(a)*r, 3 + rand()*4, 0, Math.PI*2); g.fill(); }
  for (let i=0;i<4;i++){ g.save(); g.rotate(i*Math.PI/2); g.beginPath(); g.moveTo(0,-.38*s); g.lineTo(10,-.30*s); g.lineTo(0,-.27*s); g.lineTo(-10,-.30*s); g.closePath(); g.fill(); g.restore(); }
  return new THREE.CanvasTexture(c); })();

/* a folded letter with lines of handwriting */
const paperTex = (() => { const w = 256, h = 192, [c,g] = canvas2d(w,h);
  g.fillStyle = '#EDE6D6'; g.fillRect(0,0,w,h); g.strokeStyle = 'rgba(40,90,110,.75)'; g.lineWidth = 2.2; g.lineCap = 'round';
  for (let y=30; y<h-20; y+=19){ let x = 22; g.beginPath(); g.moveTo(x,y); const end = y > h-50 ? w*.5 : w-24 - rand()*30;
    while (x < end){ const nx = x + 6 + rand()*10; g.quadraticCurveTo((x+nx)/2, y - 5 - rand()*6, nx, y + (rand()-.5)*3); x = nx + (rand()<.15 ? 8 : 0); if (rand()<.15) g.moveTo(x,y); } g.stroke(); }
  return new THREE.CanvasTexture(c); })();

/* the wax seal's embossed W */
const sealTex = (() => { const s = 128, [c,g] = canvas2d(s); g.fillStyle = '#fff'; g.font = '600 78px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('W', s/2, s/2+4);
  g.lineWidth = 4; g.strokeStyle = '#fff'; g.beginPath(); g.arc(s/2,s/2,s*.44,0,Math.PI*2); g.stroke(); return new THREE.CanvasTexture(c); })();

/* ripstop nylon: a fine weave with a slightly heavier grid every few threads, used as the doll's fabric bump map
   (its own random numbers, so the shared seeded sequence and the valley layout stay unchanged) */
const fabricTex = (() => { let sd = 7; const r = () => (sd = sd*16807 % 2147483647)/2147483647; const s = 256, [c,g] = canvas2d(s); g.fillStyle = '#808080'; g.fillRect(0,0,s,s);
  for (let y=0;y<s;y+=2){ g.fillStyle = `rgba(255,255,255,${.05 + r()*.05})`; g.fillRect(0,y,s,1); }
  for (let x=0;x<s;x+=2){ g.fillStyle = `rgba(0,0,0,${.05 + r()*.05})`; g.fillRect(x,0,1,s); }
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.2; for (let i=0;i<=s;i+=32){ g.beginPath(); g.moveTo(i,0); g.lineTo(i,s); g.moveTo(0,i); g.lineTo(s,i); g.stroke(); }
  for (let i=0;i<900;i++){ g.fillStyle = `rgba(${r()<.5 ? '0,0,0' : '255,255,255'},.06)`; g.fillRect(r()*s, r()*s, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();

export { fabricTex, glowTex, softTex, hazeTex, ringTex, rayTex, runeTex, sigilTex, dialTex, paperTex, sealTex };
