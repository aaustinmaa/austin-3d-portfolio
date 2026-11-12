import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotesHandler, createNotesAdminHandler, NOTE_LIMITS } from '../server/notes.js';
import { memoryStore, upstashStore } from '../server/note-store.js';

const origin = 'https://portfolio.example';
const ADMIN = 'admin-token-for-tests-0123456789';
const env = { NOTES_ADMIN_TOKEN:ADMIN };

function setup(){
  let clock = 1_700_000_000_000;
  const now = () => clock, store = memoryStore(now);
  return { store, tick:s => { clock += s*1000; }, visitor:createNotesHandler({ env, store, now }), admin:createNotesAdminHandler({ env, store, now }) };
}
const post = (body, { ip = '192.0.2.1', headers = {} } = {}) => new Request(`${origin}/api/notes`, {
  method:'POST', headers:{ origin, 'content-type':'application/json', 'x-vercel-forwarded-for':ip, ...headers },
  body:typeof body === 'string' ? body : JSON.stringify(body) });
const get = (query = '') => new Request(`${origin}/api/notes${query}`);
const admin = (body, token = ADMIN) => new Request(`${origin}/api/notes-admin`, body
  ? { method:'POST', headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json' }, body:JSON.stringify(body) }
  : { headers:{ authorization:`Bearer ${token}` } });

test('rejects malformed, cross-site and oversized notes', async () => {
  const { visitor } = setup();
  for (const [req, status] of [
    [post({ message:'' }), 400],
    [post({ message:'   ' }), 400],
    [post({ message:'x'.repeat(1501) }), 400],
    [post({ message:'hi', name:'n'.repeat(81) }), 400],
    [post({ message:'hi', name:42 }), 400],
    [post('not json'), 400],
    [post({ message:'hi' }, { headers:{ origin:'https://other.example' } }), 403],
    [post({ message:'hi' }, { headers:{ 'content-type':'text/plain' } }), 415],
    [post({ message:'hi' }, { ip:'' }), 503],
    [new Request(`${origin}/api/notes`, { method:'DELETE' }), 405],
  ]) assert.equal((await visitor(req)).status, status);
});

test('a new note stays private until Austin publishes it, but its writer can always look it up', async () => {
  const { visitor, admin:austin } = setup();
  const res = await visitor(post({ name:'Mia', message:'Hello from the valley\u0007\n\n\n\nbye', extra:'ignored' }));
  assert.equal(res.status, 201);
  const { id } = await res.json();

  assert.deepEqual((await (await visitor(get())).json()).notes, []);
  const [mine] = (await (await visitor(get(`?mine=${id},not-an-id`))).json()).mine;
  assert.equal(mine.status, 'pending');
  assert.equal(mine.message, 'Hello from the valley\n\nbye');
  assert.equal(mine.extra, undefined);

  assert.equal((await austin(admin({ id, action:'reply', reply:'Thank you, Mia!' }))).status, 200);
  assert.equal((await austin(admin({ id, action:'publish' }))).status, 200);
  const publicRes = await visitor(get());
  assert.match(publicRes.headers.get('cache-control'), /s-maxage=60/);
  const [shown] = (await publicRes.json()).notes;
  assert.deepEqual(Object.keys(shown).sort(), ['at', 'id', 'message', 'name', 'reply', 'replyAt']);
  assert.equal(shown.reply, 'Thank you, Mia!');

  /* kept private: gone from the public list, still visible to its writer with the reply */
  await austin(admin({ id, action:'private' }));
  assert.deepEqual((await (await visitor(get())).json()).notes, []);
  assert.equal((await (await visitor(get(`?mine=${id}`))).json()).mine[0].status, 'private');

  const listing = await (await austin(admin())).json();
  assert.equal(listing.private.length, 1);
  assert.equal(listing.pending.length, 0);

  await austin(admin({ id, action:'delete' }));
  assert.deepEqual((await (await visitor(get(`?mine=${id}`))).json()).mine, []);
});

test('each network can leave only a few notes a day and a month', async () => {
  const { visitor, tick } = setup();
  const send = ip => visitor(post({ message:'hi' }, { ip }));
  for (let i = 0; i < NOTE_LIMITS.perDay; i++) assert.equal((await send('192.0.2.7')).status, 201);
  const limited = await send('192.0.2.7');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 80_000);
  /* rotating within an IPv6 /64 does not help, another network is unaffected */
  for (let i = 0; i < NOTE_LIMITS.perDay; i++) assert.equal((await send(`2001:db8:0:1::${i + 1}`)).status, 201);
  assert.equal((await send('2001:db8:0:1:ffff::9')).status, 429);
  assert.equal((await send('192.0.2.8')).status, 201);

  /* across days, the monthly allowance still runs out */
  let accepted = NOTE_LIMITS.perDay;
  for (let day = 1; day < 10; day++){ tick(86_401); for (let i = 0; i < NOTE_LIMITS.perDay; i++) if ((await send('192.0.2.7')).status === 201) accepted++; }
  assert.equal(accepted, NOTE_LIMITS.perMonth);
});

test('the whole site stops accepting notes when the daily total or the review queue is full', async () => {
  const { visitor, tick } = setup();
  let ip = 0;
  const send = () => visitor(post({ message:'hi' }, { ip:`198.51.100.${++ip}` }));
  for (let i = 0; i < NOTE_LIMITS.siteDay; i++) assert.equal((await send()).status, 201);
  assert.equal((await send()).status, 429);
  for (let day = 0; day < 3; day++){ tick(86_401); for (let i = 0; i < NOTE_LIMITS.siteDay; i++) await send(); }
  tick(86_401);
  const full = await send();
  assert.equal(full.status, 503);
  assert.deepEqual(await full.json(), { error:'full' });
});

test('Austin’s side needs his token', async () => {
  const { admin:austin } = setup();
  assert.equal((await austin(admin(null, 'wrong'))).status, 401);
  assert.equal((await austin(new Request(`${origin}/api/notes-admin`))).status, 401);
  assert.equal((await createNotesAdminHandler({ env:{ NOTES_ADMIN_TOKEN:'short' }, store:memoryStore() })(admin(null, 'short'))).status, 503);
  assert.equal((await austin(admin({ id:'00000000-0000-4000-8000-000000000000', action:'publish' }))).status, 404);
});

test('uses the Upstash pipeline and fails closed when it is missing or down', async () => {
  const calls = [];
  const store = upstashStore('https://redis.example', 'redis-token', async (url, init) => {
    calls.push({ url, auth:init.headers.Authorization, body:JSON.parse(init.body) });
    return Response.json(JSON.parse(init.body).map(([cmd]) => ({ result:cmd === 'ZREVRANGE' ? [] : 1 })));
  });
  const visitor = createNotesHandler({ env, store });
  assert.equal((await visitor(get())).status, 200);
  assert.equal(calls[0].url, 'https://redis.example/pipeline');
  assert.equal(calls[0].auth, 'Bearer redis-token');
  assert.deepEqual(calls[0].body, [['ZREVRANGE', 'portfolio:notes:v1:public', 0, NOTE_LIMITS.shown - 1]]);
  const res = await visitor(post({ message:'hi' }));
  assert.equal(res.status, 201);
  assert.doesNotMatch(JSON.stringify(calls), /192\.0\.2\.1/);

  assert.equal((await createNotesHandler({ env:{} })(get())).status, 503);
  const down = createNotesHandler({ env, store:upstashStore('https://redis.example', 't', async () => { throw new Error('offline'); }) });
  assert.equal((await down(get())).status, 503);
  assert.equal((await down(post({ message:'hi' }))).status, 503);
});
