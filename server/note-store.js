/* The notes live in Redis. Upstash's REST pipeline runs a list of commands in one request; the memory store
   runs the same commands for local development and tests. */

export function upstashStore(url, token, fetcher = fetch){
  return {
    async run(commands){
      const response = await fetcher(`${url}/pipeline`, {
        method:'POST', redirect:'error',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body:JSON.stringify(commands),
        signal:AbortSignal.timeout(2_000),
      });
      if (!response.ok) throw new Error('Note store unavailable');
      const results = await response.json();
      if (!Array.isArray(results) || results.length !== commands.length) throw new Error('Invalid note store result');
      return results.map(r => { if (!r || r.error) throw new Error('Note store command failed'); return r.result; });
    },
  };
}

export function memoryStore(now = () => Date.now()){
  const values = new Map(), expires = new Map(), hashes = new Map(), sets = new Map();
  const live = key => { const at = expires.get(key); if (at !== undefined && at <= now()){ values.delete(key); expires.delete(key); } return values.has(key); };
  const hash = key => { if (!hashes.has(key)) hashes.set(key, new Map()); return hashes.get(key); };
  const zset = key => { if (!sets.has(key)) sets.set(key, new Map()); return sets.get(key); };
  const ops = {
    INCR(key){ const v = (live(key) ? Number(values.get(key)) : 0) + 1; values.set(key, String(v)); return v; },
    DECR(key){ const v = (live(key) ? Number(values.get(key)) : 0) - 1; values.set(key, String(v)); return v; },
    EXPIRE(key, seconds, flag){ if (!live(key) || (flag === 'NX' && expires.has(key))) return 0; expires.set(key, now() + Number(seconds)*1000); return 1; },
    TTL(key){ if (!live(key)) return -2; const at = expires.get(key); return at === undefined ? -1 : Math.ceil((at - now())/1000); },
    HSET(key, field, value){ const h = hash(key), fresh = !h.has(field); h.set(field, value); return fresh ? 1 : 0; },
    HGET(key, field){ return hash(key).get(field) ?? null; },
    HMGET(key, ...fields){ const h = hash(key); return fields.map(f => h.get(f) ?? null); },
    HDEL(key, ...fields){ const h = hash(key); return fields.filter(f => h.delete(f)).length; },
    ZADD(key, score, member){ const z = zset(key), fresh = !z.has(member); z.set(member, Number(score)); return fresh ? 1 : 0; },
    ZREM(key, ...members){ const z = zset(key); return members.filter(m => z.delete(m)).length; },
    ZCARD(key){ return zset(key).size; },
    ZREVRANGE(key, start, stop){ const sorted = [...zset(key)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1)).map(([m]) => m);
      return sorted.slice(Number(start), Number(stop) < 0 ? undefined : Number(stop) + 1); },
  };
  return { async run(commands){ return commands.map(([name, ...args]) => ops[name](...args.map(String))); } };
}
