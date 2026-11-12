import * as THREE from 'three';
import { NOTE_ID } from './note-rules.js';

/* Notes left on the paper crane, once Austin publishes them, are a few more of the soft lights drifting in the
   open air beneath the star. From below they look like any other mote; only a wanderer who climbs or flies up among them
   finds that some brighten as they come near and can be read. A note shows there for its writer at once (their
   browser keeps it); other visitors see it once Austin has published it, with his reply. The writer keeps one note,
   folded inside the paper crane, and can open the crane to change it or take it back. */

/* ---------- the writer's own note: one per visitor, kept in this browser (or in memory when storage is unavailable)
   with the key that lets them change or take it back ---------- */
const OWN_KEY = 'valley:note:v2';
let own;
const validOwn = n => n && NOTE_ID.test(n.id) && typeof n.key === 'string' && typeof n.message === 'string' && Number.isFinite(n.at);
export function ownNote(){
  if (own !== undefined) return own;
  try { const saved = JSON.parse(localStorage.getItem(OWN_KEY) || 'null'); own = validOwn(saved) ? saved : null; } catch { own = null; }
  return own;
}
export const ownNotes = () => ownNote() ? [ownNote()] : [];
function keepOwn(note){
  own = note;
  try { if (note) localStorage.setItem(OWN_KEY, JSON.stringify(note)); else localStorage.removeItem(OWN_KEY); } catch { /* still kept for this visit */ }
}

/* ---------- the notes API ---------- */
/* Save what is on the paper: a new note, a change to the visitor's note, or (an empty paper) taking it back. */
export async function saveNote(endpoint, { name, message }, fetcher = fetch){
  const mine = ownNote();
  if (!message && !mine) return { state:'empty' };
  const method = !mine ? 'POST' : message ? 'PUT' : 'DELETE';
  if (mine && method === 'PUT' && mine.message === message && (mine.name || '') === name) return { state:'kept', note:mine };
  try {
    const res = await fetcher(endpoint, { method, headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify(mine ? { id:mine.id, key:mine.key, name, message } : { name, message }), signal:AbortSignal.timeout(8_000) });
    if (res.status === 429) return { state:'limited' };
    if (res.status === 405 || (res.status === 404 && !mine)) return { state:'offline' };
    /* Austin removed it: start a fresh note */
    if (res.status === 404){ keepOwn(null); return method === 'DELETE' ? { state:'removed' } : saveNote(endpoint, { name, message }, fetcher); }
    if (res.status === 503) return { state:(await res.json().catch(() => ({}))).error === 'full' ? 'full' : 'failed' };
    if (!res.ok) return { state:'failed' };
    if (method === 'DELETE'){ keepOwn(null); return { state:'removed' }; }
    const body = await res.json();
    if (method === 'POST'){
      if (!NOTE_ID.test(body.id) || typeof body.key !== 'string' || !Number.isFinite(body.at)) return { state:'failed' };
      keepOwn({ id:body.id, key:body.key, at:body.at, name, message, status:'pending', reply:'', replyAt:0 });
    } else keepOwn({ ...mine, name, message, status:['pending','public','private'].includes(body.status) ? body.status : 'pending' });
    return { state:'sent', note:ownNote() };
  } catch { return { state:'failed' }; }
}

/* Austin's reply to the visitor's note, if any (and whether he still has it) */
export async function refreshOwn(endpoint, fetcher = fetch){
  const mine = ownNote();
  if (!mine) return null;
  try {
    const res = await fetcher(`${endpoint}?mine=${mine.id}`, { headers:{ Accept:'application/json' }, signal:AbortSignal.timeout(8_000) });
    if (!res.ok) return mine;
    const found = (await res.json()).mine?.find(n => n.id === mine.id);
    if (!found) return mine;
    keepOwn({ ...mine, status:['pending','public','private'].includes(found.status) ? found.status : mine.status,
      reply:typeof found.reply === 'string' ? found.reply.slice(0, 1500) : '', replyAt:Number.isFinite(found.replyAt) ? found.replyAt : 0 });
    return ownNote();
  } catch { return mine; }
}

const text = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
const fromServer = n => n && NOTE_ID.test(n.id) && typeof n.message === 'string' && Number.isFinite(n.at)
  ? { id:n.id, name:text(n.name, 80), message:text(n.message, 1500), at:n.at, reply:text(n.reply, 1500), replyAt:Number.isFinite(n.replyAt) ? n.replyAt : 0 } : null;

/* the notes Austin has published */
export async function loadNotes(endpoint, fetcher = fetch){
  try {
    const res = await fetcher(endpoint, { headers:{ Accept:'application/json' }, signal:AbortSignal.timeout(8_000) });
    const shared = res.ok ? await res.json() : null;
    return Array.isArray(shared?.notes) ? shared.notes.map(fromServer).filter(Boolean) : [];
  } catch { return []; }
}

/* ---------- the lights ---------- */
/* where a note rests, the same for every visitor: in the open air beneath the star, outside its column of light and
   inside the spiral stair, a little above the stair's top so a wanderer has to climb, and mostly fly, to reach them */
function slotOf(id){
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const r = () => { h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^= h >>> 16) >>> 0)/4294967296; };
  const a = r()*Math.PI*2, d = 5 + r()*5.5;
  return { x:Math.sin(a)*d, y:36.5 + r()*8.5, z:Math.cos(a)*d, ph:r(), hue:r() };
}

const CAP = 96, REACH = 9, NOTICE = 13;
const PALETTE = ['#7FE9F2', '#8FA8FF', '#B49CFF', '#D8E2FF'].map(c => new THREE.Color(c));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };

export function createNoteLights(scene, { scale, reduceMotion }){
  const g = new THREE.BufferGeometry(), pos = new Float32Array(CAP*3), col = new Float32Array(CAP*3), ph = new Float32Array(CAP);
  const lift = new Float32Array(CAP), alpha = new Float32Array(CAP);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('col', new THREE.BufferAttribute(col, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('lift', new THREE.BufferAttribute(lift, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  /* drawn like the motes around it (same size, palette and pulse); a light within reach swells a little and breathes slowly */
  const mat = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ t:{ value:0 }, glow:{ value:.65 }, scale, still:{ value:reduceMotion ? 1 : 0 } },
    vertexShader:`attribute vec3 col; attribute float ph; attribute float lift; attribute float alpha; uniform float t; uniform float glow; uniform float scale; uniform float still;
      varying vec3 vC; varying float vA;
      void main(){ float s = .5 + .5*sin(t*(.45 + fract(ph*3.7)*.9) + ph*40.), b = .6 + .4*sin(t*.9 + ph*20.);
        s = mix(s, mix(b, .8, still), lift);
        vA = (.3 + .7*s*s)*glow*(1. + .9*lift)*alpha;
        vC = col; vec4 mv = modelViewMatrix*vec4(position, 1.); gl_PointSize = 1.05*(.75 + .25*s)*(1. + .45*lift)*scale/-mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader:`varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord - .5; float d = dot(q, q); float a = (exp(-d*36.) + exp(-d*9.)*.3)*vA; gl_FragColor = vec4(vC*a, a); }` });
  const points = new THREE.Points(g, mat); points.frustumCulled = false; scene.add(points);

  let notes = [], shared = [];
  const v = new THREE.Vector3();
  /* the writer's own notes first, so they are never crowded out; each note keeps its place */
  function set(list = shared){
    shared = list;
    const prior = new Map(notes.map(n => [n.id, n])), merged = new Map();
    for (const n of [...ownNotes().map(o => ({ ...o, own:true })), ...list]) if (!merged.has(n.id)) merged.set(n.id, n);
    notes = [...merged.values()].slice(0, CAP).map(n => {
      const before = prior.get(n.id), slot = before?.slot ?? slotOf(n.id);
      return { ...n, slot, pos:before?.pos ?? new THREE.Vector3(slot.x, slot.y, slot.z), near:before?.near ?? 0, reach:false };
    });
    notes.forEach((n, i) => { const c = PALETTE[Math.floor(n.slot.hue*PALETTE.length)]; col.set([c.r, c.g, c.b], i*3); ph[i] = n.slot.ph; });
    g.attributes.col.needsUpdate = g.attributes.ph.needsUpdate = true; g.setDrawRange(0, notes.length);
  }
  function update(dt, T, hero){
    mat.uniforms.t.value = T;
    notes.forEach((n, i) => {
      const s = n.slot;
      n.pos.set(s.x, s.y, s.z);
      if (!reduceMotion) n.pos.add(v.set(Math.sin(T*.13 + s.ph*6.3), Math.sin(T*.09 + s.ph*9.1)*.5, Math.cos(T*.11 + s.ph*4.7)).multiplyScalar(1.2));
      const d = n.pos.distanceTo(hero);
      /* kept clear of the wanderer like the other motes; within reach it brightens */
      n.near += (smooth(NOTICE, REACH - 1, d) - n.near)*(1 - Math.exp(-dt*3));
      n.reach = d <= REACH;
      pos.set([n.pos.x, n.pos.y, n.pos.z], i*3); lift[i] = n.near; alpha[i] = smooth(1.2, 2.4, d);
    });
    g.attributes.position.needsUpdate = g.attributes.lift.needsUpdate = g.attributes.alpha.needsUpdate = true;
  }

  /* the note under the pointer, if one is within reach of the wanderer */
  function pick(ndc, camera){
    let best = null, bd = 26;
    for (const n of notes){
      if (!n.reach) continue;
      v.copy(n.pos).project(camera); if (v.z > 1) continue;
      const d = Math.hypot((v.x - ndc.x)*innerWidth/2, (v.y - ndc.y)*innerHeight/2);
      if (d < bd){ bd = d; best = n; }
    }
    return best;
  }
  return { set, update, pick, mat, get notes(){ return notes; } };
}
