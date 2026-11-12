import * as THREE from 'three';
import { NOTE_ID } from './note-rules.js';

/* Notes left on the paper crane, once Austin publishes them, are small paper slips tied under the glowing bands of
   the wish pillars in the meadow. From afar they are dim flecks on the stone; only a wanderer who walks up to a pillar
   sees the paper catch the light, and can open a slip to read it. A note shows there for its writer at once (their
   browser keeps it); other visitors see it once Austin has published it, with his reply. The writer keeps one note,
   folded inside the paper crane, and can open the crane to change it or take it back. */

/* ---------- the writer's own note: one per visitor, kept in this browser (or in memory when storage is unavailable)
   with the key that lets them change or take it back ---------- */
const OWN_KEY = 'valley:note:v2';
let own;
const validOwn = n => n && NOTE_ID.test(n.id) && typeof n.key === 'string' && typeof n.message === 'string' && Number.isFinite(n.at);
export function ownNote(){
  if (own !== undefined) return own;
  try { localStorage.removeItem('valley:notes:v1'); } catch { /* an earlier format, without keys */ }
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

/* ---------- the slips on the wish pillars ---------- */
/* A published note is a small folded paper slip tied under the glowing band of one of the wish pillars, made of the same
   pale paper as the crane. From across the meadow a slip is a dim fleck against the stone; only a wanderer who walks up
   to a pillar sees the paper catch the band's light, and can open it to read. Each note keeps the same place for every
   visitor: a pillar and a spot around its band chosen from the note's id, the oldest note keeping its spot when two meet. */
function hashOf(id){
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^= h >>> 16) >>> 0)/4294967296; };
}

const CAP = 96, AROUND = 10, REACH = 8, NOTICE = 16;
const DIM = new THREE.Color(0x3C4064), PAPER = new THREE.Color(0xE4E1F2);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };

/* a narrow strip folded lengthwise and to a point, its top turned over the band; local +z faces out from the pillar.
   Each facet carries its own even shade, like the crane, instead of taking the scene's lights. */
const W = .065, TOP = .075, LOW = -.32, TIP = -.4, OUT = .016, BACK = -.045;
const SLIP = [
  /* the two halves of the lengthwise fold */
  [[-W, TOP, 0], [0, TOP, OUT], [-W, LOW, 0], .9], [[0, TOP, OUT], [0, LOW, OUT], [-W, LOW, 0], .9],
  [[0, TOP, OUT], [W, TOP, 0], [W, LOW, 0], .74], [[0, TOP, OUT], [W, LOW, 0], [0, LOW, OUT], .74],
  /* the pointed end */
  [[-W, LOW, 0], [0, LOW, OUT], [0, TIP, OUT*.6], .82], [[0, LOW, OUT], [W, LOW, 0], [0, TIP, OUT*.6], .66],
  /* turned over the top of the band */
  [[-W, TOP, 0], [-W, TOP, BACK], [W, TOP, 0], 1], [[W, TOP, 0], [-W, TOP, BACK], [W, TOP, BACK], 1],
];
const PER = SLIP.length*3;

/* pillars: [{ x, z, band, r }] with the world height of each glowing band and its radius */
export function createNoteSlips(scene, pillars){
  /* all slips share one small buffer, rewritten when the notes change; their colour brightens as the wanderer comes near */
  const g = new THREE.BufferGeometry(), pos = new Float32Array(CAP*PER*3), col = new Float32Array(CAP*PER*3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.DoubleSide }));
  mesh.frustumCulled = false; scene.add(mesh);

  let notes = [], shared = [];
  const v = new THREE.Vector3(), c = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  /* where each note is tied: oldest first, so a new note never moves an older one */
  function place(list){
    const taken = new Set();
    return [...list].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)).map(n => {
      const r = hashOf(n.id);
      let p = Math.floor(r()*pillars.length), k = Math.floor(r()*AROUND);
      for (let tries = 0; taken.has(`${p}:${k}`) && tries < pillars.length*AROUND; tries++){ k = (k + 3) % AROUND; if (tries % AROUND === AROUND - 1) p = (p + 1) % pillars.length; }
      taken.add(`${p}:${k}`);
      const pillar = pillars[p], a = (k + .5 + (r() - .5)*.4)/AROUND*Math.PI*2, d = pillar.r + .012;
      return { ...n, a, pos:new THREE.Vector3(pillar.x + Math.sin(a)*d, pillar.band - .15, pillar.z + Math.cos(a)*d),
        tie:new THREE.Vector3(pillar.x + Math.sin(a)*d, pillar.band, pillar.z + Math.cos(a)*d),
        out:new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), tilt:(r() - .5)*.16, lean:-(.04 + r()*.05), seen:0, reach:false };
    });
  }
  /* the writer's own note first, so it is never crowded out */
  function set(list = shared){
    shared = list;
    const merged = new Map();
    for (const n of [...ownNotes().map(o => ({ ...o, own:true })), ...list]) if (!merged.has(n.id)) merged.set(n.id, n);
    const seen = new Map(notes.map(n => [n.id, n.seen]));
    notes = place([...merged.values()].slice(0, CAP));
    notes.forEach((n, i) => {
      n.seen = seen.get(n.id) ?? 0;
      m.compose(n.tie, q.setFromEuler(e.set(n.lean, n.a, n.tilt, 'YXZ')), one);
      SLIP.forEach((f, k) => { for (let j = 0; j < 3; j++) pos.set(v.fromArray(f[j]).applyMatrix4(m).toArray(), ((i*SLIP.length + k)*3 + j)*3); });
    });
    g.setDrawRange(0, notes.length*PER); g.attributes.position.needsUpdate = true;
  }
  /* a slip catches the band's light as the wanderer comes near */
  function update(dt, hero){
    notes.forEach((n, i) => {
      const d = n.pos.distanceTo(hero);
      n.seen += (smooth(NOTICE, REACH - 2, d) - n.seen)*(1 - Math.exp(-dt*2.5));
      n.reach = d <= REACH;
      c.copy(DIM).lerp(PAPER, n.seen);
      for (let k = 0; k < SLIP.length; k++){ const shade = SLIP[k][3];
        for (let j = 0, o = (i*SLIP.length + k)*9; j < 3; j++, o += 3){ col[o] = c.r*shade; col[o + 1] = c.g*shade; col[o + 2] = c.b*shade; } }
    });
    if (notes.length) g.attributes.color.needsUpdate = true;
  }

  /* the slip under the pointer, if it is within the wanderer's reach and faces the camera (not behind its pillar) */
  function pick(ndc, camera){
    let best = null, bd = 28;
    for (const n of notes){
      if (!n.reach || v.copy(camera.position).sub(n.pos).dot(n.out) <= 0) continue;
      v.copy(n.pos).project(camera); if (v.z > 1) continue;
      const d = Math.hypot((v.x - ndc.x)*innerWidth/2, (v.y - ndc.y)*innerHeight/2);
      if (d < bd){ bd = d; best = n; }
    }
    return best;
  }
  return { set, update, pick, mesh, get notes(){ return notes; } };
}
