import * as THREE from 'three';
import { rand } from './noise.js';

// Canvas-drawn textures: soft glows, the eclipse corona, rune strips and the Oracle's eye.
export function radialTex(stops, size=128){ const c=document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d');
  const gr=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2); stops.forEach(([o,col])=>gr.addColorStop(o,col)); g.fillStyle=gr; g.fillRect(0,0,size,size); return new THREE.CanvasTexture(c); }
const glowTex = radialTex([[0,'rgba(255,255,255,1)'],[.2,'rgba(255,255,255,.7)'],[.5,'rgba(255,255,255,.18)'],[1,'rgba(255,255,255,0)']]);
const softTex = radialTex([[0,'rgba(255,255,255,1)'],[.45,'rgba(255,255,255,.4)'],[1,'rgba(255,255,255,0)']], 64);
const coronaTex = radialTex([[0,'rgba(0,0,0,0)'],[.40,'rgba(0,0,0,0)'],[.435,'rgba(255,255,255,1)'],[.47,'rgba(190,240,255,.75)'],[.6,'rgba(110,170,255,.22)'],[.8,'rgba(90,90,220,.06)'],[1,'rgba(0,0,0,0)']], 512);
const runeTex = (() => { const w=1024, h=96, c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d');
  g.strokeStyle='#fff'; g.lineCap='round'; g.lineWidth=4; g.shadowColor='#fff'; g.shadowBlur=6;
  for (let x=20; x<w-20; x+=34+rand()*10){ const s=26; g.beginPath(); const n=2+Math.floor(rand()*3); let px=x, py=h/2-s/2+rand()*s;
    g.moveTo(px,py); for (let i=0;i<n;i++){ px = x + rand()*s*.8; py = h/2 - s/2 + rand()*s; g.lineTo(px,py); } g.stroke();
    if (rand()<.4){ g.beginPath(); g.arc(x+s*.4, h/2, 4, 0, Math.PI*2); g.stroke(); } }
  g.globalAlpha=.6; g.lineWidth=2; g.beginPath(); g.moveTo(0,14); g.lineTo(w,14); g.moveTo(0,h-14); g.lineTo(w,h-14); g.stroke();
  const t=new THREE.CanvasTexture(c); t.wrapS=THREE.RepeatWrapping; return t; })();
const eyeTex = (() => { const s=256, c=document.createElement('canvas'); c.width=c.height=s; const g=c.getContext('2d');
  g.beginPath(); g.moveTo(8,s/2); g.quadraticCurveTo(s/2,8,s-8,s/2); g.quadraticCurveTo(s/2,s-8,8,s/2); g.closePath();
  const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.18,'rgba(200,250,255,1)'); gr.addColorStop(.42,'rgba(80,210,235,.9)'); gr.addColorStop(1,'rgba(40,90,160,.0)');
  g.fillStyle=gr; g.fill(); g.globalCompositeOperation='destination-out'; g.beginPath(); g.ellipse(s/2,s/2,6,s*.2,0,0,Math.PI*2); g.fill();
  return new THREE.CanvasTexture(c); })();


export { glowTex, softTex, coronaTex, runeTex, eyeTex };
