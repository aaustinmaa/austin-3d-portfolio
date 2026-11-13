import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/* In `npm run dev`, serve the notes API from memory (or from Upstash when .env.local sets it), so the crane and the
   slips on the wish pillars can be tried locally. The admin token defaults to `local-notes-admin` here only. */

/* Made-up notes the memory store starts with, already published, so the slips can be seen without writing any. */
const SAMPLE_NOTES = [
  ['Mira', 'Found the crane on my second walk around. The stair up to the star is beautiful at night.', 'Thank you, Mira. Glad you kept walking.'],
  ['', 'I came for the résumé and stayed for the lake. Good luck with everything.', ''],
  ['Kenji', 'The Oracle core is mesmerising. How long did the glass shader take?', 'Longer than I would like to admit!'],
  ['Lin', '许个愿：希望明年还能回来看看这里。', '一定会在的。'],
  ['Sam', 'Shot every relic on the first try. Well, the third try.', ''],
  ['A wanderer', 'Quiet, kind place. Thanks for building it.', 'Thanks for stopping by.'],
  ['Priya', 'The paper unfolding is such a lovely touch.', ''],
  ['', 'Hello from a rainy afternoon.', ''],
];
async function seedSamples(store){
  const day = 86_400_000, now = Date.now(), commands = [];
  SAMPLE_NOTES.forEach(([name, message, reply], i) => {
    const at = now - (SAMPLE_NOTES.length - i)*day*1.7;
    const note = { id:randomUUID(), name, message, at, status:'public', ...(reply ? { reply, replyAt:at + day*.4 } : {}) };
    commands.push(['HSET', 'portfolio:notes:v1:notes', note.id, JSON.stringify(note)], ['ZADD', 'portfolio:notes:v1:public', at, note.id]);
  });
  await store.run(commands);
}
function localNotes(){
  return {
    name:'local-notes-api',
    apply:'serve',
    async configureServer(server){
      const env = { NOTES_ADMIN_TOKEN:'local-notes-admin', ...loadEnv('development', process.cwd(), '') };
      const { createNotesHandler, createNotesAdminHandler } = await import('./server/notes.js');
      const { memoryStore } = await import('./server/note-store.js');
      const store = env.UPSTASH_REDIS_REST_URL ? undefined : memoryStore();
      if (store) await seedSamples(store);
      const routes = {
        '/api/notes':createNotesHandler({ env, store, sourceOf:() => '127.0.0.1' }),
        '/api/notes-admin':createNotesAdminHandler({ env, store }),
      };
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`), handle = routes[url.pathname];
        if (!handle) return next();
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const response = await handle(new Request(url, { method:req.method, headers:req.headers, body:chunks.length ? Buffer.concat(chunks) : undefined }));
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

// Relative base so the build works at any path, including a GitHub Pages project URL.
export default defineConfig({
  base: './',
  plugins: [localNotes()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: resolve('index.html'), notes: resolve('notes-admin.html') } },
  },
});
