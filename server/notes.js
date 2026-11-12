import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { NOTE_ID, NOTE_MESSAGE_LIMIT, NOTE_NAME_LIMIT, NOTE_REPLY_LIMIT, cleanText } from '../src/note-rules.js';
import { readJson, sourceGroup } from './source.js';
import { upstashStore } from './note-store.js';

/* Notes visitors leave on the paper crane. A new note waits for Austin; only notes he publishes are shown to
   other visitors. Its writer keeps their own copy (with a private key) in the browser, can look up Austin's reply by
   its id, and can change or take back the note with its key. A changed note waits for Austin again. */
const DAY = 86_400;
const BASE = 'portfolio:notes:v1';
const KEY = { notes:`${BASE}:notes`, pending:`${BASE}:pending`, public:`${BASE}:public`, private:`${BASE}:private` };
export const NOTE_LIMITS = { perDay:3, perMonth:8, siteDay:40, pending:150, shown:60, mine:24, edits:30 };
const REQUEST_BYTES = 8_192;

function json(status, payload, headers){
  return Response.json(payload, { status, headers:{ 'Cache-Control':'no-store', ...headers } });
}
const parse = raw => { try { const n = JSON.parse(raw); return n && NOTE_ID.test(n.id) ? n : null; } catch { return null; } };
const digest = s => createHash('sha256').update(s).digest();
const keyHash = key => digest(`note-key:${key}`).toString('hex');
const sameKey = (key, hash) => typeof key === 'string' && key.length >= 20 && key.length <= 64 && typeof hash === 'string'
  && timingSafeEqual(digest(keyHash(key)), digest(hash));
const forAustin = ({ key, ...n }) => n;
const shown = n => ({ id:n.id, name:n.name, message:n.message, at:n.at, ...(n.reply ? { reply:n.reply, replyAt:n.replyAt } : {}) });

function storeFrom(env, fetcher){
  const { UPSTASH_REDIS_REST_URL:url, UPSTASH_REDIS_REST_TOKEN:token } = env;
  return url?.startsWith('https://') && token ? upstashStore(url, token, fetcher) : null;
}
async function readNotes(store, ids){
  if (!ids.length) return [];
  const [raw] = await store.run([['HMGET', KEY.notes, ...ids]]);
  return raw.map(r => r && parse(r)).filter(Boolean);
}
async function listNotes(store, key, count){
  const [ids] = await store.run([['ZREVRANGE', key, 0, count - 1]]);
  return readNotes(store, ids);
}

export function createNotesHandler({ env = process.env, fetcher = fetch, store = storeFrom(env, fetcher),
  sourceOf = request => (request.headers.get('x-vercel-forwarded-for') ?? '').trim(), now = () => Date.now() } = {}){
  const secret = env.UPSTASH_REDIS_REST_TOKEN || env.NOTES_ADMIN_TOKEN || 'local-notes';
  return async function handle(request){
    if (!store) return json(503, { error:'unavailable' });
    const url = new URL(request.url);

    if (request.method === 'GET'){
      try {
        /* a writer's own notes, by the ids their browser kept: Austin's reply and whether the note is shown */
        if (url.searchParams.has('mine')){
          const ids = [...new Set(url.searchParams.get('mine').split(','))].filter(id => NOTE_ID.test(id)).slice(0, NOTE_LIMITS.mine);
          const notes = await readNotes(store, ids);
          return json(200, { mine:notes.map(n => ({ ...shown(n), status:n.status })) });
        }
        const notes = await listNotes(store, KEY.public, NOTE_LIMITS.shown);
        return json(200, { notes:notes.map(shown) }, { 'Cache-Control':'public, max-age=0, s-maxage=60, stale-while-revalidate=600' });
      } catch { return json(503, { error:'unavailable' }); }
    }

    if (!['POST', 'PUT', 'DELETE'].includes(request.method)) return json(405, { error:'method' }, { Allow:'GET, POST, PUT, DELETE' });
    if (request.headers.get('origin') !== url.origin) return json(403, { error:'origin' });
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return json(415, { error:'content_type' });
    const input = await readJson(request, REQUEST_BYTES);
    const message = cleanText(input?.message, NOTE_MESSAGE_LIMIT), name = input?.name === undefined ? '' : cleanText(input.name, NOTE_NAME_LIMIT);
    if (request.method !== 'DELETE' && (!message || name === null)) return json(400, { error:'note' });
    const source = sourceGroup(sourceOf(request));
    if (!source) return json(503, { error:'unavailable' });
    const who = createHmac('sha256', secret).update(`note-source:${source}`).digest('hex');

    /* the writer changes or takes back their own note */
    if (request.method !== 'POST'){
      if (!NOTE_ID.test(input?.id ?? '')) return json(400, { error:'note' });
      try {
        const [note] = await readNotes(store, [input.id]);
        if (!note || !sameKey(input.key, note.key)) return json(404, { error:'missing' });
        const unlist = [['ZREM', KEY.pending, note.id], ['ZREM', KEY.public, note.id], ['ZREM', KEY.private, note.id]];
        if (request.method === 'DELETE'){ await store.run([...unlist, ['HDEL', KEY.notes, note.id]]); return json(200, { deleted:note.id }); }
        const edits = `${BASE}:source:${who}:edits`;
        const [count] = await store.run([['INCR', edits], ['EXPIRE', edits, DAY, 'NX']]);
        if (count > NOTE_LIMITS.edits) return json(429, { error:'limited' }, { 'Retry-After':'3600' });
        if (note.message !== message || note.name !== name){
          /* a published note goes back to Austin; one he kept private stays between them */
          Object.assign(note, { name, message, editedAt:now(), status:note.status === 'private' ? 'private' : 'pending' });
          await store.run([...unlist, ['ZADD', KEY[note.status], note.at, note.id], ['HSET', KEY.notes, note.id, JSON.stringify(note)]]);
        }
        return json(200, { ...shown(note), status:note.status });
      } catch { return json(503, { error:'unavailable' }); }
    }

    const day = `${BASE}:source:${who}:day`, month = `${BASE}:source:${who}:month`, site = `${BASE}:site:day`;
    try {
      /* reserve one note in every window, and hand the reservation back if any window (or the review queue) is full */
      const [perDay, , dayLeft, perMonth, , monthLeft, siteDay, , siteLeft, waiting] = await store.run([
        ['INCR', day], ['EXPIRE', day, DAY, 'NX'], ['TTL', day],
        ['INCR', month], ['EXPIRE', month, DAY*30, 'NX'], ['TTL', month],
        ['INCR', site], ['EXPIRE', site, DAY, 'NX'], ['TTL', site],
        ['ZCARD', KEY.pending]]);
      const retry = [[perDay, NOTE_LIMITS.perDay, dayLeft], [perMonth, NOTE_LIMITS.perMonth, monthLeft], [siteDay, NOTE_LIMITS.siteDay, siteLeft]]
        .filter(([count, limit]) => count > limit).map(([, , left]) => Math.max(60, left));
      if (retry.length || waiting >= NOTE_LIMITS.pending){
        await store.run([['DECR', day], ['DECR', month], ['DECR', site]]);
        return retry.length ? json(429, { error:'limited' }, { 'Retry-After':String(Math.max(...retry)) }) : json(503, { error:'full' });
      }
      const key = randomBytes(24).toString('base64url');
      const note = { id:randomUUID(), key:keyHash(key), name, message, at:now(), status:'pending' };
      await store.run([['HSET', KEY.notes, note.id, JSON.stringify(note)], ['ZADD', KEY.pending, note.at, note.id]]);
      return json(201, { id:note.id, key, at:note.at });
    } catch { return json(503, { error:'unavailable' }); }
  };
}

/* Austin's side: list every note and publish, keep private, reply to or delete one. */
export function createNotesAdminHandler({ env = process.env, fetcher = fetch, store = storeFrom(env, fetcher), now = () => Date.now() } = {}){
  const token = env.NOTES_ADMIN_TOKEN ?? '';
  return async function handle(request){
    if (!store || token.length < 16) return json(503, { error:'unavailable' });
    const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!timingSafeEqual(digest(given), digest(token))) return json(401, { error:'auth' });

    try {
      if (request.method === 'GET'){
        const [pending, published, kept] = await Promise.all([KEY.pending, KEY.public, KEY.private].map(k => listNotes(store, k, 300)));
        return json(200, { pending:pending.map(forAustin), public:published.map(forAustin), private:kept.map(forAustin) });
      }
      if (request.method !== 'POST') return json(405, { error:'method' }, { Allow:'GET, POST' });
      const input = await readJson(request, REQUEST_BYTES);
      if (!input || !NOTE_ID.test(input.id)) return json(400, { error:'note' });
      const [note] = await readNotes(store, [input.id]);
      if (!note) return json(404, { error:'missing' });
      const unlist = [['ZREM', KEY.pending, note.id], ['ZREM', KEY.public, note.id], ['ZREM', KEY.private, note.id]];
      switch (input.action){
        case 'delete':
          await store.run([...unlist, ['HDEL', KEY.notes, note.id]]);
          return json(200, { deleted:note.id });
        case 'publish': case 'private': case 'pending':
          note.status = input.action === 'publish' ? 'public' : input.action;
          await store.run([...unlist, ['ZADD', KEY[note.status], note.at, note.id], ['HSET', KEY.notes, note.id, JSON.stringify(note)]]);
          return json(200, { note:forAustin(note) });
        case 'reply': {
          const reply = cleanText(input.reply ?? '', NOTE_REPLY_LIMIT);
          if (reply === null) return json(400, { error:'reply' });
          if (reply){ note.reply = reply; note.replyAt = now(); } else { delete note.reply; delete note.replyAt; }
          await store.run([['HSET', KEY.notes, note.id, JSON.stringify(note)]]);
          return json(200, { note:forAustin(note) });
        }
        default: return json(400, { error:'action' });
      }
    } catch { return json(503, { error:'unavailable' }); }
  };
}
