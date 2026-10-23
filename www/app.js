'use strict';
/* Sahitya: a free reader for Indian-language literature.
   Sources: Wikisource (many Indian languages), Project Gutenberg (via Gutendex), Internet Archive.
   Everything runs inside the app. There is no server of our own and no account. */

/* ---------- small helpers ---------- */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const enc = encodeURIComponent;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const one = v => (Array.isArray(v) ? v.join('; ') : (v || ''));

const store = {
  get(k, d) { try { const v = localStorage.getItem('sahitya.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('sahitya.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
};

/* IndexedDB key/value store for offline copies of saved texts */
const idb = (() => {
  let dbp = null;
  const open = () => {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('sahitya', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  };
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', mode);
      const req = fn(t.objectStore('kv'));
      t.oncomplete = () => res(req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  return {
    get: k => tx('readonly', s => s.get(k)),
    set: (k, v) => tx('readwrite', s => s.put(v, k)),
    del: k => tx('readwrite', s => s.delete(k))
  };
})();

function textOf(html) {
  try { return (new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '').trim(); }
  catch (e) { return String(html || '').replace(/<[^>]*>/g, '').trim(); }
}

async function http(url, ms) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms || 25000);
  try {
    const r = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  } finally { clearTimeout(timer); }
}
const getJSON = async (u, ms) => (await http(u, ms)).json();
const getText = async (u, ms) => (await http(u, ms || 60000)).text();

/* ---------- languages and sources ---------- */
const LANGS = [
  { code: 'kn', name: 'ಕನ್ನಡ', en: 'Kannada', ia: ['kan', 'Kannada'] },
  { code: 'hi', name: 'हिन्दी', en: 'Hindi', ia: ['hin', 'Hindi'] },
  { code: 'en', name: 'English', en: 'English', ia: ['eng', 'English'] },
  { code: 'ta', name: 'தமிழ்', en: 'Tamil', ia: ['tam', 'Tamil'] },
  { code: 'te', name: 'తెలుగు', en: 'Telugu', ia: ['tel', 'Telugu'] },
  { code: 'ml', name: 'മലയാളം', en: 'Malayalam', ia: ['mal', 'Malayalam'] },
  { code: 'bn', name: 'বাংলা', en: 'Bengali', ia: ['ben', 'Bengali'] },
  { code: 'mr', name: 'मराठी', en: 'Marathi', ia: ['mar', 'Marathi'] },
  { code: 'gu', name: 'ગુજરાતી', en: 'Gujarati', ia: ['guj', 'Gujarati'] },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', en: 'Punjabi', ia: ['pan', 'Punjabi'] },
  { code: 'sa', name: 'संस्कृतम्', en: 'Sanskrit', ia: ['san', 'Sanskrit'] },
  { code: 'or', name: 'ଓଡ଼ିଆ', en: 'Odia', ia: ['ori', 'Oriya', 'Odia'] },
  { code: 'as', name: 'অসমীয়া', en: 'Assamese', ia: ['asm', 'Assamese'] },
  { code: 'ur', name: 'اردو', en: 'Urdu', ia: ['urd', 'Urdu'] },
  { code: 'ne', name: 'नेपाली', en: 'Nepali', ia: ['nep', 'Nepali'] }
];
const langOf = code => LANGS.find(l => l.code === code) || LANGS[0];

/* Search shortcuts: just ordinary search words, results depend on what the sources hold */
const SUGGEST = {
  kn: ['ಬಸವಣ್ಣ', 'ಪುರಂದರದಾಸ', 'ಕನಕದಾಸ', 'ಕುಮಾರವ್ಯಾಸ', 'ಪಂಪ', 'ರನ್ನ', 'ಅಕ್ಕಮಹಾದೇವಿ', 'ಸರ್ವಜ್ಞ'],
  hi: ['कबीर', 'तुलसीदास', 'सूरदास', 'प्रेमचंद', 'मीराबाई', 'जयशंकर प्रसाद', 'रसखान'],
  en: ['Tagore', 'Kalidasa', 'Toru Dutt', 'Sarojini Naidu', 'Vivekananda', 'Gandhi', 'Kipling'],
  ta: ['திருவள்ளுவர்', 'பாரதியார்', 'ஔவையார்', 'கம்பர்', 'இளங்கோவடிகள்'],
  te: ['పోతన', 'వేమన', 'తిక్కన', 'నన్నయ', 'అన్నమయ్య'],
  ml: ['എഴുത്തച്ഛൻ', 'കുമാരനാശാൻ', 'ചെറുശ്ശേരി', 'പൂന്താനം'],
  bn: ['রবীন্দ্রনাথ ঠাকুর', 'বঙ্কিমচন্দ্র', 'শরৎচন্দ্র', 'মাইকেল মধুসূদন'],
  mr: ['तुकाराम', 'ज्ञानेश्वर', 'एकनाथ', 'रामदास'],
  gu: ['નરસિંહ મહેતા', 'મીરાંબાઈ', 'પ્રેમાનંદ', 'દલપતરામ'],
  pa: ['ਗੁਰੂ ਨਾਨਕ', 'ਬੁੱਲ੍ਹੇ ਸ਼ਾਹ', 'ਵਾਰਿਸ ਸ਼ਾਹ', 'ਸ਼ਾਹ ਹੁਸੈਨ'],
  sa: ['कालिदास', 'वाल्मीकि', 'व्यास', 'भर्तृहरि', 'जयदेव'],
  or: ['ଜୟଦେବ', 'ଉପେନ୍ଦ୍ର ଭଞ୍ଜ', 'ଫକୀରମୋହନ ସେନାପତି'],
  as: [],
  ur: ['میر تقی میر', 'غالب', 'اقبال'],
  ne: ['भानुभक्त']
};
const SRC_NAME = { ws: 'Wikisource', pg: 'Gutenberg', ia: 'Internet Archive' };

/* ---------- state ---------- */
const state = {
  lang: store.get('lang', 'kn'),
  mode: 'works',
  q: '',
  items: [],
  more: {},      // per source: undefined = not started, null = finished, otherwise the next-page token
  busy: false,
  token: 0
};
if (!LANGS.some(l => l.code === state.lang)) state.lang = 'kn';

const inLib = id => store.get('lib', []).some(x => x.id === id);

/* ---------- source: Wikisource ---------- */
function wsItem(lang, title, snippet, isAuthor) {
  return {
    id: 'ws:' + lang + ':' + title, source: 'ws', lang, page: title,
    title: isAuthor ? title.replace(/^[^:]+:/, '') : title,
    snippet: snippet || '', kind: isAuthor ? 'author' : 'work'
  };
}

async function wsList(L, q, cont) {
  const ns = state.mode === 'authors' ? 102 : 0;
  const base = 'https://' + L.code + '.wikisource.org/w/api.php?format=json&formatversion=2&origin=*&action=query';
  if (q) {
    const d = await getJSON(base + '&list=search&srsearch=' + enc(q) + '&srnamespace=' + ns + '&srlimit=20&sroffset=' + (cont || 0));
    const items = ((d.query && d.query.search) || []).map(s => wsItem(L.code, s.title, textOf(s.snippet), ns === 102));
    return { items, next: d.continue && d.continue.sroffset ? d.continue.sroffset : null };
  }
  const d = await getJSON(base + '&list=allpages&apnamespace=' + ns + '&aplimit=60&apfilterredir=nonredirects' + (cont ? '&apcontinue=' + enc(cont) : ''));
  const items = ((d.query && d.query.allpages) || [])
    .filter(p => ns === 102 || p.title.indexOf('/') < 0)
    .map(p => wsItem(L.code, p.title, '', ns === 102));
  return { items, next: d.continue && d.continue.apcontinue ? d.continue.apcontinue : null };
}

/* Wikisource pages are HTML from a wiki, so strip anything active and make links/images absolute */
function sanitize(html, lang) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  $$('script,style,iframe,object,embed,form,link,meta,input,button,noscript,.mw-editsection,.noprint,.ws-noexport,.pagenum,.mw-empty-elt', doc).forEach(n => n.remove());
  $$('*', doc).forEach(el => {
    Array.from(el.attributes).forEach(a => {
      const n = a.name.toLowerCase();
      if (n.indexOf('on') === 0 || n === 'style' || n === 'width' || n === 'height' || n === 'srcset') el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'src') && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    });
    if (el.tagName === 'IMG') {
      const s = el.getAttribute('src') || '';
      if (s.indexOf('//') === 0) el.setAttribute('src', 'https:' + s);
      else if (s.indexOf('/') === 0) el.setAttribute('src', 'https://' + lang + '.wikisource.org' + s);
      el.setAttribute('loading', 'lazy');
    }
    if (el.tagName === 'A') {
      const h = el.getAttribute('href') || '';
      if (h.indexOf('//') === 0) el.setAttribute('href', 'https:' + h);
      else if (h.indexOf('/') === 0) el.setAttribute('href', 'https://' + lang + '.wikisource.org' + h);
    }
  });
  return doc.body.innerHTML;
}

/* ---------- source: Project Gutenberg (Gutendex) ---------- */
async function pgList(L, q, cont) {
  const url = cont || ('https://gutendex.com/books/?languages=' + L.code + (q ? '&search=' + enc(q) : ''));
  const d = await getJSON(url);
  const items = (d.results || []).map(b => {
    const f = b.formats || {};
    return {
      id: 'pg:' + b.id, source: 'pg', lang: L.code, kind: 'work',
      title: b.title, author: (b.authors || []).map(a => a.name).join('; '),
      textUrl: f['text/plain; charset=utf-8'] || f['text/plain; charset=us-ascii'] || f['text/plain'] || '',
      web: 'https://www.gutenberg.org/ebooks/' + b.id
    };
  });
  return { items, next: d.next || null };
}

function cleanGutenberg(t) {
  t = String(t).replace(/\r\n?/g, '\n');
  const s = t.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  if (s >= 0) t = t.slice(t.indexOf('\n', s) + 1);
  const e = t.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
  if (e >= 0) t = t.slice(0, e);
  return t.trim();
}

/* Short lines are treated as verse and keep their line breaks; long hard-wrapped lines are joined into prose */
function blockHTML(b) {
  const lines = b.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
  if (!lines.length) return '';
  const avg = lines.reduce((n, l) => n + l.length, 0) / lines.length;
  if (lines.length > 1 && avg < 45) return '<p class="verse">' + lines.map(esc).join('<br>') + '</p>';
  return '<p>' + esc(lines.map(l => l.trim()).join(' ')) + '</p>';
}

function paginate(text, size) {
  size = size || 6000;
  const pages = [];
  let cur = [], len = 0;
  for (const b of text.split(/\n{2,}/)) {
    const h = blockHTML(b);
    if (!h) continue;
    cur.push(h); len += b.length;
    if (len >= size) { pages.push(cur.join('')); cur = []; len = 0; }
  }
  if (cur.length) pages.push(cur.join(''));
  return pages.length ? pages : ['<p>This text is empty.</p>'];
}

/* ---------- source: Internet Archive ---------- */
async function iaList(L, q, cont) {
  const page = cont || 1;
  const lang = '(' + L.ia.map(x => 'language:' + x).join(' OR ') + ')';
  const clean = q.replace(/[:"()\[\]{}\\\/]/g, ' ').replace(/\s+/g, ' ').trim();
  const qq = (clean ? '(' + clean + ') AND ' : '') + lang + ' AND mediatype:texts AND -access-restricted-item:true';
  const url = 'https://archive.org/advancedsearch.php?q=' + enc(qq) +
    '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&sort%5B%5D=downloads+desc&rows=20&page=' + page + '&output=json';
  const d = await getJSON(url);
  const r = d.response || { docs: [], numFound: 0 };
  const items = (r.docs || []).map(x => ({
    id: 'ia:' + x.identifier, source: 'ia', lang: L.code, kind: 'work',
    title: one(x.title) || x.identifier, author: one(x.creator),
    ia: x.identifier, web: 'https://archive.org/details/' + x.identifier
  }));
  return { items, next: page * 20 < r.numFound ? page + 1 : null };
}

const fetchers = { ws: wsList, pg: pgList, ia: iaList };

/* ---------- search / browse ---------- */
function interleave(lists) {
  const out = [];
  const max = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < max; i++) lists.forEach(l => { if (i < l.length) out.push(l[i]); });
  return out;
}

function setStatus(t) { $('#status').textContent = t || ''; }

async function loadResults(reset) {
  if (state.busy && !reset) return;
  const token = ++state.token;
  if (reset) { state.items = []; state.more = {}; renderResults(); }
  state.busy = true;
  setStatus(reset ? 'Loading…' : 'Loading more…');
  $('#moreBtn').hidden = true;

  const L = langOf(state.lang);
  const q = state.q.trim();
  const want = state.mode === 'authors' ? ['ws'] : ['ws', 'pg', 'ia'];
  const jobs = want.filter(s => state.more[s] !== null).map(s =>
    fetchers[s](L, q, state.more[s]).then(r => ({ src: s, r }), err => ({ src: s, err })));

  const out = await Promise.all(jobs);
  if (token !== state.token) return;   // a newer search replaced this one

  const batches = [], failed = [];
  out.forEach(o => {
    if (o.err) { failed.push(SRC_NAME[o.src]); state.more[o.src] = null; return; }
    state.more[o.src] = o.r.next == null ? null : o.r.next;
    batches.push(o.r.items);
  });
  state.items = state.items.concat(interleave(batches));
  state.busy = false;
  renderResults();

  if (!state.items.length) {
    setStatus(failed.length === out.length && out.length
      ? 'Could not reach the book sources. Check your internet connection, or open Saved to read offline.'
      : 'Nothing found in ' + L.en + '. Try another spelling, another language, or a writer\'s name in the original script.');
  } else {
    setStatus(failed.length ? failed.join(' and ') + ' could not be reached right now.' : '');
  }
  $('#moreBtn').hidden = !want.some(s => state.more[s] != null);
}

/* ---------- list rendering ---------- */
function cardHTML(it, opt) {
  const saved = inLib(it.id);
  return '<li class="card src-' + it.source + '" data-id="' + esc(it.id) + '">' +
    '<button class="open" data-act="open" type="button">' +
      '<span class="t" dir="auto">' + esc(it.title) + '</span>' +
      (it.author ? '<span class="a" dir="auto">' + esc(it.author) + '</span>' : '') +
      (it.snippet ? '<span class="s" dir="auto">' + esc(it.snippet) + '</span>' : '') +
      '<span class="meta"><b class="badge">' + SRC_NAME[it.source] + '</b>' +
        (it.kind === 'author' ? '<b class="badge alt">Writer</b>' : '') +
        '<b class="badge">' + esc(langOf(it.lang).en) + '</b>' +
        (opt && opt.offline ? '<b class="badge off">Offline</b>' : '') +
      '</span>' +
    '</button>' +
    '<button class="star' + (saved ? ' on' : '') + '" data-act="star" type="button" aria-label="' + (saved ? 'Remove from saved' : 'Save') + '">' + (saved ? '★' : '☆') + '</button>' +
  '</li>';
}

function renderResults() { $('#results').innerHTML = state.items.map(it => cardHTML(it)).join(''); }

async function renderSaved() {
  const lib = store.get('lib', []);
  $('#savedEmpty').hidden = lib.length > 0;
  const flags = await Promise.all(lib.map(it => it.source === 'ia' ? false : idb.get('c:' + it.id).then(v => !!v, () => false)));
  $('#savedList').innerHTML = lib.map((it, i) => cardHTML(it, { offline: flags[i] })).join('');
}

function findItem(id) {
  return state.items.find(x => x.id === id) || store.get('lib', []).find(x => x.id === id) || null;
}

const slim = it => ({ id: it.id, source: it.source, lang: it.lang, kind: it.kind, title: it.title, author: it.author, page: it.page, textUrl: it.textUrl, web: it.web, ia: it.ia });

function toggleSave(it, content) {
  const lib = store.get('lib', []);
  const i = lib.findIndex(x => x.id === it.id);
  if (i >= 0) {
    lib.splice(i, 1);
    store.set('lib', lib);
    idb.del('c:' + it.id).catch(() => {});
  } else {
    lib.unshift(slim(it));
    store.set('lib', lib);
    if (content && content.type !== 'embed') idb.set('c:' + it.id, content).catch(() => {});
  }
}

function bindList(ul, onChange) {
  ul.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const li = btn.closest('.card');
    const it = li && findItem(li.dataset.id);
    if (!it) return;
    if (btn.dataset.act === 'open') openReader(it);
    else {
      toggleSave(it);
      const on = inLib(it.id);
      btn.classList.toggle('on', on);
      btn.textContent = on ? '★' : '☆';
      if (onChange) onChange();
    }
  });
}

/* ---------- reader ---------- */
const R = { stack: [], cur: null, content: null, page: 0 };

function externalUrl(it) {
  if (it.source === 'ws') return 'https://' + it.lang + '.wikisource.org/wiki/' + enc(String(it.page).replace(/ /g, '_'));
  return it.web || '#';
}

async function loadContent(it) {
  if (it.source === 'ws') {
    const d = await getJSON('https://' + it.lang + '.wikisource.org/w/api.php?action=parse&page=' + enc(it.page) +
      '&prop=text%7Cdisplaytitle&redirects=1&disableeditsection=1&disablelimitreport=1&format=json&formatversion=2&origin=*');
    if (d.error) throw new Error(d.error.info || 'Page not found');
    return { type: 'html', title: textOf(d.parse.displaytitle), html: sanitize(d.parse.text, it.lang) };
  }
  if (it.source === 'pg') {
    if (!it.textUrl) throw new Error('No text version of this book is available');
    return { type: 'text', pages: paginate(cleanGutenberg(await getText(it.textUrl))) };
  }
  return { type: 'embed', url: 'https://archive.org/embed/' + it.ia };
}

function updateSaveBtn() {
  const on = !!(R.cur && inLib(R.cur.id));
  const b = $('#rSave');
  b.textContent = on ? '★' : '☆';
  b.classList.toggle('on', on);
}

function openReader(it) {
  R.stack.push(it);
  history.pushState({ reader: R.stack.length }, '');
  $('#reader').hidden = false;
  showItem(it);
}

function closeReader() {
  R.stack = []; R.cur = null; R.content = null;
  $('#reader').hidden = true;
  $('#rContent').innerHTML = '';
  renderResults();
  if (!$('#view-saved').hidden) renderSaved();
}

async function showItem(it) {
  R.cur = it; R.content = null; R.page = 0;
  $('#rTitle').textContent = it.title;
  $('#rFoot').hidden = true;
  updateSaveBtn();
  const body = $('#rContent');
  body.className = 'prose';
  body.innerHTML = '<p class="status">Loading…</p>';
  $('#rBody').scrollTop = 0;
  try {
    let c = await idb.get('c:' + it.id).catch(() => null);
    if (!c) {
      c = await loadContent(it);
      if (inLib(it.id) && c.type !== 'embed') idb.set('c:' + it.id, c).catch(() => {});
    }
    if (R.cur !== it) return;
    R.content = c;
    const p = store.get('prog', {})[it.id] || {};
    R.page = Math.max(0, Math.min(p.page || 0, (c.pages ? c.pages.length : 1) - 1));
    renderPage(p.y || 0);
  } catch (e) {
    if (R.cur !== it) return;
    body.innerHTML = '<p class="status">Could not load this page' + (e && e.message ? ' (' + esc(e.message) + ')' : '') +
      '. Check your internet connection.</p><p><button class="primary" id="retryBtn" type="button">Try again</button>' +
      '<a class="linkbtn" href="' + esc(externalUrl(it)) + '" target="_blank" rel="noopener">Open in browser</a></p>';
    const rb = $('#retryBtn');
    if (rb) rb.onclick = () => showItem(it);
  }
}

function renderPage(y) {
  const c = R.content, body = $('#rContent');
  if (c.type === 'html') {
    body.className = 'prose';
    body.innerHTML = c.html;
    if (c.title) $('#rTitle').textContent = c.title;
  } else if (c.type === 'text') {
    body.className = 'prose';
    body.innerHTML = c.pages[R.page];
    $('#rFoot').hidden = c.pages.length < 2;
    $('#pInfo').textContent = (R.page + 1) + ' / ' + c.pages.length;
    $('#pPrev').disabled = R.page === 0;
    $('#pNext').disabled = R.page >= c.pages.length - 1;
  } else {
    body.className = 'embed';
    body.innerHTML = '<iframe src="' + esc(c.url) + '" allowfullscreen></iframe>' +
      '<p class="hint"><a href="' + esc(R.cur.web) + '" target="_blank" rel="noopener">Open on archive.org</a> if the book does not load here.</p>';
  }
  body.dataset.lang = R.cur.lang;
  $('#rBody').scrollTop = y || 0;
}

function saveProgress() {
  if (!R.cur || !R.content || R.content.type === 'embed') return;
  const prog = store.get('prog', {});
  prog[R.cur.id] = { page: R.page, y: Math.round($('#rBody').scrollTop) };
  store.set('prog', prog);
}

function turnPage(d) {
  const c = R.content;
  if (!c || !c.pages) return;
  const n = R.page + d;
  if (n < 0 || n >= c.pages.length) return;
  R.page = n;
  renderPage(0);
  saveProgress();
}

/* ---------- appearance ---------- */
const THEMES = ['light', 'sepia', 'dark'];
const THEME_COLOR = { light: '#8a2f1b', sepia: '#7a3b12', dark: '#16120e' };
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set('theme', t);
  const m = $('meta[name="theme-color"]');
  if (m) m.setAttribute('content', THEME_COLOR[t]);
}
function setFs(n) {
  n = Math.max(14, Math.min(34, n));
  store.set('fs', n);
  document.documentElement.style.setProperty('--fs', n + 'px');
}

/* ---------- UI wiring ---------- */
function renderLangs() {
  $('#langs').innerHTML = LANGS.map(l =>
    '<button type="button" class="chip' + (l.code === state.lang ? ' on' : '') + '" data-lang="' + l.code + '">' + esc(l.name) + '</button>').join('');
  const on = $('#langs .on');
  if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function renderSuggest() {
  const list = SUGGEST[state.lang] || [];
  $('#suggest').innerHTML = list.map(s => '<button type="button" class="chip soft" data-q="' + esc(s) + '">' + esc(s) + '</button>').join('');
  $('#suggest').hidden = !list.length;
}

function showView(name) {
  ['explore', 'saved', 'about'].forEach(v => { $('#view-' + v).hidden = v !== name; });
  $$('.bottom button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  $('#main').scrollTop = 0;
  if (name === 'saved') renderSaved();
}

function init() {
  setTheme(store.get('theme', (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'));
  setFs(store.get('fs', 19));
  renderLangs();
  renderSuggest();

  $('#themeBtn').onclick = () => setTheme(THEMES[(THEMES.indexOf(document.documentElement.dataset.theme) + 1) % THEMES.length]);

  $('#langs').addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    state.lang = b.dataset.lang;
    store.set('lang', state.lang);
    renderLangs(); renderSuggest();
    loadResults(true);
  });

  $('#modes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    state.mode = b.dataset.mode;
    $$('#modes button').forEach(x => x.classList.toggle('on', x === b));
    loadResults(true);
  });

  $('#suggest').addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    $('#q').value = b.dataset.q;
    state.q = b.dataset.q;
    loadResults(true);
  });

  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    state.q = $('#q').value.trim();
    $('#q').blur();
    loadResults(true);
  });
  $('#q').addEventListener('input', () => {
    if ($('#q').value === '' && state.q !== '') { state.q = ''; loadResults(true); }
  });

  $('#moreBtn').onclick = () => loadResults(false);
  $$('.bottom button').forEach(b => { b.onclick = () => showView(b.dataset.view); });

  bindList($('#results'));
  bindList($('#savedList'), () => renderSaved());

  /* reader controls */
  $('#rBack').onclick = () => history.back();
  $('#rBigger').onclick = () => setFs(store.get('fs', 19) + 2);
  $('#rSmaller').onclick = () => setFs(store.get('fs', 19) - 2);
  $('#rSave').onclick = () => { if (!R.cur) return; toggleSave(R.cur, R.content); updateSaveBtn(); };
  $('#pPrev').onclick = () => turnPage(-1);
  $('#pNext').onclick = () => turnPage(1);

  let t = null;
  $('#rBody').addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(saveProgress, 400); });

  /* links inside Wikisource pages open in the reader; everything else goes to the browser */
  $('#rContent').addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href') || '';
    if (href.charAt(0) === '#') {
      let id = href.slice(1);
      try { id = decodeURIComponent(id); } catch (err) { /* keep raw id */ }
      const target = document.getElementById(id);
      if (target) target.scrollIntoView();
      return;
    }
    const m = href.match(/^https?:\/\/([a-z-]+)\.wikisource\.org\/wiki\/([^#?]+)/i);
    if (m) {
      let title = m[2];
      try { title = decodeURIComponent(title); } catch (err) { /* keep raw title */ }
      title = title.replace(/_/g, ' ');
      if (!/^(Special|File|Help|Wikisource|Category|Template|Talk|User|MediaWiki):/i.test(title)) {
        openReader(wsItem(m[1].toLowerCase(), title, '', false));
        return;
      }
    }
    if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
  });

  /* the phone's back button / gesture steps back through the reader */
  window.addEventListener('popstate', () => {
    if (!R.stack.length) return;
    saveProgress();
    R.stack.pop();
    if (R.stack.length) { $('#reader').hidden = false; showItem(R.stack[R.stack.length - 1]); }
    else closeReader();
  });

  /* offline page shell for the browser version; the Android app does not need it */
  const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !native) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  loadResults(true);
}

document.addEventListener('DOMContentLoaded', init);
