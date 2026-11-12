/* Austin's private page for the notes: review, publish, keep private, reply, delete. The token stays in this browser. */
const KEY = 'valley:notes-admin-token';
const $ = id => document.getElementById(id);
const tokenInput = $('token'), statusEl = $('status'), listEl = $('list'), tabsEl = $('tabs');
const TABS = [['pending', 'Waiting'], ['public', 'Published'], ['private', 'Private']];
let token = '', data = null, tab = 'pending';
try { token = sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ''; } catch { /* sign in each time */ }
tokenInput.value = token;

async function call(body){
  const res = await fetch('api/notes-admin', body
    ? { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:JSON.stringify(body) }
    : { headers:{ Authorization:`Bearer ${token}` } });
  if (res.status === 401) throw new Error('That token was not accepted.');
  if (!res.ok) throw new Error(`The notes service answered ${res.status}.`);
  return res.json();
}
async function refresh(){
  statusEl.textContent = 'Loading…';
  try { data = await call(); statusEl.textContent = ''; tabsEl.hidden = false; render(); }
  catch (e){ statusEl.textContent = e.message; }
}
const when = at => new Date(at).toLocaleString();
function el(tag, props = {}, ...kids){ const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; }

function render(){
  tabsEl.replaceChildren(...TABS.map(([k, label]) => el('button', { type:'button', textContent:`${label} (${data[k].length})`,
    onclick:() => { tab = k; render(); } }, )));
  [...tabsEl.children].forEach((b, i) => b.setAttribute('aria-pressed', String(TABS[i][0] === tab)));
  const notes = data[tab];
  if (!notes.length){ listEl.replaceChildren(el('p', { className:'empty', textContent:'Nothing here.' })); return; }
  listEl.replaceChildren(...notes.map(n => {
    const reply = el('textarea', { value:n.reply || '', placeholder:'Reply (shown under the note)' });
    const act = (action, extra = {}) => async e => {
      if (action === 'delete' && !confirm('Delete this note for good? Its writer will still have their own copy.')) return;
      e.target.disabled = true;
      try { await call({ id:n.id, action, ...extra }); await refresh(); } catch (err){ statusEl.textContent = err.message; e.target.disabled = false; }
    };
    const buttons = [
      tab !== 'public' && el('button', { type:'button', className:'primary', textContent:'Publish', onclick:act('publish') }),
      tab !== 'private' && el('button', { type:'button', textContent:'Keep private', onclick:act('private') }),
      el('button', { type:'button', textContent:'Save reply', onclick:e => act('reply', { reply:reply.value })(e) }),
      el('button', { type:'button', className:'danger', textContent:'Delete', onclick:act('delete') }),
    ].filter(Boolean);
    return el('article', { className:'note' },
      el('div', { className:'head' }, el('b', { textContent:n.name || 'A visitor' }), el('span', { textContent:when(n.at) })),
      el('p', { className:'msg', textContent:n.message }),
      ...(n.replyAt ? [el('div', { className:'replied', textContent:`Replied ${when(n.replyAt)}` })] : []),
      reply, el('div', { className:'row' }, ...buttons));
  }));
}

$('login').addEventListener('submit', e => {
  e.preventDefault(); token = tokenInput.value.trim();
  try { localStorage.setItem(KEY, token); } catch { /* fine */ }
  void refresh();
});
if (token) void refresh();
