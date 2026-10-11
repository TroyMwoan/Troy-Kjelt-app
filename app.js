/* Moppenboek Troy & Kjelt – PWA (vanilla JS, geen build-stap) */
(() => {
'use strict';
const CFG = window.MOP_CONFIG;
const Q = new URLSearchParams(location.search);
const DEMO = Q.has('demo');
const SCOPES = 'openid email profile https://www.googleapis.com/auth/spreadsheets';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/' + CFG.SHEET_ID;
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const CATS = ['mop', 'titel', 'cover', 'verhaal', 'promo', 'overig'];
const CAT_IC = { mop: '😂', titel: '🏷️', cover: '🎨', verhaal: '🗺️', promo: '🎬', overig: '💡' };
const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
];
const REDIR = CFG.REDIRECT_URI;
const LS = (k, v) => v === undefined ? (() => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } })() : localStorage.setItem(k, JSON.stringify(v));

const S = {
  tab: LS('mop.tab') || 'ideeen', auth: LS('mop.auth'), who: null,
  ideas: LS('mop.cache.ideas') || [], chat: LS('mop.cache.chat') || [], conf: LS('mop.cache.conf') || {},
  fAuthor: 'alle', fCat: 'alle', busy: false, typing: false, needLogin: false, err: '', modal: null, sending: {},
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const nowIso = () => new Date().toISOString();
const fmt = (iso) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return iso; const t = new Date(); const same = d.toDateString() === t.toDateString(); return same ? 'vandaag ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); };
let toastT; const toast = (m, ms = 2600) => { S.toast = m; render(); clearTimeout(toastT); toastT = setTimeout(() => { S.toast = ''; render(); }, ms); };
const userKey = () => String(S.auth?.email || S.who || 'anon').toLowerCase();
const modelStoreKey = () => 'mop.model.' + userKey();
const hookStoreKey = () => 'mop.webhook.' + userKey();
const savedModel = () => { const v = LS(modelStoreKey()); return typeof v === 'string' ? v.trim() : ''; };
const sheetModel = () => String(S.conf.gemini_model || '').trim() || 'gemini-2.5-flash';
const activeModel = () => savedModel() || sheetModel();
const WEBHOOK_ADMINS = ['troygodijn@gmail.com', 'zoneromedia@gmail.com'];
const canSeeWebhook = () => WEBHOOK_ADMINS.includes(String(S.auth?.email || '').toLowerCase());
function webhookInUse() {
  const over = canSeeWebhook() ? (LS(hookStoreKey()) || {}) : {};
  const oUrl = String(over.url || '').trim(), oKey = String(over.key || '').trim();
  const sUrl = String(S.conf.webhook_url || '').trim(), sKey = String(S.conf.webhook_key || '').trim();
  return { url: oUrl || sUrl, key: oKey || sKey, overridden: !!(oUrl || oKey) };
}
function webhookProblem(w) {
  const urlOk = /^https:\/\//.test(w.url);
  if (urlOk && w.key) return '';
  if (w.overridden && !urlOk) return 'De webhook-overschrijving heeft geen geldige https-URL. Pas hem aan onder Geavanceerd, of wis de overschrijving.';
  if (w.overridden && !w.key) return 'Geen webhook-sleutel. Zet webhook_key in de Sheet, of vul een sleutel in onder Geavanceerd.';
  const miss = [];
  if (!urlOk) miss.push('webhook_url');
  if (!w.key) miss.push('webhook_key');
  return 'Geen webhook ingesteld: ' + miss.join(' en ') + ' ontbreekt in het tabblad Config van de Sheet.';
}

/* ---------- Wie is wie ---------- */
const list = (base, extra) => [...base, ...String(extra || '').split(',')].map((e) => e.trim().toLowerCase()).filter(Boolean);
function whoFor(email) {
  const e = String(email || '').toLowerCase();
  if (list(CFG.TROY_EMAILS, S.conf.troy_emails).includes(e)) return 'Troy';
  if (list(CFG.KJELT_EMAILS, S.conf.kjelt_emails).includes(e)) return 'Kjelt';
  return null;
}

/* ---------- Google-login (OAuth redirect, geen popups; login wordt onthouden) ---------- */
function goLogin(silent) {
  const state = Math.random().toString(36).slice(2);
  sessionStorage.setItem('mop.state', state);
  if (silent) sessionStorage.setItem('mop.silent', '1');
  const p = new URLSearchParams({ client_id: CFG.GOOGLE_CLIENT_ID, redirect_uri: REDIR, response_type: 'token', scope: SCOPES, include_granted_scopes: 'true', state, prompt: silent ? 'none' : (S.auth?.email ? 'consent' : 'select_account consent') });
  if (S.auth?.email) p.set('login_hint', S.auth.email);
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p);
}
async function handleRedirect() {
  if (!location.hash.includes('access_token') && !location.hash.includes('error=')) return;
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', REDIR + location.search);
  const silent = sessionStorage.getItem('mop.silent'); sessionStorage.removeItem('mop.silent');
  if (h.get('state') !== sessionStorage.getItem('mop.state')) { S.err = 'Inloggen afgebroken (ongeldige status). Probeer opnieuw.'; return; }
  if (h.get('error')) { S.needLogin = true; if (!silent) S.err = 'Inloggen lukte niet: ' + h.get('error'); return; }
  const token = h.get('access_token');
  const exp = Date.now() + (Number(h.get('expires_in')) || 3600) * 1000 - 60000;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  const u = r.ok ? await r.json() : {};
  S.auth = { token, exp, email: (u.email || '').toLowerCase(), name: u.given_name || u.name || '' };
  LS('mop.auth', S.auth);
}
const tokenOk = () => S.auth?.token && Date.now() < S.auth.exp;
function logout() {
  if (S.auth?.token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(S.auth.token), { method: 'POST' }).catch(() => {});
  ['mop.auth', 'mop.cache.ideas', 'mop.cache.chat', 'mop.cache.conf'].forEach((k) => localStorage.removeItem(k));
  S.auth = null; S.who = null; S.ideas = []; S.chat = []; S.conf = {}; S.needLogin = true; render();
}

/* ---------- Sheet ---------- */
async function api(path, opts = {}) {
  if (!tokenOk()) { goLogin(true); throw new Error('Even opnieuw inloggen…'); }
  const r = await fetch(SHEETS + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.auth.token, ...(opts.headers || {}) } });
  if (r.status === 401) { goLogin(true); throw new Error('Even opnieuw inloggen…'); }
  if (r.status === 403 || r.status === 404) throw new Error('Geen toegang tot de Moppenboek-Sheet met ' + S.auth.email + '.');
  if (!r.ok) throw new Error('Sheet-fout ' + r.status);
  return r.json();
}
const IDEA_COLS = ['id', 'auteur', 'titel', 'tekst', 'categorie', 'aangemaakt', 'status', 'team_samenvatting', 'team_advies', 'team_op'];
const CHAT_COLS = ['id', 'auteur', 'rol', 'tekst', 'tijd'];
const toObj = (cols, row, i) => Object.fromEntries([...cols.map((c, j) => [c, row[j] ?? '']), ['_row', i + 2]]);
async function load() {
  if (DEMO) return;
  const j = await api('/values:batchGet?' + ['Ideeen!A2:J', 'Chat!A2:E', 'Config!A2:B'].map((r) => 'ranges=' + encodeURIComponent(r)).join('&'));
  const [I, C, F] = j.valueRanges.map((v) => v.values || []);
  S.ideas = I.map((r, i) => toObj(IDEA_COLS, r, i)).filter((x) => x.id);
  S.chat = C.map((r, i) => toObj(CHAT_COLS, r, i)).filter((x) => x.id);
  const rows = F.map((r, i) => ({ key: String(r[0] || '').trim(), value: String(r[1] ?? '').trim(), row: i + 2 })).filter((r) => r.key);
  S.conf = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  S.confRow = Object.fromEntries(rows.map((r) => [r.key, r.row]));
  LS('mop.cache.ideas', S.ideas); LS('mop.cache.chat', S.chat); LS('mop.cache.conf', S.conf);
}
async function append(tab, row) {
  if (DEMO) return;
  await api('/values/' + encodeURIComponent(tab + '!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values: [row] }) });
}
async function setIdeaStatus(idea, status) {
  idea.status = status;
  if (DEMO) return;
  // rij opnieuw controleren (andere kan intussen iets hebben toegevoegd)
  const j = await api('/values/' + encodeURIComponent('Ideeen!A2:A'));
  const idx = (j.values || []).findIndex((r) => r[0] === idea.id);
  if (idx < 0) throw new Error('Idee niet gevonden in de Sheet.');
  await api('/values/' + encodeURIComponent('Ideeen!G' + (idx + 2)) + '?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: [[status]] }) });
}
async function setConf(key, value) {
  S.conf[key] = value;
  if (DEMO) return;
  const row = S.confRow?.[key];
  if (row) await api('/values/' + encodeURIComponent('Config!B' + row) + '?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: [[value]] }) });
  else await append('Config', [key, value, '']);
}

/* ---------- Ideeën ---------- */
async function addIdea({ titel, tekst, categorie }) {
  const it = { id: uid('idee'), auteur: S.who, titel, tekst, categorie, aangemaakt: nowIso(), status: 'nieuw', team_samenvatting: '', team_advies: '', team_op: '' };
  S.ideas.push(it); render();
  await append('Ideeen', IDEA_COLS.map((c) => it[c]));
}
async function sendToTeam(idea) {
  const hook = webhookInUse();
  const problem = webhookProblem(hook);
  if (problem) {
    if (canSeeWebhook()) { S.tab = 'instellingen'; LS('mop.tab', S.tab); if (hook.overridden) S.advOpen = true; toast(problem, 7000); }
    else toast('Naar het team lukt nu niet. Vraag Troy om dit in te stellen.', 7000);
    return;
  }
  S.sending[idea.id] = true; render();
  try {
    const payload = { bron: 'moppenboek-app', van: S.who, idee_id: idea.id, titel: idea.titel, tekst: idea.tekst, categorie: idea.categorie };
    if (!DEMO) {
      const r = await fetch(hook.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + hook.key }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'webhook-sleutel geweigerd' : 'webhook gaf ' + r.status);
    }
    await setIdeaStatus(idea, 'bij team');
    toast('Naar het team gestuurd 🚀');
  } catch (e) { toast('Versturen mislukt: ' + (canSeeWebhook() ? (e.message || e) : 'vraag Troy om de webhook te controleren.')); }
  finally { delete S.sending[idea.id]; render(); }
}

/* ---------- ORBIT (Gemini) ---------- */
const SYSTEM = `Je bent ORBIT, de vrolijke sparringpartner van Troy en Kjelt. Ze maken samen een moppenboek dat volledig door AI is geschreven.
Context: de Engelse versie heet "Pirate Bill's Best Deck of Jokes" (150 moppen voor kinderen vanaf 6, vijf hoofdstukken: Piraat Bill, Bosun Bear, First Mate Banana, Quartermaster Toad en de hele bemanning). Nu maken ze een Nederlandse versie (werktitel bijvoorbeeld "Piraat Bills Beste Moppenkist"). Later willen ze misschien een kinderboekenreeks "Troy & Kjelt gaan op avontuur", waarin Troy de flauwe woordgrappen maakt en Kjelt droog reageert.
Regels: antwoord in het Nederlands, kort en speels (maximaal ~120 woorden tenzij ze om een lijst vragen). Bedenk eigen, originele moppen die werken voor kinderen van 6–10 en die in het Nederlands kloppen (geen letterlijke vertaling van Engelse woordgrappen). Kopieer geen moppen letterlijk uit bestaande boeken. Elk bericht begint met [Troy] of [Kjelt]: zo weet je wie iets zegt; spreek die persoon aan. Een mop schrijf je als vraag op de eerste regel en de clou op de tweede.`;
async function askOrbit(text) {
  const msg = { id: uid('chat'), auteur: S.who, rol: 'user', tekst: text, tijd: nowIso() };
  S.chat.push(msg); S.typing = true; render(); scrollChat();
  append('Chat', CHAT_COLS.map((c) => msg[c])).catch((e) => toast(e.message));
  try {
    let reply;
    if (DEMO) { await new Promise((r) => setTimeout(r, 600)); reply = 'Ahoy ' + S.who + '! Hier een idee:\nWaarom zingt Piraat Bill nooit onder de douche?\nHij zingt liever op de hoge C!'; }
    else {
      const key = String(S.conf.gemini_key || '').trim();
      if (!key) throw new Error('Geen Gemini-sleutel in de Sheet (tabblad Config).');
      const contents = [];
      S.chat.slice(-24).forEach((m) => {
        const role = m.rol === 'orbit' ? 'model' : 'user';
        const t = role === 'user' ? `[${m.auteur}]: ${m.tekst}` : m.tekst;
        const last = contents[contents.length - 1];
        if (last && last.role === role) last.parts[0].text += '\n' + t; else contents.push({ role, parts: [{ text: t }] });
      });
      if (contents[0]?.role === 'model') contents.shift();
      const model = activeModel();
      const r = await fetch(GEMINI + encodeURIComponent(model) + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig: { temperature: 0.9, maxOutputTokens: 1024 } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 429 ? 'ORBIT is even te druk (quotum). Probeer zo opnieuw.' : 'ORBIT-fout ' + r.status);
      reply = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim() || '(ORBIT zei niets terug)';
    }
    const om = { id: uid('chat'), auteur: 'ORBIT', rol: 'orbit', tekst: reply, tijd: nowIso() };
    S.chat.push(om);
    await append('Chat', CHAT_COLS.map((c) => om[c]));
  } catch (e) { toast(e.message || String(e)); }
  finally { S.typing = false; render(); scrollChat(); }
}
const scrollChat = () => requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));

/* ---------- Render ---------- */
const av = (who, sm) => `<span class="av ${esc(who)}${sm ? ' sm' : ''}">${who === 'ORBIT' ? '◎' : esc((who || '?')[0])}</span>`;
function viewLogin() {
  const unknown = S.auth?.email && !S.who;
  return `<div class="login">
    <div class="duo">${av('Troy')}${av('Kjelt')}</div>
    <h1>Moppenboek<br><span style="color:var(--troy)">Troy</span> <span style="opacity:.35">&amp;</span> <span style="color:var(--kjelt)">Kjelt</span></h1>
    <p>Samen ideeën verzamelen, sparren met ORBIT en het team om advies vragen.</p>
    ${unknown ? `<p class="bad">${esc(S.auth.email)} hoort niet bij Troy of Kjelt. Log in met je eigen Google-account.</p>` : ''}
    ${S.err ? `<p class="bad">${esc(S.err)}</p>` : ''}
    <button class="gbtn" data-a="login"><svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Inloggen met Google</button>
    ${unknown ? `<p style="margin-top:14px"><button class="btn ghost sm" data-a="logout">Ander account</button></p>` : ''}
  </div>`;
}
function header() {
  return `<header class="top"><div class="logo"><div><span class="t">Troy</span> <span class="amp">&amp;</span> <span class="k">Kjelt</span><small>Moppenboek</small></div></div>
  <div class="me">${esc(S.who)} ${av(S.who, true)}</div></header>`;
}
function ideaCard(it) {
  const st = it.team_samenvatting ? 'klaar' : it.status === 'bij team' ? 'team' : '';
  const stTxt = it.team_samenvatting ? 'Team heeft gereageerd' : it.status === 'bij team' ? 'Bij het team…' : 'Nieuw';
  const sent = it.status === 'bij team' || it.team_samenvatting;
  return `<article class="card ${esc(it.auteur)}">
    <div class="hd">${av(it.auteur)}<div><div class="who ${esc(it.auteur)}">${esc(it.auteur)}</div><div class="when">${esc(fmt(it.aangemaakt))}</div></div>
    <span class="cat">${CAT_IC[it.categorie] || '💡'} ${esc(it.categorie || 'overig')}</span></div>
    ${it.titel ? `<h3>${esc(it.titel)}</h3>` : ''}${it.tekst ? `<p class="tx">${esc(it.tekst)}</p>` : ''}
    ${it.team_samenvatting ? `<div class="team"><div class="lbl">Mening van het team</div><p>${esc(it.team_samenvatting)}</p>${it.team_advies ? `<div class="lbl">Advies</div><p>${esc(it.team_advies)}</p>` : ''}${it.team_op ? `<div class="meta">${esc(fmt(it.team_op))}</div>` : ''}</div>` : ''}
    <div class="row"><span class="status ${st}">${stTxt}</span>
    <button class="btn sm ml ${sent ? 'ghost' : ''}" data-a="team" data-id="${esc(it.id)}" ${S.sending[it.id] ? 'disabled' : ''}>${S.sending[it.id] ? 'Versturen…' : sent ? 'Opnieuw naar het team' : 'Naar het team 🚀'}</button></div>
  </article>`;
}
function viewIdeas() {
  let xs = S.ideas.slice().reverse();
  if (S.fAuthor !== 'alle') xs = xs.filter((x) => x.auteur === S.fAuthor);
  if (S.fCat !== 'alle') xs = xs.filter((x) => x.categorie === S.fCat);
  const c = (k, v, lbl, cls = '') => `<button class="chip ${cls} ${S[k] === v ? 'on' : ''}" data-a="filter" data-k="${k}" data-v="${v}">${lbl}</button>`;
  return `<div class="chips">${c('fAuthor', 'alle', 'Iedereen')}${c('fAuthor', 'Troy', 'Troy', 'Troy')}${c('fAuthor', 'Kjelt', 'Kjelt', 'Kjelt')}</div>
  <div class="chips">${c('fCat', 'alle', 'Alles')}${CATS.map((k) => c('fCat', k, CAT_IC[k] + ' ' + k)).join('')}</div>
  ${xs.length ? xs.map(ideaCard).join('') : `<div class="empty"><div class="big">🏴‍☠️</div><p>Nog geen ideeën${S.fAuthor !== 'alle' || S.fCat !== 'alle' ? ' met dit filter' : ''}. Tik op <b>+ Idee</b> of spar met ORBIT.</p></div>`}
  <button class="fab ${esc(S.who)}" data-a="new">+ Idee</button>`;
}
function viewChat() {
  const ms = S.chat.map((m) => {
    const mine = m.auteur === S.who;
    return `<div class="msg ${esc(m.auteur)} ${mine ? 'mine' : ''}">${av(m.auteur, true)}<div class="bub"><div class="nm who ${esc(m.auteur)}">${esc(m.auteur)} · <span class="when">${esc(fmt(m.tijd))}</span></div><div class="bt">${esc(m.tekst)}</div>
      <div class="act"><button data-a="save" data-id="${esc(m.id)}">💡 Bewaar als idee</button></div></div></div>`;
  }).join('');
  return `<div class="chat">${ms || `<div class="empty"><div class="big">◎</div><p>Vraag ORBIT om moppen, titels of verhaalideeën. Troy en Kjelt zien allebei hetzelfde gesprek.</p></div>`}
  ${S.typing ? `<div class="typing">ORBIT denkt na…</div>` : ''}</div>
  <div class="composer"><div class="modelnote">Actief model: ${esc(activeModel())}</div><div class="in"><textarea id="say" rows="1" placeholder="Typ als ${esc(S.who)}…">${esc(LS('mop.draft') || '')}</textarea><button class="btn ${S.who === 'Troy' ? 'troy' : 'kjelt'}" data-a="send" ${S.typing ? 'disabled' : ''}>Stuur</button></div></div>`;
}
function viewSettings() {
  const w = webhookInUse();
  const problem = webhookProblem(w);
  const active = activeModel();
  const sheet = sheetModel();
  const chosen = !!savedModel();
  const showCustom = !!S.pickCustom || !MODELS.some((m) => m.id === active);
  const modelField = S.modelDraft != null ? S.modelDraft : (MODELS.some((m) => m.id === active) ? '' : active);
  const over = canSeeWebhook() ? (LS(hookStoreKey()) || {}) : {};
  const hookField = S.hookDraft != null ? S.hookDraft : String(over.url || '');
  const keyOn = !!(over.key || String(S.conf.webhook_key || '').trim());
  const status = problem
    ? `<span class="bad">${esc(problem)}</span>`
    : (w.overridden
      ? '<span class="ok">Actief ✓</span> Overschreven op dit apparaat. Zonder overschrijving geldt de Sheet.'
      : '<span class="ok">Actief ✓</span> Automatisch gelezen uit de Sheet.');
  const webhookBox = canSeeWebhook() ? `<div class="box"><h3>Naar het team</h3>
    <p>Na het inloggen leest de app <b>webhook_url</b> en <b>webhook_key</b> uit het tabblad Config. Je hoeft ze hier niet in te vullen.</p>
    <p>${status}</p>
    <details id="adv" ${S.advOpen ? 'open' : ''}><summary>Geavanceerd</summary>
      <p class="hint">Overschrijving alleen op dit apparaat, voor ${esc(S.who)}. Een leeg veld gebruikt de waarde uit de Sheet. De sleutel wordt nooit getoond.</p>
      <label class="f">Webhook-URL</label><input class="inp" id="hook" autocomplete="off" placeholder="https://… (leeg = Sheet)" value="${esc(hookField)}">
      <label class="f">Sender key ${over.key ? '(overschreven)' : keyOn ? '(uit de Sheet)' : ''}</label><input class="inp" id="hookkey" type="password" autocomplete="off" placeholder="${keyOn ? '••••••••' : 'alleen invullen om te overschrijven'}">
      <div class="row"><button class="btn sm" data-a="savehook">Opslaan</button><button class="btn ghost sm" data-a="clearhook">Wis overschrijving</button></div>
    </details></div>` : '';
  return `<div class="box"><h3>Ingelogd</h3><p>${av(S.who, true)} <b>${esc(S.who)}</b> · ${esc(S.auth?.email || 'demo')}</p><button class="btn ghost sm" data-a="logout">Uitloggen</button></div>
  ${webhookBox}
  <div class="box"><h3>ORBIT</h3>
    <p>${S.conf.gemini_key ? '<span class="ok">Sleutel in de Sheet ✓</span>' : '<span class="bad">Geen sleutel in de Sheet</span>'}</p>
    <p>Actief model: <b class="modelon">${esc(active)}</b>${chosen ? '' : ' <span class="hint">(standaard uit de Sheet)</span>'}</p>
    <p class="hint">Standaard in de Sheet: ${esc(sheet)}. Jouw keuze blijft op dit apparaat staan voor ${esc(S.auth?.email || S.who)}.</p>
    <label class="f">Model</label>
    <select class="inp" id="modelpick">${MODELS.map((m) => `<option value="${m.id}" ${!showCustom && active === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}<option value="__custom__" ${showCustom ? 'selected' : ''}>Eigen model-id</option></select>
    ${showCustom ? `<label class="f">Eigen model-id</label><input class="inp" id="modelcustom" autocomplete="off" placeholder="bijv. gemini-2.5-flash" value="${esc(modelField)}"><div class="row"><button class="btn sm" data-a="savemodel">Gebruik dit model</button></div>` : ''}
    ${chosen ? `<div class="row"><button class="btn ghost sm" data-a="resetmodel">Gebruik standaard uit de Sheet</button></div>` : ''}
  </div>
  <div class="box"><h3>Op je beginscherm</h3><p><b>iPhone:</b> open in Safari › deel-knop › "Zet op beginscherm".<br><b>Android:</b> open in Chrome › ⋮ › "App installeren" of "Toevoegen aan startscherm".</p></div>
  <div class="box"><h3>Data</h3><p>Alles staat in de Sheet "Moppenboek Troy &amp; Kjelt – App data".</p><a class="btn ghost sm" style="text-decoration:none;display:inline-block" target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/${esc(CFG.SHEET_ID)}/edit">Open de Sheet</a> <button class="btn ghost sm" data-a="refresh">Ververs nu</button></div>`;
}
function modal() {
  if (!S.modal) return '';
  const m = S.modal;
  return `<div class="sheetbg" data-a="close"><div class="sheet" data-stop>
    <h2>${m.fromChat ? 'Bewaar als idee' : 'Nieuw idee'} <span class="who ${esc(S.who)}" style="font-size:14px">· van ${esc(S.who)}</span></h2>
    <label class="f">Categorie</label><div class="catpick">${CATS.map((k) => `<button class="chip ${m.categorie === k ? 'on' : ''}" data-a="pickcat" data-v="${k}">${CAT_IC[k]} ${k}</button>`).join('')}</div>
    <label class="f">Titel</label><input class="inp" id="mt" value="${esc(m.titel)}" placeholder="Bijv. Waarom neemt een piraat een ladder mee?">
    <label class="f">Tekst</label><textarea class="inp" id="mx" placeholder="De mop, het idee of de uitleg">${esc(m.tekst)}</textarea>
    <div class="row"><button class="btn ghost" data-a="close">Annuleer</button><button class="btn ml ${S.who === 'Troy' ? 'troy' : 'kjelt'}" data-a="saveidea">Opslaan</button></div>
  </div></div>`;
}
function render() {
  if (S.modal && document.getElementById('mt')) readModal();
  const root = document.getElementById('app');
  const keep = document.getElementById('say'); const draft = keep ? keep.value : null; const focused = document.activeElement?.id;
  if (!S.who) { root.innerHTML = viewLogin(); return; }
  const body = S.tab === 'chat' ? viewChat() : S.tab === 'instellingen' ? viewSettings() : viewIdeas();
  const banner = !DEMO && !tokenOk() ? `<div class="banner">Je sessie is verlopen. <button class="btn sm ml" data-a="relogin">Ververs</button></div>` : '';
  const t = (k, ic, l) => `<button class="${S.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}"><span class="ic">${ic}</span>${l}</button>`;
  root.innerHTML = header() + `<main>${banner}${body}</main>` + `<nav class="tabs"><div class="in">${t('ideeen', '💡', 'Ideeën')}${t('chat', '◎', 'ORBIT')}${t('instellingen', '⚙️', 'Instellingen')}</div></nav>` + modal() + (S.toast ? `<div class="toast">${esc(S.toast)}</div>` : '');
  const say = document.getElementById('say');
  if (say) { if (draft !== null) say.value = draft; if (focused === 'say') say.focus(); }
}

/* ---------- Events ---------- */
document.addEventListener('input', (e) => {
  if (e.target.id === 'say') { LS('mop.draft', e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }
  if (e.target.id === 'modelcustom') S.modelDraft = e.target.value;
  if (e.target.id === 'hook') S.hookDraft = e.target.value;
});
document.addEventListener('toggle', (e) => { if (e.target.id === 'adv') S.advOpen = e.target.open; }, true);
document.addEventListener('change', (e) => {
  if (e.target.id !== 'modelpick') return;
  const v = e.target.value;
  if (v === '__custom__') { S.pickCustom = true; render(); return; }
  S.pickCustom = false; S.modelDraft = null;
  LS(modelStoreKey(), v);
  toast('Model opgeslagen: ' + v);
});
document.addEventListener('keydown', (e) => { if (e.target.id === 'say' && e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); act('send'); } });
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  if (el.dataset.a === 'close' && e.target.closest('[data-stop]') && el.classList.contains('sheetbg')) return;
  act(el.dataset.a, el);
});
function readModal() { if (S.modal) { S.modal.titel = document.getElementById('mt')?.value ?? S.modal.titel; S.modal.tekst = document.getElementById('mx')?.value ?? S.modal.tekst; } }
async function act(a, el) {
  try {
    if (a === 'login') return goLogin(false);
    if (a === 'relogin') return goLogin(true);
    if (a === 'logout') return logout();
    if (a === 'tab') { S.tab = el.dataset.v; LS('mop.tab', S.tab); render(); if (S.tab === 'chat') scrollChat(); return; }
    if (a === 'filter') { S[el.dataset.k] = el.dataset.v; return render(); }
    if (a === 'new') { S.modal = { titel: '', tekst: '', categorie: 'mop' }; return render(); }
    if (a === 'pickcat') { readModal(); S.modal.categorie = el.dataset.v; return render(); }
    if (a === 'close') { S.modal = null; return render(); }
    if (a === 'save') {
      const m = S.chat.find((x) => x.id === el.dataset.id); if (!m) return;
      const lines = m.tekst.split('\n').map((l) => l.trim()).filter(Boolean); const first = lines.find((l) => l.endsWith('?')) || lines.find((l) => !/[:!]$/.test(l)) || lines[0] || '';
      S.modal = { fromChat: true, titel: first.length > 70 ? first.slice(0, 67) + '…' : first, tekst: m.tekst, categorie: 'mop' }; return render();
    }
    if (a === 'saveidea') {
      readModal(); const { titel, tekst, categorie } = S.modal;
      if (!titel.trim() && !tekst.trim()) return toast('Vul een titel of tekst in.');
      S.modal = null; S.tab = 'ideeen'; LS('mop.tab', S.tab); S.fAuthor = 'alle'; S.fCat = 'alle';
      await addIdea({ titel: titel.trim(), tekst: tekst.trim(), categorie }); return toast('Idee opgeslagen ✓');
    }
    if (a === 'team') { const it = S.ideas.find((x) => x.id === el.dataset.id); if (it) await sendToTeam(it); return; }
    if (a === 'send') {
      const say = document.getElementById('say'); const v = (say?.value || '').trim(); if (!v || S.typing) return;
      say.value = ''; LS('mop.draft', ''); return askOrbit(v);
    }
    if (a === 'savemodel') {
      const id = (document.getElementById('modelcustom')?.value || '').trim();
      if (!/^[a-zA-Z0-9._-]{3,80}$/.test(id)) return toast('Vul een model-id in, bijvoorbeeld gemini-2.5-flash.');
      S.pickCustom = false; S.modelDraft = null;
      LS(modelStoreKey(), id);
      return toast('Model opgeslagen: ' + id);
    }
    if (a === 'resetmodel') {
      localStorage.removeItem(modelStoreKey());
      S.pickCustom = false; S.modelDraft = null;
      return toast('Standaard uit de Sheet: ' + activeModel());
    }
    if (a === 'savehook') {
      if (!canSeeWebhook()) return;
      const u = (document.getElementById('hook')?.value || '').trim();
      const k = (document.getElementById('hookkey')?.value || '').trim();
      if (u && !/^https:\/\/\S+$/.test(u)) return toast('De URL moet met https:// beginnen.');
      const prev = LS(hookStoreKey()) || {};
      const next = {};
      if (u) next.url = u;
      if (k) next.key = k; else if (prev.key) next.key = prev.key;
      S.advOpen = true; S.hookDraft = u;
      if (!next.url && !next.key) localStorage.removeItem(hookStoreKey());
      else LS(hookStoreKey(), next);
      return toast(next.url || next.key ? 'Overschrijving opgeslagen op dit apparaat.' : 'Overschrijving gewist. De Sheet geldt weer.');
    }
    if (a === 'clearhook') {
      if (!canSeeWebhook()) return;
      localStorage.removeItem(hookStoreKey());
      S.advOpen = true; S.hookDraft = '';
      return toast('Overschrijving gewist. De Sheet geldt weer.');
    }
    if (a === 'refresh') { await load(); render(); return toast('Bijgewerkt ✓'); }
  } catch (err) { toast(err.message || String(err)); render(); }
}

/* ---------- Start ---------- */
function demoSeed() {
  const demoId = String(Q.get('demo') || '');
  const email = demoId === 'kjelt' ? 'kjelt.framerush@gmail.com' : demoId === 'zonero' ? 'zoneromedia@gmail.com' : 'troygodijn@gmail.com';
  S.auth = { email, token: 'demo', exp: 9e15 };
  S.who = email.includes('kjelt') ? 'Kjelt' : 'Troy'; if (Q.get('tab')) S.tab = Q.get('tab');
  const t = (m) => new Date(Date.now() - m * 60000).toISOString();
  S.conf = { gemini_key: 'demo', gemini_model: 'gemini-2.5-flash', webhook_url: 'https://example.invalid/demo', webhook_key: 'demo' };
  S.ideas = [
    { id: 'i1', auteur: 'Troy', titel: 'Piraat Bills Beste Moppenkist', tekst: 'Als Nederlandse titel. Kist past bij de schat en bij een "kist vol moppen".', categorie: 'titel', aangemaakt: t(300), status: 'bij team', team_samenvatting: 'Het team vindt het een sterke titel: kort, piraterig en "moppenkist" is meteen duidelijk voor kinderen. Creative Director wil wel nog een check of de titel al bestaat.', team_advies: 'Ga voor "Piraat Bills Beste Moppenkist". Research checkt bij Bol en het CB of er al een boek met die naam is. Vormgeving maakt er een cover-schets bij.', team_op: t(120) },
    { id: 'i2', auteur: 'Kjelt', titel: 'Wat is het lievelingsvak van Piraat Bill?', tekst: 'Aaarrr-drijkskunde!', categorie: 'mop', aangemaakt: t(200), status: 'nieuw', team_samenvatting: '', team_advies: '', team_op: '' },
    { id: 'i3', auteur: 'Troy', titel: 'Kikker Kwartiermeester', tekst: 'Quartermaster Toad wordt in het Nederlands "Kwartiermeester Kikker": allitereert en kinderen kunnen het makkelijk zeggen.', categorie: 'verhaal', aangemaakt: t(60), status: 'bij team', team_samenvatting: '', team_advies: '', team_op: '' },
    { id: 'i4', auteur: 'Kjelt', titel: 'Moppenduel-filmpjes', tekst: 'Troy vertelt de mop, ik geef alleen een droge blik. Eindigen met de cover.', categorie: 'promo', aangemaakt: t(20), status: 'nieuw', team_samenvatting: '', team_advies: '', team_op: '' },
  ];
  S.chat = [
    { id: 'c1', auteur: 'Troy', rol: 'user', tekst: 'Geef een piratenmop met Bosun Bear, voor kinderen van 7.', tijd: t(40) },
    { id: 'c2', auteur: 'ORBIT', rol: 'orbit', tekst: 'Ahoy Troy! Eentje voor Bootsman Beer:\n\nHoe vindt Bootsman Beer zijn nieuwe piratenhoed?\nBeregoed!', tijd: t(39) },
    { id: 'c3', auteur: 'Kjelt', rol: 'user', tekst: 'Die tweede is beter. Kan Bill ook iets met een schatkaart?', tijd: t(30) },
    { id: 'c4', auteur: 'ORBIT', rol: 'orbit', tekst: 'Goeie, Kjelt!\nWaarom is Piraat Bill zo goed in rekenen?\nHij weet altijd precies waar X ligt!', tijd: t(29) },
  ];
}
async function start() {
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register(CFG.BASE_PATH + 'sw.js', { scope: CFG.BASE_PATH }).catch(() => {});
  if (DEMO) { demoSeed(); render(); return; }
  await handleRedirect().catch((e) => { S.err = e.message; });
  if (S.auth?.email) S.who = whoFor(S.auth.email);
  // verlopen maar bekend account: stil vernieuwen (geen keuzescherm), één keer per sessie
  if (S.auth?.email && !tokenOk() && !S.needLogin && !sessionStorage.getItem('mop.tried')) { sessionStorage.setItem('mop.tried', '1'); return goLogin(true); }
  if (tokenOk()) sessionStorage.removeItem('mop.tried');
  render();
  if (S.who && tokenOk()) {
    try { await load(); S.who = whoFor(S.auth.email); } catch (e) { toast(e.message); }
    render();
  }
  setInterval(async () => { if (document.visibilityState === 'visible' && S.who && tokenOk() && !S.modal) { try { await load(); render(); } catch { /* stil */ } } }, 30000);
  document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && S.who) { if (!tokenOk()) return goLogin(true); try { await load(); render(); } catch { /* stil */ } } });
}
start();
})();
