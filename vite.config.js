import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

/* In `npm run dev`, serve the notes API from memory (or from Upstash when .env.local sets it), so the crane and the
   lights beneath the star can be tried locally. The admin token defaults to `local-notes-admin` here only. */
function localNotes(){
  return {
    name:'local-notes-api',
    apply:'serve',
    async configureServer(server){
      const env = { NOTES_ADMIN_TOKEN:'local-notes-admin', ...loadEnv('development', process.cwd(), '') };
      const { createNotesHandler, createNotesAdminHandler } = await import('./server/notes.js');
      const { memoryStore } = await import('./server/note-store.js');
      const store = env.UPSTASH_REDIS_REST_URL ? undefined : memoryStore();
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
