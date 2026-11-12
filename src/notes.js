import * as THREE from 'three';
import { NOTE_ID } from './note-rules.js';

/* Notes left on the paper crane fly off to the star and stay there, as a few more of the soft lights drifting in the
   open air beneath it. From below they look like any other mote; only a wanderer who climbs or flies up among them
   finds that some brighten as they come near and can be read. A note shows there for its writer at once (their
   browser keeps it); other visitors see it once Austin has published it, with his reply. */

/* ---------- the writer's own notes, kept in this browser (or in memory when storage is unavailable) ---------- */
const OWN_KEY = 'valley:notes:v1', OWN_MAX = 24;
let own = null;
const validOwn = n => n && NOTE_ID.test(n.id) && typeof n.message === 'string' && Number.isFinite(n.at);
export function ownNotes(){
  if (own) return own;
  try { const saved = JSON.parse(localStorage.getItem(OWN_KEY) || '[]'); own = Array.isArray(saved) ? saved.filter(validOwn).slice(0, OWN_MAX) : []; }
  catch { own = []; }
  return own;
}
function keepOwn(list){
  own = list.slice(0, OWN_MAX);
  try { localStorage.setItem(OWN_KEY, JSON.stringify(own)); } catch { /* still kept for this visit */ }
}

/* ---------- the notes API ---------- */
export async function sendNote(endpoint, { name, message }, fetcher = fetch){
  try {
    const res = await fetcher(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify({ name, message }), signal:AbortSignal.timeout(8_000) });
    if (res.status === 429) return { state:'limited' };
    if (res.status === 404 || res.status === 405) return { state:'offline' };
    if (res.status === 503) return { state:(await res.json().catch(() => ({}))).error === 'full' ? 'full' : 'failed' };
    if (!res.ok) return { state:'failed' };
    const { id, at } = await res.json();
    if (!NOTE_ID.test(id) || !Number.isFinite(at)) return { state:'failed' };
    const note = { id, at, name, message, status:'pending', own:true };
    keepOwn([note, ...ownNotes().filter(n => n.id !== id)]);
    return { state:'sent', note };
  } catch { return { state:'failed' }; }
}

const text = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
const fromServer = n => n && NOTE_ID.test(n.id) && typeof n.message === 'string' && Number.isFinite(n.at)
  ? { id:n.id, name:text(n.name, 80), message:text(n.message, 1500), at:n.at, reply:text(n.reply, 1500), replyAt:Number.isFinite(n.replyAt) ? n.replyAt : 0 } : null;

/* the published notes plus the writer's own (with any reply Austin left on them) */
export async function loadNotes(endpoint, fetcher = fetch){
  const get = async url => { try { const r = await fetcher(url, { headers:{ Accept:'application/json' }, signal:AbortSignal.timeout(8_000) }); return r.ok ? r.json() : null; } catch { return null; } };
  const mineIds = ownNotes().map(n => n.id);
  const [shared, mine] = await Promise.all([get(endpoint), mineIds.length ? get(`${endpoint}?mine=${mineIds.join(',')}`) : null]);
  if (Array.isArray(mine?.mine)){
    const latest = new Map(mine.mine.map(n => [n.id, n]));
    keepOwn(ownNotes().map(n => { const s = latest.get(n.id); return s ? { ...n, status:['pending','public','private'].includes(s.status) ? s.status : n.status,
      reply:text(s.reply, 1500), replyAt:Number.isFinite(s.replyAt) ? s.replyAt : 0 } : n; }));
  }
  return Array.isArray(shared?.notes) ? shared.notes.map(fromServer).filter(Boolean) : [];
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

export function createNoteLights(scene, { star, scale, reduceMotion }){
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
      return { ...n, slot, pos:before?.pos ?? new THREE.Vector3(slot.x, slot.y, slot.z), born:before?.born ?? -1, delay:before?.delay ?? 0, near:before?.near ?? 0, reach:false };
    });
    notes.forEach((n, i) => { const c = PALETTE[Math.floor(n.slot.hue*PALETTE.length)]; col.set([c.r, c.g, c.b], i*3); ph[i] = n.slot.ph; });
    g.attributes.col.needsUpdate = g.attributes.ph.needsUpdate = true; g.setDrawRange(0, notes.length);
  }
  /* a note just sent (already kept as the writer's own): it reaches the star with the crane, then drifts down to its place */
  function arrive(id, delay){
    set(); const n = notes.find(x => x.id === id);
    if (n){ n.born = 0; n.delay = reduceMotion ? 0 : delay; }
  }

  function update(dt, T, hero){
    mat.uniforms.t.value = T;
    notes.forEach((n, i) => {
      const s = n.slot;
      let fade = 1;
      n.pos.set(s.x, s.y, s.z);
      if (!reduceMotion) n.pos.add(v.set(Math.sin(T*.13 + s.ph*6.3), Math.sin(T*.09 + s.ph*9.1)*.5, Math.cos(T*.11 + s.ph*4.7)).multiplyScalar(1.2));
      if (n.born >= 0){
        n.born += dt;
        if (reduceMotion || n.born >= n.delay + 3.5) n.born = -1;
        else { fade = smooth(n.delay - .4, n.delay + .6, n.born); const k = smooth(n.delay, n.delay + 3.5, n.born); n.pos.lerpVectors(star, n.pos, k); }
      }
      const d = n.pos.distanceTo(hero);
      /* kept clear of the wanderer like the other motes; within reach it brightens */
      n.near += ((fade < 1 ? 0 : smooth(NOTICE, REACH - 1, d)) - n.near)*(1 - Math.exp(-dt*3));
      n.reach = d <= REACH && fade >= 1;
      pos.set([n.pos.x, n.pos.y, n.pos.z], i*3); lift[i] = n.near; alpha[i] = Math.min(fade, smooth(1.2, 2.4, d));
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
  return { set, arrive, update, pick, mat, get notes(){ return notes; } };
}
