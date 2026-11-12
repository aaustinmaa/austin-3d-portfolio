import { isIP } from 'node:net';

/* The network a request comes from: an IPv4 address, or an IPv6 /64 (one household or device can rotate within it). */
export function sourceGroup(ip){
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6 || ip.includes('%')) return null;
  const hostname = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [head, tail] = hostname.split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const words = [...front, ...Array(8 - front.length - back.length).fill('0'), ...back];
  if (words.slice(0, 6).join(':') === '0:0:0:0:0:ffff'){
    const hi = parseInt(words[6], 16), lo = parseInt(words[7], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `${words.slice(0, 4).join(':')}::/64`;
}

/* Read a small JSON body without trusting Content-Length. */
export async function readJson(request, maxBytes){
  if (!request.body || Number(request.headers.get('content-length')) > maxBytes) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(maxBytes);
  let size = 0;
  try {
    for (;;){
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > bytes.length){ void reader.cancel().catch(() => {}); return null; }
      bytes.set(value, size);
      size += value.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(bytes.subarray(0, size)));
  } catch { return null; }
  finally { reader.releaseLock(); }
}
