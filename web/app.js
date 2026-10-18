'use strict';
/* Onda: cliente ligero para Spotify. Solo usa la Web API oficial y el Web Playback SDK. */

const VERSION = '1.2.2';
const REPO = 'https://github.com/okdigitalcontacto-boop/onda';
const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REDIRECT = location.origin + '/callback';
const LOCAL_NAME = 'Onda · PC';
const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
  'user-read-recently-played', 'user-top-read', 'playlist-read-private', 'playlist-read-collaborative',
  'user-library-read', 'user-library-modify', 'user-follow-read', 'user-follow-modify',
].join(' ');
const CONFIG = window.ONDA_CONFIG || {};

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = ms => { const s = Math.max(0, Math.floor((ms || 0) / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const idOf = uri => (uri || '').split(':')[2];
const store = {
  get(k) { try { return localStorage.getItem('onda.' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('onda.' + k) : localStorage.setItem('onda.' + k, v); } catch { } },
};
const ownClientId = () => store.get('client_id') || '';
const CID = () => ownClientId() || CONFIG.clientId || '';
const TYPING = 'input:not([type]), input[type=text], input[type=search], input[type=url], textarea, [contenteditable=""], [contenteditable="true"]';

function pickImg(images, min = 64) {
  if (!images?.length) return '';
  const s = [...images].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (s.find(i => (i.width || 9999) >= min) || s[s.length - 1]).url;
}
const bigSize = () => (prefs.covers === 'high' ? 600 : 280);
function plainText(html) { return new DOMParser().parseFromString(html || '', 'text/html').body.textContent || ''; }

/* Puente con la parte de escritorio (Python). Fuera de Onda (por ejemplo en un navegador) devuelve null. */
function pyReady() {
  return new Promise(res => {
    if (window.pywebview?.api) return res(true);
    const t = setTimeout(() => res(!!window.pywebview?.api), 3000);
    window.addEventListener('pywebviewready', () => { clearTimeout(t); res(true); }, { once: true });
  });
}
async function py(name, ...args) {
  try {
    await pyReady();
    const f = window.pywebview?.api?.[name];
    return f ? await f(...args) : null;
  } catch (e) { logError('Escritorio (' + name + '): ' + (e?.message || e)); return null; }
}
function openExternal(url) {
  if (window.pywebview?.api?.open_url) window.pywebview.api.open_url(url); else window.open(url, '_blank');
}

/* ---------- registro de errores (para diagnosticar fallos) ---------- */
const errLog = (() => { try { return JSON.parse(store.get('errors') || '[]'); } catch { return []; } })();
function logError(text) {
  errLog.unshift({ t: new Date().toLocaleString('es-ES'), text: String(text).slice(0, 300) });
  errLog.length = Math.min(errLog.length, 30);
  store.set('errors', JSON.stringify(errLog));
}
window.addEventListener('error', e => logError(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', e => logError('Promesa sin resolver: ' + (e.reason?.message || e.reason)));

/* ---------- iconos ---------- */
const FILL = {
  play: '<path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.8-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>',
  next: '<path d="M5 6.3v11.4a.9.9 0 0 0 1.4.75l8.5-5.7a.9.9 0 0 0 0-1.5L6.4 5.55A.9.9 0 0 0 5 6.3z"/><rect x="16.5" y="5" width="2.4" height="14" rx="1"/>',
  prev: '<path d="M19 6.3v11.4a.9.9 0 0 1-1.4.75l-8.5-5.7a.9.9 0 0 1 0-1.5l8.5-5.7A.9.9 0 0 1 19 6.3z"/><rect x="5.1" y="5" width="2.4" height="14" rx="1"/>',
  heartOn: '<path d="M12 20.2s-7.7-4.7-7.7-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.7 2.6c0 5.7-7.7 10.4-7.7 10.4z"/>',
  dots: '<circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/>',
  pinOn: '<path d="M9 3.5h6l-.8 6 3.3 3.3v1.7h-4.6V21L12 22l-.9-1v-6.5H6.5v-1.7l3.3-3.3z"/>',
};
const STROKE = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  library: '<path d="M5 4v16M10 4v16M14.5 4.6l4.2 15"/>',
  queue: '<path d="M4 6h13M4 11.5h13M4 17h7"/><path d="M15 15v5.5l4.5-2.75z"/>',
  foryou: '<path d="M12 3.5l2.3 5.2 5.7.6-4.3 3.8 1.2 5.6L12 15.8l-4.9 2.9 1.2-5.6L4 9.3l5.7-.6z"/>',
  shuffle: '<path d="M3 17h3c2 0 3.2-1 4.4-2.8l2.2-3.4C13.8 9 15 8 17 8h4M18 5l3 3-3 3M3 7h3c1.4 0 2.4.5 3.3 1.4M14.7 15.6c.9.9 1.9 1.4 3.3 1.4h3M18 14l3 3-3 3"/>',
  repeat: '<path d="M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1"/>',
  heart: '<path d="M12 20.2s-7.7-4.7-7.7-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.7 2.6c0 5.7-7.7 10.4-7.7 10.4z"/>',
  speaker: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><circle cx="12" cy="14" r="3"/><path d="M12 7.4v.2"/>',
  phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.4"/><path d="M11 18h2"/>',
  laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
  volume: '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  pin: '<path d="M9 3.5h6l-.8 6 3.3 3.3v1.7H6.5v-1.7l3.3-3.3zM12 14.5V21"/>',
};
function icon(n, cls = '') {
  const inner = FILL[n]
    ? `<g fill="currentColor">${FILL[n]}</g>`
    : `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${STROKE[n]}</g>`;
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}

/* ---------- avisos ---------- */
let toastT = null;
function toast(text, ms = 4200) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- ajustes ---------- */
// Listas de Spotify que vienen fijadas de serie. Se pueden quitar o añadir otras.
// Spotify no deja leer su contenido desde apps externas; solo reproducirlas.
const PRESET_PINS = [
  { uri: 'spotify:playlist:37i9dQZF1EYkqdzj48dyYq', name: 'DJ', sub: 'Tu DJ de Spotify', color: '#3d5afe' },
  { uri: 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd', name: 'RapCaviar', sub: 'Lista de Spotify', color: '#d6336c' },
  { uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M', name: "Today's Top Hits", sub: 'Lista de Spotify', color: '#2f9e44' },
];
const DEFAULTS = {
  features: { search: true, library: true, foryou: true, queue: true, sidePlaylists: true, likes: true, localPlayback: true },
  theme: 'system', accent: 'cover', wash: 'normal', density: 'comfy',
  zoom: 1, reduceMotion: false, contrast: false,
  covers: 'normal', autoClean: true, trimMinimized: true, fade: 0,
  pins: null,
};
function loadPrefs() {
  let p = {};
  try { p = JSON.parse(store.get('prefs') || '{}'); } catch { }
  const out = { ...DEFAULTS, ...p, features: { ...DEFAULTS.features, ...(p.features || {}) } };
  if (!Array.isArray(out.pins)) out.pins = PRESET_PINS.map(x => ({ ...x }));
  out.pins.forEach(p => { if (p.sub === 'Tu DJ de Spotify · experimental') p.sub = 'Tu DJ de Spotify'; }); // ajustes guardados con la 1.1
  return out;
}
let prefs = loadPrefs();
function savePrefs() {
  store.set('prefs', JSON.stringify(prefs));
  py('set_prefs', { autoClean: prefs.autoClean, trimMinimized: prefs.trimMinimized });
}

const VIEW_FEATURE = { search: 'search', library: 'library', queue: 'queue', foryou: 'foryou' };
const navEnabled = name => !VIEW_FEATURE[name] || prefs.features[VIEW_FEATURE[name]];
const firstView = () => ['foryou', 'library', 'search', 'queue'].find(navEnabled) || 'library';
const WASH = { off: '0%', soft: '20%', normal: null, strong: '64%' };
const NEUTRAL = 'rgb(128 128 136)';
let coverTint = null;

function applyPrefs() {
  const r = document.documentElement, b = document.body, f = prefs.features;
  if (prefs.theme === 'system') delete r.dataset.theme; else r.dataset.theme = prefs.theme;
  r.style.zoom = prefs.zoom !== 1 ? String(prefs.zoom) : '';
  r.style.setProperty('--z', String(prefs.zoom));
  b.classList.toggle('reduce-motion', prefs.reduceMotion);
  b.classList.toggle('contrast', prefs.contrast);
  b.classList.toggle('compact', prefs.density === 'compact');
  b.classList.toggle('no-likes', !f.likes);
  b.classList.toggle('no-queue', !f.queue);
  b.classList.toggle('no-sidepl', !f.sidePlaylists);
  if (WASH[prefs.wash]) r.style.setProperty('--wash', WASH[prefs.wash]); else r.style.removeProperty('--wash');
  applyTint();
  document.querySelectorAll('.nav[data-nav]').forEach(n => { n.hidden = !navEnabled(n.dataset.nav); });
}
function applyTint() {
  const c = prefs.accent === 'cover' ? (coverTint || NEUTRAL) : prefs.accent;
  document.documentElement.style.setProperty('--tint', c);
}

/* ---------- sesión (OAuth con PKCE, sin secreto) ---------- */
class AuthError extends Error { }

function b64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function randomString(n = 64) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n); }
async function challenge(v) { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))); }

async function login() {
  const verifier = randomString(64), state = randomString(16);
  store.set('verifier', verifier);
  store.set('state', state);
  const q = new URLSearchParams({
    client_id: CID(), response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES, state,
    code_challenge_method: 'S256', code_challenge: await challenge(verifier),
  });
  location.href = 'https://accounts.spotify.com/authorize?' + q;
}

async function handleCallback() {
  if (location.pathname !== '/callback') return;
  const q = new URLSearchParams(location.search);
  history.replaceState(null, '', '/');
  if (q.get('error')) throw new Error(q.get('error') === 'access_denied'
    ? 'Has cancelado el acceso. Pulsa Conectar con Spotify para intentarlo de nuevo.'
    : 'Spotify no ha dado acceso (' + q.get('error') + '). Revisa el Client ID y la Redirect URI.');
  if (!q.get('code') || q.get('state') !== store.get('state')) throw new Error('El inicio de sesión no se ha completado. Vuelve a pulsar Conectar con Spotify.');
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: q.get('code'), redirect_uri: REDIRECT,
      client_id: CID(), code_verifier: store.get('verifier'),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Spotify ha rechazado el inicio de sesión: ' + (j.error_description || j.error || r.status));
  saveToken(j);
  store.set('verifier', null);
  store.set('state', null);
}

function saveToken(j) {
  store.set('access', j.access_token);
  store.set('exp', String(Date.now() + (j.expires_in - 60) * 1000));
  if (j.refresh_token) store.set('refresh', j.refresh_token);
  if (j.scope) store.set('scope', j.scope);
}

let refreshing = null;
async function getToken() {
  if (store.get('access') && Date.now() < +store.get('exp')) return store.get('access');
  if (!refreshing) refreshing = refreshToken().finally(() => { refreshing = null; });
  return refreshing;
}
async function refreshToken() {
  const rt = store.get('refresh');
  if (!rt) throw new AuthError('Sin sesión');
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: CID() }),
  });
  if (!r.ok) {
    if (r.status === 400 || r.status === 401) { store.set('access', null); store.set('refresh', null); throw new AuthError('Sesión caducada'); }
    throw new Error('No se ha podido renovar la sesión. Comprueba tu conexión a internet.');
  }
  const j = await r.json();
  saveToken(j);
  return j.access_token;
}
const hasScope = s => (store.get('scope') || '').split(' ').includes(s);

function logout() {
  ['access', 'exp', 'refresh', 'scope'].forEach(k => store.set(k, null));
  try { sdk?.disconnect(); } catch { }
  location.replace('/');
}

/* ---------- API ---------- */
async function api(path, { method = 'GET', body, query } = {}) {
  let url = path.startsWith('http') ? path : API + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''));
    if ([...qs].length) url += (url.includes('?') ? '&' : '?') + qs;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = { Authorization: 'Bearer ' + await getToken() };
    if (body) headers['Content-Type'] = 'application/json';
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && attempt === 0) { store.set('exp', '0'); continue; }
    if (r.status === 429) {
      const wait = Math.min(+(r.headers.get('Retry-After') || 2), 10);
      if (attempt < 2) { await sleep(wait * 1000); continue; }
    }
    if (r.status === 204 || r.status === 202) return null;
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch { }
    if (!r.ok) {
      const e = new Error(j?.error?.message || 'Error ' + r.status);
      e.status = r.status;
      e.reason = j?.error?.reason || j?.reason;
      e.path = path.replace(API, '').split('?')[0];
      throw e;
    }
    return j;
  }
  throw new Error('Spotify no responde ahora mismo. Prueba de nuevo en unos segundos.');
}

function msg(e) {
  if (e instanceof AuthError) return 'Tu sesión ha caducado. Vuelve a conectar con Spotify.';
  logError(`${e.status || ''} ${e.reason || ''} ${e.path || ''} ${e.message}`.trim());
  const reasons = {
    PREMIUM_REQUIRED: 'Esto necesita Spotify Premium en la cuenta conectada.',
    VOLUME_CONTROL_DISALLOW: 'Ese dispositivo no deja cambiar el volumen desde fuera. Cámbialo en el propio dispositivo.',
    NO_PREV_TRACK: 'No hay canción anterior.',
    NO_NEXT_TRACK: 'No hay más canciones en la cola.',
    NO_ACTIVE_DEVICE: 'No hay ningún dispositivo activo. Elige uno con el botón de dispositivos de abajo a la derecha.',
    QUOTA_EXCEEDED: 'Has llegado al límite de peticiones de Spotify por ahora. Espera un par de minutos.',
  };
  if (e.reason && reasons[e.reason]) return reasons[e.reason];
  if (/not registered/i.test(e.message)) return 'Tu cuenta no está autorizada en esta app de Onda. Pide que te añadan en el panel de Spotify (User Management) o usa tu propia app desde ··· → Cuenta → Cambiar Client ID.';
  if (/scope/i.test(e.message)) return 'Falta un permiso. Ve a ··· → Cuenta y pulsa Volver a conectar con Spotify.';
  if (e.status === 404) return reasons.NO_ACTIVE_DEVICE;
  if (e.status === 403) return 'Spotify no permite esta acción (' + e.message + ').';
  if (e instanceof TypeError) return 'Sin conexión con Spotify. Comprueba tu internet.';
  return e.message;
}

/* ---------- estado ---------- */
let me = null;
let sdk = null, localId = null, sdkScript = false;
let pb = null, pbAt = 0, endKick = false;
let seeking = false, volDragging = false;
const likeMap = new Map();
const cardCache = new Map();
let lists = {};
let myPls = [];
window.ondaBusy = () => isLocal() && !!pb?.playing; // la parte de escritorio lo consulta antes de ahorrar memoria

/* ---------- primer arranque ---------- */
function showSetup(error) {
  $('#app').hidden = true;
  const s = $('#setup');
  s.hidden = false;
  const builtIn = !!CONFIG.clientId && !ownClientId();
  const hasId = !!CID();
  s.innerHTML = `
    <div class="setup-card">
      <div class="brand">Onda</div>
      <p class="lede">Tu Spotify, solo con lo que usas.</p>
      <div id="steps" ${hasId ? 'hidden' : ''}>
        <ol class="steps">
          <li>Abre el <span class="ext" data-ext="https://developer.spotify.com/dashboard">panel de desarrolladores de Spotify</span>, entra con tu cuenta y pulsa <b>Create app</b>.</li>
          <li>En <b>App name</b> pon <b>Onda</b> y en <b>App description</b> lo que quieras, por ejemplo «Reproductor personal».</li>
          <li>En <b>Redirect URIs</b> pega esta dirección y pulsa <b>Add</b>:
            <div class="uri"><code>${esc(REDIRECT)}</code><button class="chip" data-copy>Copiar</button></div></li>
          <li>En <b>Which API/SDKs are you planning to use?</b> marca <b>Web API</b> y <b>Web Playback SDK</b>. Acepta las condiciones y pulsa <b>Save</b>.</li>
          <li>Dentro de la app que acabas de crear, pulsa <b>Settings</b> y copia el <b>Client ID</b>. Onda lo detecta solo al volver a esta ventana.</li>
        </ol>
        <div class="field">
          <label for="cid">Client ID</label>
          <input id="cid" spellcheck="false" autocomplete="off" placeholder="32 letras y números" value="${esc(ownClientId())}">
          <small class="hint" id="cidHint" hidden>Client ID pegado desde el portapapeles.</small>
        </div>
      </div>
      <div class="setup-row">
        <button class="primary" id="connect">${builtIn ? 'Iniciar sesión con Spotify' : 'Conectar con Spotify'}</button>
        ${hasId ? `<button class="link" id="changeId">${builtIn ? 'Usar mi propia app de Spotify' : 'Cambiar Client ID'}</button>` : ''}
      </div>
      <p class="setup-msg" id="setupMsg" ${error ? '' : 'hidden'}>${esc(error || '')}</p>
    </div>`;

  const sniff = async () => {
    const inp = $('#cid');
    if (!inp || $('#steps').hidden || inp.value.trim()) return;
    const text = await py('read_clipboard');
    if (text && /^[0-9a-f]{32}$/i.test(text)) { inp.value = text; $('#cidHint').hidden = false; }
  };
  window.onfocus = sniff;
  s.onclick = e => {
    const ext = e.target.closest('[data-ext]');
    if (ext) openExternal(ext.dataset.ext);
    if (e.target.closest('[data-copy]')) navigator.clipboard.writeText(REDIRECT).then(() => toast('Dirección copiada'), () => toast('No se ha podido copiar. Selecciónala y cópiala a mano.'));
    if (e.target.id === 'changeId') { $('#steps').hidden = false; e.target.remove(); $('#cid').focus(); sniff(); }
  };
  $('#connect').onclick = () => {
    const inp = $('#cid');
    if (inp && !$('#steps').hidden) {
      const v = inp.value.trim();
      if (!/^[0-9a-f]{32}$/i.test(v)) {
        const m = $('#setupMsg');
        m.hidden = false;
        m.textContent = 'El Client ID tiene 32 letras y números. Cópialo desde Settings de tu app en el panel de Spotify.';
        inp.focus();
        return;
      }
      store.set('client_id', v);
    }
    login();
  };
}

/* ---------- arranque ---------- */
async function boot() {
  applyPrefs();
  try { await handleCallback(); } catch (e) { return showSetup(e.message); }
  if (!CID() || !store.get('refresh')) return showSetup();
  try { me = await api('/me'); } catch (e) { return showSetup(msg(e)); }
  startApp();
}

function startApp() {
  window.onfocus = null;
  $('#setup').hidden = true;
  $('#app').hidden = false;
  renderSide();
  renderBar();
  $('#app').insertAdjacentHTML('beforeend', `<button class="ib more-btn" id="moreBtn" title="Más opciones" aria-label="Más opciones" aria-haspopup="menu">${icon('dots')}</button>`);
  applyPrefs();
  if (prefs.features.localPlayback) loadSdk();
  bindGlobal();
  go(firstView(), firstView() === 'library' ? 'playlists' : null);
  myPlaylists().then(renderSideList).catch(() => { });
  schedulePoll(300);
  setInterval(tick, 500);
  savePrefs();
  afterCacheClean();
  if (!store.get('onboarded')) setTimeout(openOnboarding, 700);
}

/* ---------- reproductor del PC (Web Playback SDK) ---------- */
function loadSdk() {
  window.onSpotifyWebPlaybackSDKReady = () => {
    if (sdk) return;
    sdk = new Spotify.Player({
      name: LOCAL_NAME,
      getOAuthToken: cb => getToken().then(cb).catch(() => { }),
      volume: +(store.get('vol') || 70) / 100,
    });
    sdk.addListener('ready', ({ device_id }) => { localId = device_id; soon(); resumeAfterClean(); });
    sdk.addListener('not_ready', () => { localId = null; });
    sdk.addListener('player_state_changed', s => { if (s) fromSdk(s); });
    sdk.addListener('initialization_error', ({ message }) => { logError('SDK inicio: ' + message); toast('Este equipo no puede reproducir dentro de Onda. Puedes seguir usándola como mando de tus otros dispositivos.'); });
    sdk.addListener('authentication_error', ({ message }) => logError('SDK sesión: ' + message));
    sdk.addListener('account_error', ({ message }) => { logError('SDK cuenta: ' + message); toast('Para que suene en el PC hace falta Spotify Premium.'); });
    sdk.addListener('playback_error', ({ message }) => { logError('SDK reproducción: ' + message); toast('No se ha podido reproducir eso en el PC.'); });
    sdk.connect();
  };
  if (window.Spotify?.Player) { window.onSpotifyWebPlaybackSDKReady(); return; }
  if (sdkScript) return;
  sdkScript = true;
  const s = document.createElement('script');
  s.src = 'https://sdk.scdn.co/spotify-player.js';
  s.onerror = () => { sdkScript = false; logError('No carga sdk.scdn.co'); toast('No se ha podido cargar el reproductor de Spotify. Comprueba tu internet.'); };
  document.head.appendChild(s);
}
function setLocalPlayback(on) {
  if (on) { if (sdk) sdk.connect(); else loadSdk(); return; }
  if (sdk) { try { sdk.disconnect(); } catch { } }
  sdk = null;
  localId = null;
  soon();
}

const isLocal = () => !!localId && pb?.device?.id === localId;
const targetDevice = () => pb?.device?.id || localId || undefined;

function fromApi(j) {
  if (!j || (!j.item && !j.device)) return null;
  const it = j.item;
  return {
    device: j.device || null,
    playing: !!j.is_playing,
    progress: j.progress_ms || 0,
    duration: it?.duration_ms || 0,
    shuffle: !!j.shuffle_state,
    repeat: j.repeat_state || 'off',
    item: it ? {
      uri: it.uri, id: it.id, name: it.name,
      artists: it.artists || (it.show ? [{ name: it.show.name }] : []),
      album: it.album || { name: it.show?.name, images: it.images || it.show?.images || [] },
    } : null,
  };
}

function fromSdk(s) {
  if (!localId) return;
  const t = s.track_window?.current_track;
  setState({
    device: { id: localId, name: LOCAL_NAME, type: 'Computer', volume_percent: +(store.get('vol') || 70) },
    playing: !s.paused,
    progress: s.position,
    duration: s.duration,
    shuffle: !!s.shuffle,
    repeat: ['off', 'context', 'track'][s.repeat_mode] || 'off',
    item: t ? {
      uri: t.uri, id: t.id, name: t.name,
      artists: (t.artists || []).map(a => ({ name: a.name, id: idOf(a.uri) })),
      album: { id: idOf(t.album?.uri), name: t.album?.name, images: t.album?.images || [] },
    } : null,
  });
}

function setState(st) {
  const prevUri = pb?.item?.uri;
  pb = st;
  pbAt = Date.now();
  endKick = false;
  updateBar();
  if ((st?.item?.uri || null) !== (prevUri || null)) onTrackChange();
}

let pollT = null;
function schedulePoll(ms) { clearTimeout(pollT); pollT = setTimeout(refreshState, ms); }
function soon() { schedulePoll(700); }
async function refreshState() {
  try {
    const st = fromApi(await api('/me/player', { query: { additional_types: 'episode' } }));
    const sdkRules = sdk && localId && isLocal() && st?.device?.id === localId; // el SDK ya avisa de todo al momento
    if (!sdkRules && (st || !isLocal())) setState(st);
  } catch { }
  finally {
    schedulePoll(document.hidden ? 30000 : (isLocal() && pb?.playing ? 15000 : 4000));
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && me) soon(); });

function curPos() {
  if (!pb) return 0;
  return pb.playing ? Math.min(pb.duration, pb.progress + Date.now() - pbAt) : pb.progress;
}
function tick() {
  if (!pb?.item) return;
  const cur = curPos();
  if (!seeking) {
    setRange($('#seek'), pb.duration ? cur / pb.duration * 1000 : 0);
    $('#tCur').textContent = fmt(cur);
  }
  if (pb.playing && !endKick && pb.progress + Date.now() - pbAt > pb.duration + 1500) { endKick = true; soon(); }
}

/* ---------- fundido entre canciones (solo cuando suena en este PC) ----------
   Spotify no deja mezclar dos canciones desde apps externas, así que no es un crossfade real:
   Onda baja el volumen al final de cada canción y lo sube al empezar la siguiente. */
const fade = { low: false, inUri: null, lastSent: null, syncAt: 0 };
const baseVol = () => +(store.get('vol') || 70) / 100;
const fadeMs = () => (prefs.fade || 0) * 1000;
const fadeInMs = () => Math.min(fadeMs() * 0.6, 4000);
function sendVol(v) {
  v = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
  if (v === fade.lastSent) return; // no repetir órdenes iguales al reproductor
  fade.lastSent = v;
  try { sdk?.setVolume(v)?.catch?.(() => { }); } catch { }
}
// Se llama cada 100 ms. Sin estados que se puedan quedar a medias: el volumen depende solo de
// cuánto queda de canción (al final) o de cuánto lleva (al empezar después de un fundido).
function fadeLoop() {
  if (!sdk || !localId) return;
  const F = fadeMs();
  if (!F || !isLocal() || !pb?.item) {
    if (fade.low || fade.inUri) { fade.low = false; fade.inUri = null; sendVol(baseVol()); }
    return;
  }
  if (!pb.playing) return; // en pausa (también el instante entre canciones) no se toca el volumen
  const cur = curPos(), left = pb.duration - cur;
  // Cerca del final, pide al reproductor la posición exacta en vez de fiarse de la estimación
  if (left < F + 2500 && Date.now() - fade.syncAt > 400) {
    fade.syncAt = Date.now();
    const uri = pb.item.uri;
    sdk.getCurrentState?.().then(st => {
      if (st && !st.paused && st.track_window?.current_track?.uri === uri && pb?.item?.uri === uri) { pb.progress = st.position; pbAt = Date.now(); }
    }).catch(() => { });
  }
  let g = 1;
  if (pb.duration > F * 2 && left <= F) g = Math.max(0, left / F);
  if (fade.inUri === pb.item.uri) {
    const k = cur / fadeInMs();
    if (k < 1) g = Math.min(g, k); else fade.inUri = null;
  }
  fade.low = g < 0.999;
  sendVol(baseVol() * g * g); // curva cuadrática: al oído baja y sube de forma más natural que en línea recta
}
setInterval(fadeLoop, 100);
function fadeOnTrackChange() {
  // Si la canción anterior terminó con el volumen bajado, la nueva empieza en silencio y sube
  if (fade.low && fadeMs() && isLocal() && pb?.item) { fade.inUri = pb.item.uri; sendVol(0); }
  else if (fade.inUri && fade.inUri !== pb?.item?.uri) fade.inUri = null;
  fade.low = false;
}

/* ---------- órdenes ---------- */
const noDevice = e => e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE';

async function cmd(fn) {
  try { await fn(); }
  catch (e) {
    if (noDevice(e) && localId) {
      try {
        await api('/me/player', { method: 'PUT', body: { device_ids: [localId], play: false } });
        await sleep(600);
        await fn();
      } catch (e2) { toast(msg(e2)); }
    } else toast(msg(e));
  }
  soon();
}

async function play(body, { fallback = null, failText = '' } = {}) {
  const run = (b, dev) => api('/me/player/play', { method: 'PUT', query: { device_id: dev }, body: b });
  const dev = targetDevice();
  try { await run(body, dev); }
  catch (e) {
    try {
      if (noDevice(e) && localId && dev !== localId) await run(body, localId);
      else if (fallback && !noDevice(e)) await run(fallback, dev);
      else throw e;
    } catch (e2) {
      const deviceProblem = e2.reason === 'NO_ACTIVE_DEVICE' || (!pb?.device && !localId);
      toast(failText && !deviceProblem && e2.status !== 429 ? (msg(e2), failText) : msg(e2));
    }
  }
  soon();
}

function optimistic(patch) {
  if (!pb) return;
  pb.progress = curPos();
  pbAt = Date.now();
  Object.assign(pb, patch);
  updateBar();
}

function togglePlay() {
  if (!pb?.item) return toast('Elige algo para escuchar en Buscar o en tu Biblioteca.');
  if (isLocal() && sdk) { sdk.togglePlay(); return; }
  const playing = pb.playing;
  optimistic({ playing: !playing });
  cmd(() => api(playing ? '/me/player/pause' : '/me/player/play', { method: 'PUT' }));
}
function skip(dir) {
  if (!pb?.item) return;
  if (isLocal() && sdk) { dir > 0 ? sdk.nextTrack() : sdk.previousTrack(); return; }
  cmd(() => api(dir > 0 ? '/me/player/next' : '/me/player/previous', { method: 'POST' }));
}
function seekTo(ms) {
  optimistic({ progress: ms });
  if (isLocal() && sdk) { sdk.seek(ms); return; }
  cmd(() => api('/me/player/seek', { method: 'PUT', query: { position_ms: Math.round(ms) } }));
}
function toggleShuffle() {
  if (!pb) return;
  const v = !pb.shuffle;
  optimistic({ shuffle: v });
  cmd(() => api('/me/player/shuffle', { method: 'PUT', query: { state: v } }));
}
function cycleRepeat() {
  if (!pb) return;
  const v = { off: 'context', context: 'track', track: 'off' }[pb.repeat] || 'off';
  optimistic({ repeat: v });
  cmd(() => api('/me/player/repeat', { method: 'PUT', query: { state: v } }));
}
let volT = null;
function setVolume(v) {
  if (isLocal() && sdk) {
    store.set('vol', String(v));
    if (fade.low || fade.inUri) { fadeLoop(); return; } // durante un fundido, el bucle aplica el nuevo volumen
    fade.lastSent = Math.round(v) / 100;
    sdk.setVolume(v / 100);
    return;
  }
  clearTimeout(volT);
  volT = setTimeout(() => api('/me/player/volume', { method: 'PUT', query: { volume_percent: v } }).catch(e => toast(msg(e))), 250);
}

async function toggleLike(uri, kind) {
  const was = !!likeMap.get(uri);
  likeMap.set(uri, !was);
  paintLikes();
  try {
    await api('/me/library', { method: was ? 'DELETE' : 'PUT', query: { uris: uri } });
    const texts = {
      track: ['Añadida a Canciones que te gustan', 'Quitada de Canciones que te gustan'],
      album: ['Álbum guardado en tu biblioteca', 'Álbum quitado de tu biblioteca'],
      artist: ['Ahora sigues a este artista', 'Has dejado de seguir a este artista'],
    }[kind] || ['Guardado', 'Quitado'];
    toast(was ? texts[1] : texts[0]);
  } catch (e) {
    likeMap.set(uri, was);
    paintLikes();
    toast(msg(e));
  }
}
function addToQueue(uri) {
  cmd(async () => { await api('/me/player/queue', { method: 'POST', query: { uri, device_id: targetDevice() } }); toast('Añadida a la cola'); });
}

async function checkLikes(root = document) {
  if (!prefs.features.likes) return;
  const uris = [...new Set([...root.querySelectorAll('[data-act="like"][data-uri]')].map(b => b.dataset.uri))].filter(u => !likeMap.has(u));
  for (let i = 0; i < uris.length; i += 40) {
    const chunk = uris.slice(i, i + 40);
    try {
      const r = await api('/me/library/contains', { query: { uris: chunk.join(',') } });
      chunk.forEach((u, k) => likeMap.set(u, !!r?.[k]));
    } catch { break; }
  }
  paintLikes();
}
function paintLikes() {
  document.querySelectorAll('[data-act="like"][data-uri]').forEach(b => {
    const v = !!likeMap.get(b.dataset.uri);
    b.classList.toggle('liked', v);
    b.setAttribute('aria-pressed', String(v));
  });
}
function likeBtn(uri, kind = 'track', label) {
  const l = label || { track: 'Me gusta', album: 'Guardar álbum', artist: 'Seguir' }[kind];
  return `<button class="ib like" data-act="like" data-kind="${kind}" data-uri="${esc(uri)}" title="${l}" aria-label="${l}" aria-pressed="false">${icon('heart', 'off-i')}${icon('heartOn', 'on-i')}</button>`;
}

/* ---------- color de la portada ---------- */
let tintUrl = null;
function tintFrom(url) {
  if (url === tintUrl) return;
  tintUrl = url;
  if (!url) { coverTint = null; applyTint(); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 24;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0, w = 0, ar = 0, ag = 0, ab = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [R, G, B] = [d[i], d[i + 1], d[i + 2]];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 510;
        const s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
        const k = Math.pow(s * (1 - Math.abs(l - .5) * 1.5), 2);
        r += R * k; g += G * k; b += B * k; w += k;
        ar += R; ag += G; ab += B;
      }
      const n = d.length / 4;
      const rgb = w > 3 ? [r / w, g / w, b / w] : [ar / n, ag / n, ab / n];
      if (tintUrl === url) { coverTint = `rgb(${clampLight(rgb).join(' ')})`; applyTint(); }
    } catch { coverTint = null; applyTint(); }
  };
  img.onerror = () => { coverTint = null; applyTint(); };
  img.src = url;
}
function clampLight([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    const dd = mx - mn;
    s = l > .5 ? dd / (2 - mx - mn) : dd / (mx + mn);
    h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    h /= 6;
  }
  l = Math.min(.62, Math.max(.4, l));
  const hue = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return s === 0 ? [l, l, l].map(v => Math.round(v * 255)) : [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map(v => Math.round(v * 255));
}

/* ---------- barra lateral ---------- */
function renderSide() {
  $('#side').innerHTML = `
    <div class="brand">Onda</div>
    <button class="nav" data-act="nav" data-nav="foryou">${icon('foryou')}Para ti</button>
    <button class="nav" data-act="nav" data-nav="search">${icon('search')}Buscar</button>
    <button class="nav" data-act="nav" data-nav="library">${icon('library')}Biblioteca</button>
    <button class="nav" data-act="nav" data-nav="queue">${icon('queue')}Cola</button>
    <div class="side-h">Playlists</div>
    <div class="side-list" id="sideList"></div>
    <div class="side-foot"><span title="${esc(me?.display_name)}">${esc(me?.display_name || '')}</span></div>`;
  renderSideList();
}
function renderSideList() {
  const el = $('#sideList');
  if (!el) return;
  el.innerHTML = `<button class="sp" data-act="liked"><span class="ph cv liked-cv">${icon('heartOn')}</span><span>Canciones que te gustan</span></button>`
    + myPls.map(p => `<button class="sp" data-act="playlist" data-id="${esc(p.id)}">${pickImg(p.images, 40) ? `<img src="${esc(pickImg(p.images, 40))}" alt="" loading="lazy">` : '<span class="ph"></span>'}<span>${esc(p.name)}</span></button>`).join('');
  markNav();
}
async function myPlaylists() {
  myPls = await pagedAll('/me/playlists', { limit: 50 }, j => ({ items: j.items, next: j.next }), 200);
  myPls.forEach(p => cardCache.set(p.id, { name: p.name, images: p.images }));
  return myPls;
}
async function pagedAll(path, query, page, max = 200) {
  const out = [];
  let j = await api(path, { query });
  while (j) {
    const p = page(j);
    out.push(...(p.items || []).filter(Boolean));
    if (!p.next || out.length >= max) break;
    j = await api(p.next);
  }
  return out;
}
function markNav() {
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('on', b.dataset.nav === view.name));
  document.querySelectorAll('.sp').forEach(b => b.classList.toggle('on',
    (view.name === 'playlist' && b.dataset.id === view.arg) || (view.name === 'liked' && b.dataset.act === 'liked')));
}

/* ---------- barra de reproducción ---------- */
function renderBar() {
  $('#bar').innerHTML = `
    <div class="np">
      <span class="ph" id="npArtPh"></span><img id="npArt" alt="" hidden>
      <div class="np-t"><div class="t1" id="npName">Nada sonando</div><div class="t2" id="npArtists">Elige algo para escuchar</div></div>
      <span id="npLike"></span>
    </div>
    <div class="ctl">
      <div class="btns">
        <button class="ib" id="bShuffle" title="Aleatorio" aria-label="Aleatorio">${icon('shuffle')}</button>
        <button class="ib" id="bPrev" title="Anterior (Ctrl + ←)" aria-label="Anterior">${icon('prev')}</button>
        <button class="pp" id="bPlay" title="Reproducir (Espacio)" aria-label="Reproducir">${icon('play')}</button>
        <button class="ib" id="bNext" title="Siguiente (Ctrl + →)" aria-label="Siguiente">${icon('next')}</button>
        <button class="ib" id="bRepeat" title="Repetir" aria-label="Repetir">${icon('repeat')}<span class="badge" id="rep1" hidden>1</span></button>
      </div>
      <div class="prog"><span id="tCur">0:00</span><input type="range" id="seek" min="0" max="1000" value="0" aria-label="Posición"><span id="tDur">0:00</span></div>
    </div>
    <div class="rt">
      <button class="ib q-only" data-act="nav" data-nav="queue" title="Cola" aria-label="Cola">${icon('queue')}</button>
      <button class="dev" id="bDev" title="Elegir dónde suena">${icon('speaker')}<span id="devName">Dispositivos</span></button>
      <div class="vol">${icon('volume')}<input type="range" id="vol" min="0" max="100" value="${+(store.get('vol') || 70)}" aria-label="Volumen"></div>
    </div>`;

  $('#bPlay').onclick = togglePlay;
  $('#bPrev').onclick = () => skip(-1);
  $('#bNext').onclick = () => skip(1);
  $('#bShuffle').onclick = toggleShuffle;
  $('#bRepeat').onclick = cycleRepeat;
  $('#bDev').onclick = e => { e.stopPropagation(); toggleDevices(); };

  const seek = $('#seek');
  seek.addEventListener('input', () => {
    seeking = true;
    setRange(seek, +seek.value);
    $('#tCur').textContent = fmt((pb?.duration || 0) * seek.value / 1000);
  });
  seek.addEventListener('change', () => { seeking = false; if (pb?.duration) seekTo(pb.duration * seek.value / 1000); });

  const vol = $('#vol');
  setRange(vol, +vol.value);
  vol.addEventListener('input', () => { volDragging = true; setRange(vol, +vol.value); setVolume(+vol.value); });
  vol.addEventListener('change', () => { volDragging = false; });
  updateBar();
}
function setRange(el, v) {
  if (!el) return;
  el.value = v;
  el.style.setProperty('--p', (v / el.max * 100) + '%');
}
function artistLinks(artists) {
  return (artists || []).map(a => a.id ? `<a href="#" data-act="artist" data-id="${esc(a.id)}">${esc(a.name)}</a>` : esc(a.name)).join(', ');
}
function updateBar() {
  if (!$('#bPlay')) return;
  const it = pb?.item;
  const has = !!it;
  document.body.classList.toggle('paused', !pb?.playing);
  ['bPrev', 'bNext', 'bShuffle', 'bRepeat', 'seek'].forEach(id => { $('#' + id).disabled = !has; });
  $('#npName').textContent = has ? it.name : 'Nada sonando';
  $('#npArtists').innerHTML = has ? artistLinks(it.artists) : 'Elige algo para escuchar';
  const src = has ? pickImg(it.album?.images, 64) : '';
  const art = $('#npArt');
  art.hidden = !src;
  $('#npArtPh').hidden = !!src;
  if (src && art.getAttribute('src') !== src) art.src = src;
  $('#npLike').innerHTML = has && it.uri?.startsWith('spotify:track') ? likeBtn(it.uri) : '';
  paintLikes();

  $('#bPlay').innerHTML = icon(pb?.playing ? 'pause' : 'play');
  $('#bPlay').ariaLabel = pb?.playing ? 'Pausa' : 'Reproducir';
  $('#bPlay').title = (pb?.playing ? 'Pausa' : 'Reproducir') + ' (Espacio)';
  $('#bShuffle').classList.toggle('on', !!pb?.shuffle);
  $('#bRepeat').classList.toggle('on', !!pb && pb.repeat !== 'off');
  $('#rep1').hidden = pb?.repeat !== 'track';
  $('#bRepeat').title = { off: 'Repetir', context: 'Repetir todo', track: 'Repetir una' }[pb?.repeat || 'off'];
  $('#tDur').textContent = fmt(pb?.duration || 0);
  if (!seeking) {
    setRange($('#seek'), pb?.duration ? curPos() / pb.duration * 1000 : 0);
    $('#tCur').textContent = fmt(curPos());
  }

  const dev = pb?.device;
  const remote = !!dev && dev.id !== localId;
  $('#devName').textContent = !dev ? 'Dispositivos' : dev.id === localId ? 'Este PC' : dev.name;
  $('#bDev').classList.toggle('remote', remote);
  $('#bDev').title = remote ? 'Sonando en ' + dev.name : 'Elegir dónde suena';
  if (!volDragging) {
    const v = dev?.id === localId ? +(store.get('vol') || 70) : dev?.volume_percent;
    if (v != null) setRange($('#vol'), v);
  }
  $('#vol').disabled = !!dev && dev.supports_volume === false;
  document.title = has ? `${it.name} · ${(it.artists || []).map(a => a.name).join(', ')}` : 'Onda';
  updateMediaSession();
}
function onTrackChange() {
  const it = pb?.item;
  fadeOnTrackChange();
  tintFrom(it ? pickImg(it.album?.images, 64) : null);
  paintRowsOn();
  if (it) checkLikes($('#bar'));
  if (view.name === 'queue') render(false);
}
function paintRowsOn() {
  const uri = pb?.item?.uri;
  document.querySelectorAll('.row').forEach(r => r.classList.toggle('on', !!uri && r.dataset.uri === uri));
}

/* Teclas multimedia del teclado y controles de Windows */
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const it = pb?.item;
  try {
    navigator.mediaSession.metadata = it ? new MediaMetadata({
      title: it.name, artist: (it.artists || []).map(a => a.name).join(', '), album: it.album?.name || '',
      artwork: (it.album?.images || []).map(i => ({ src: i.url, sizes: `${i.width}x${i.height}` })),
    }) : null;
    navigator.mediaSession.playbackState = pb?.playing ? 'playing' : 'paused';
  } catch { }
}
function bindMediaKeys() {
  if (!('mediaSession' in navigator)) return;
  const h = {
    play: () => { if (!pb?.playing) togglePlay(); },
    pause: () => { if (pb?.playing) togglePlay(); },
    nexttrack: () => skip(1),
    previoustrack: () => skip(-1),
  };
  for (const [a, f] of Object.entries(h)) { try { navigator.mediaSession.setActionHandler(a, f); } catch { } }
}

/* ---------- dispositivos ---------- */
const DEV_LABEL = { Computer: 'Ordenador', Smartphone: 'Móvil', Speaker: 'Altavoz', TV: 'Televisión', Tablet: 'Tableta', CastAudio: 'Altavoz', CastVideo: 'Chromecast', GameConsole: 'Consola', AVR: 'Equipo de audio', Automobile: 'Coche' };
const DEV_ICON = { Computer: 'laptop', Smartphone: 'phone', Tablet: 'phone' };
async function toggleDevices() {
  const pop = $('#devpop');
  if (!pop.hidden) { pop.hidden = true; return; }
  closeOverlays();
  pop.hidden = false;
  pop.innerHTML = '<div class="pop-h">Reproducir en</div><div class="loading" style="margin:16px 10px"></div>';
  let devices = [];
  try { devices = (await api('/me/player/devices'))?.devices || []; }
  catch (e) { pop.innerHTML = `<div class="pop-h">Reproducir en</div><p class="pop-note">${esc(msg(e))}</p>`; return; }
  if (localId && !devices.some(d => d.id === localId)) devices.unshift({ id: localId, name: LOCAL_NAME, type: 'Computer', is_active: false });
  const onlyLocal = devices.every(d => d.id === localId);
  pop.innerHTML = '<div class="pop-h">Reproducir en</div>'
    + devices.map(d => `<button class="dv ${d.is_active ? 'on' : ''}" data-dev="${esc(d.id)}">${icon(DEV_ICON[d.type] || 'speaker')}<span><b>${d.id === localId ? 'Este PC (Onda)' : esc(d.name)}</b><small>${esc(DEV_LABEL[d.type] || d.type)}${d.is_active ? ' · Sonando aquí' : ''}</small></span></button>`).join('')
    + (devices.length ? '' : '<p class="pop-note">No hay dispositivos disponibles.</p>')
    + (!prefs.features.localPlayback ? '<p class="pop-note">Reproducir en este PC está desactivado en ··· → Funciones.</p>' : '')
    + (onlyLocal ? '<p class="pop-note">¿No ves tu móvil u otro ordenador? Abre Spotify en ese dispositivo y aparecerá aquí.</p>' : '');
}
async function transferTo(id) {
  $('#devpop').hidden = true;
  try {
    await api('/me/player', { method: 'PUT', body: { device_ids: [id], play: pb ? pb.playing : true } });
    toast(id === localId ? 'Ahora suena en este PC' : 'Cambiado de dispositivo');
  } catch (e) { toast(msg(e)); }
  setTimeout(soon, 400);
}

/* ---------- limpiar caché ---------- */
let cleaning = false;
async function cleanCache() {
  if (cleaning) return;
  cleaning = true;
  closeOverlays();
  toast('Limpiando caché…', 8000);
  const before = await py('memory');
  try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch { }
  await py('clear_cache');

  // Si el reproductor de este PC está en uso, no se recarga: recargar lo reiniciaría y cortaría la música.
  if (localId && isLocal()) {
    likeMap.clear();
    cardCache.clear();
    await render(false); // vuelve a dibujar la vista: suelta portadas y elementos que ya no se ven
    await py('trim_memory');
    await sleep(1200);
    const after = await py('memory');
    cleaning = false;
    if (!$('#sheet').hidden && sheetSec === 'clean') refreshSheet();
    toast(before && after && after < before
      ? `Caché limpia sin cortar la música. Memoria: ${before} MB → ${after} MB.`
      : 'Caché limpia sin cortar la música.', 6000);
    return;
  }
  try { sessionStorage.setItem('onda.cleaned', JSON.stringify({ before, wasLocal: false, view, at: Date.now() })); } catch { }
  location.reload(); // sin música en este PC: recargar libera más memoria y no corta nada
}
function cleanedInfo() {
  try { const c = JSON.parse(sessionStorage.getItem('onda.cleaned') || 'null'); return c && Date.now() - c.at < 60000 ? c : null; } catch { return null; }
}
function afterCacheClean() {
  const c = cleanedInfo();
  if (!c) return;
  if (c.view?.name && navEnabled(c.view.name)) go(c.view.name, c.view.arg, false);
  setTimeout(async () => {
    const after = await py('memory');
    try { sessionStorage.removeItem('onda.cleaned'); } catch { }
    toast(c.before && after && after < c.before
      ? `Caché limpia. Memoria: ${c.before} MB → ${after} MB.`
      : 'Caché limpia.', 6000);
  }, 3500);
}
function resumeAfterClean() {
  const c = cleanedInfo();
  if (c?.wasLocal && localId) api('/me/player', { method: 'PUT', body: { device_ids: [localId], play: true } }).catch(() => { }).finally(soon);
}

/* ---------- vistas ---------- */
let view = { name: null, arg: null };
let historyStack = [];
let renderToken = 0;

function go(name, arg = null, push = true) {
  if (!navEnabled(name)) name = firstView();
  if (push && view.name) historyStack.push(view);
  view = { name, arg };
  render(true);
}
function goBack() {
  const v = historyStack.pop();
  if (v) { view = v; render(true); }
}
async function render(resetScroll) {
  const my = ++renderToken;
  markNav();
  const m = $('#main');
  if (resetScroll) { lists = {}; m.scrollTop = 0; m.innerHTML = '<div class="loading"></div>'; }
  try {
    const html = await VIEWS[view.name](view.arg);
    if (my !== renderToken) return;
    const top = m.scrollTop;
    m.innerHTML = (historyStack.length && !VIEW_FEATURE[view.name]
      ? `<button class="ib back" data-act="back" title="Atrás" aria-label="Atrás">${icon('back')}</button>` : '') + html;
    if (!resetScroll) m.scrollTop = top;
    if (view.name === 'search') initSearch();
    paintRowsOn();
    checkLikes(m);
  } catch (e) {
    if (my !== renderToken) return;
    if (e instanceof AuthError) return showSetup(msg(e));
    m.innerHTML = `<p class="fail">${esc(msg(e))}</p><button class="more" style="margin:0" data-act="retry">Reintentar</button>`;
  }
}

function card(type, x) {
  if (!x) return '';
  cardCache.set(x.id, { name: x.name, images: x.images });
  const src = pickImg(x.images, bigSize());
  const sub = type === 'album' ? [(x.artists || []).map(a => a.name).join(', '), x.release_date?.slice(0, 4)].filter(Boolean).join(' · ')
    : type === 'playlist' ? (x.owner?.display_name || 'Playlist')
      : 'Artista';
  return `<button class="card" data-act="${type}" data-id="${esc(x.id)}">
    <div class="cv ${type === 'artist' ? 'round' : ''}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</div>
    <div class="ct">${esc(x.name)}</div><div class="cs">${esc(sub)}</div></button>`;
}
const grid = (cards, id = '') => `<div class="grid" ${id ? `id="${id}"` : ''}>${cards.join('')}</div>`;
const empty = text => `<p class="empty">${text}</p>`;
const sec = text => `<h2 class="sec-h">${text}</h2>`;

function hero({ img, round, eyebrow, title, meta = '', desc = '', actions = '', art = '' }) {
  const pic = art || (img ? `<img class="art ${round ? 'round' : ''}" src="${esc(img)}" alt="">` : `<div class="art ${round ? 'round' : ''}"></div>`);
  return `<header class="hero">${pic}
    <div class="hero-t">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(title)}</h1>
      ${meta ? `<div class="meta">${meta}</div>` : ''}
      ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
      <div class="actions">${actions}</div>
    </div></header>`;
}
const bigPlay = attrs => `<button class="bigplay" ${attrs} title="Reproducir" aria-label="Reproducir">${icon('play')}</button>`;

function rowsHTML(key, tracks, start, o) {
  return tracks.map((t, k) => {
    const i = start + k;
    const src = o.cover ? pickImg(t.album?.images, 64) : '';
    const lead = o.cover
      ? `<div class="lead">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<button class="pi" data-act="rowplay" tabindex="-1" aria-label="Reproducir">${icon('play')}</button></div>`
      : `<div class="lead num"><span class="n">${t.track_number || i + 1}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><button class="pi" data-act="rowplay" tabindex="-1" aria-label="Reproducir">${icon('play')}</button></div>`;
    const isTrack = t.uri?.startsWith('spotify:track');
    return `<div class="row ${o.album ? '' : 'noalb'} ${o.noplay ? 'noplay' : ''}" data-list="${key}" data-i="${i}" data-uri="${esc(t.uri)}" tabindex="0">
      ${lead}
      <div class="tt"><div class="t1">${esc(t.name)}</div><div class="t2">${artistLinks(t.artists || (t.show ? [{ name: t.show.name }] : []))}</div></div>
      ${o.album ? `<div class="alb">${t.album?.id ? `<a href="#" data-act="album" data-id="${esc(t.album.id)}">${esc(t.album.name)}</a>` : esc(t.album?.name || t.show?.name || '')}</div>` : ''}
      <div class="acts">${isTrack ? likeBtn(t.uri) : ''}<button class="ib q-only" data-act="queue" data-uri="${esc(t.uri)}" title="Añadir a la cola" aria-label="Añadir a la cola">${icon('plus')}</button></div>
      <div class="dur">${fmt(t.duration_ms)}</div>
    </div>`;
  }).join('');
}
function makeList(key, { tracks, next = null, page = null, context = null, fallback = null, opts = {} }) {
  tracks = (tracks || []).filter(t => t && t.uri);
  lists[key] = { tracks, next, page, context, fallback, opts };
  return `<div class="rows" id="rows-${key}">${rowsHTML(key, tracks, 0, opts)}</div>`
    + (next ? `<button class="more" data-act="more" data-list="${key}">Mostrar más</button>` : '');
}
async function loadMore(key, btn) {
  const L = lists[key];
  if (!L?.next) return;
  btn.disabled = true;
  try {
    const p = L.page(await api(L.next));
    const add = (p.items || []).filter(t => t && t.uri);
    const start = L.tracks.length;
    L.tracks.push(...add);
    L.next = p.next;
    const box = $('#rows-' + key);
    box.insertAdjacentHTML('beforeend', rowsHTML(key, add, start, L.opts));
    paintRowsOn();
    checkLikes(box);
    if (L.next) btn.disabled = false; else btn.remove();
  } catch (e) { btn.disabled = false; toast(msg(e)); }
}
function playRow(row) {
  const L = lists[row.dataset.list];
  if (!L || L.opts.noplay) return;
  const i = +row.dataset.i, t = L.tracks[i];
  if (!t) return;
  const body = L.context ? L.context(t, i, L) : { uris: L.tracks.map(x => x.uri), offset: { position: i } };
  play(body, { fallback: L.fallback ? L.fallback(t, i, L) : null });
}
const listCtx = uri => t => ({ context_uri: uri, offset: { uri: t.uri } });
const uriListCtx = (t, i, L) => ({ uris: L.tracks.slice(0, 100).map(x => x.uri), offset: { position: Math.min(i, 99) } });
const collectionUri = () => `spotify:user:${me.id}:collection`;
const SPOTIFY_LIST_FAIL = 'Spotify no deja reproducir esta lista desde apps externas. Ábrela en la app de Spotify.';

/* ---------- fijados (Para ti) ---------- */
function pinIndex(uri) { return prefs.pins.findIndex(p => p.uri === uri); }
function pinBtn(uri, name, img, sub) {
  const on = pinIndex(uri) >= 0;
  return `<button class="ib pin-btn ${on ? 'on' : ''}" data-act="pin" data-uri="${esc(uri)}" data-name="${esc(name)}" data-img="${esc(img || '')}" data-sub="${esc(sub || '')}" title="${on ? 'Quitar de Para ti' : 'Fijar en Para ti'}" aria-label="${on ? 'Quitar de Para ti' : 'Fijar en Para ti'}" aria-pressed="${on}">${icon(on ? 'pinOn' : 'pin')}</button>`;
}
function togglePin(d) {
  const i = pinIndex(d.uri);
  if (i >= 0) { prefs.pins.splice(i, 1); toast('Quitada de Para ti'); }
  else { prefs.pins.push({ uri: d.uri, name: d.name, img: d.img || null, sub: d.sub || '' }); toast('Fijada en Para ti'); }
  savePrefs();
  document.querySelectorAll(`[data-act="pin"][data-uri="${CSS.escape(d.uri)}"]`).forEach(b => { b.outerHTML = pinBtn(d.uri, d.name, d.img, d.sub); });
}
function nameColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 46%)`;
}
function pinTile(p, i) {
  const color = p.color || nameColor(p.name);
  const face = p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : `<span class="pin-name">${esc(p.name)}</span>`;
  return `<div class="card pin">
    <button class="cv pin-cv" data-act="pinplay" data-i="${i}" style="--c:${esc(color)}" aria-label="Reproducir ${esc(p.name)}">${face}<span class="pin-play">${icon('play')}</span></button>
    <div class="pin-row"><div class="tt"><div class="ct">${esc(p.name)}</div><div class="cs">${esc(p.sub || 'Lista de Spotify')}</div></div>
    <button class="ib sm" data-act="pindel" data-i="${i}" title="Quitar de Para ti" aria-label="Quitar ${esc(p.name)} de Para ti">${icon('close')}</button></div></div>`;
}
const LINK_RE = /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|artist)\/|spotify:(playlist|album|artist):)([A-Za-z0-9]{22})/;
async function addPin(link, name) {
  const m = String(link).match(LINK_RE);
  if (!m) return 'Ese enlace no es de una playlist, álbum o artista de Spotify. Cópialo desde la app: ··· → Compartir → Copiar enlace.';
  const kind = m[1] || m[2], id = m[3], uri = `spotify:${kind}:${id}`;
  if (pinIndex(uri) >= 0) return 'Esa lista ya está en Para ti.';
  let meta = null;
  try { meta = await api(`/${kind}s/${id}`); } catch { }
  const label = { playlist: meta ? 'Playlist' : 'Lista de Spotify', album: 'Álbum', artist: 'Artista' }[kind];
  prefs.pins.push({ uri, name: name || meta?.name || 'Lista de Spotify', img: pickImg(meta?.images, 280) || null, sub: label });
  savePrefs();
  return '';
}

const VIEWS = {
  async foryou() {
    let html = `<h1 class="h1">Para ti</h1>${sec('Tus listas')}
      <div class="grid">${prefs.pins.map(pinTile).join('')}
        <button class="card" data-act="pinadd"><div class="cv add-cv">${icon('plus')}</div><div class="ct">Añadir lista</div><div class="cs">Daily Mix, Radar de novedades…</div></button>
      </div><div id="pinForm"></div>`;
    if (!hasScope('user-top-read')) {
      return html + `<p class="note" style="margin-top:28px">Para ver lo que más escuchas, Onda necesita un permiso nuevo de Spotify. <button class="link" data-act="relogin">Volver a conectar con Spotify</button></p>`;
    }
    const [tt, ta] = await Promise.all([
      api('/me/top/tracks', { query: { limit: 10, time_range: 'short_term' } }).catch(() => null),
      api('/me/top/artists', { query: { limit: 10, time_range: 'short_term' } }).catch(() => null),
    ]);
    if (tt?.items?.length) html += sec('Lo que más escuchas') + makeList('top', { tracks: tt.items, context: uriListCtx, opts: { cover: true, album: true } });
    if (ta?.items?.length) html += sec('Tus artistas del momento') + grid(ta.items.map(a => card('artist', a)));
    return html;
  },

  async library(tab = 'playlists') {
    const tabs = [['playlists', 'Playlists'], ['albums', 'Álbumes'], ['artists', 'Artistas']];
    let body = '';
    if (tab === 'playlists') {
      const pls = await myPlaylists();
      renderSideList();
      body = `<div class="grid"><button class="card" data-act="liked"><div class="cv liked-cv">${icon('heartOn')}</div><div class="ct">Canciones que te gustan</div><div class="cs">Playlist</div></button>${pls.map(p => card('playlist', p)).join('')}</div>`;
    } else if (tab === 'albums') {
      const al = await pagedAll('/me/albums', { limit: 50 }, j => ({ items: j.items.map(x => x.album), next: j.next }), 200);
      body = al.length ? grid(al.map(a => card('album', a))) : empty('Aún no has guardado álbumes. Busca uno y pulsa el corazón para tenerlo aquí.');
    } else {
      const ar = await pagedAll('/me/following', { type: 'artist', limit: 50 }, j => ({ items: j.artists?.items, next: j.artists?.next }), 200);
      body = ar.length ? grid(ar.map(a => card('artist', a))) : empty('No sigues a ningún artista todavía. Entra en uno y pulsa el corazón para seguirlo.');
    }
    return `<h1 class="h1">Biblioteca</h1>
      <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}" data-act="libtab" data-tab="${k}">${l}</button>`).join('')}</div>${body}`;
  },

  async liked() {
    const j = await api('/me/tracks', { query: { limit: 50 } });
    const tracks = j.items.map(x => x.track);
    tracks.forEach(t => t && likeMap.set(t.uri, true));
    return hero({
      art: `<div class="art cv liked-cv" style="margin:0">${icon('heartOn')}</div>`,
      eyebrow: 'Playlist', title: 'Canciones que te gustan',
      meta: plural(j.total, 'canción', 'canciones'),
      actions: j.total ? bigPlay('data-act="playall" data-list="liked"') : '',
    }) + (tracks.length ? makeList('liked', {
      tracks, next: j.next,
      page: p => ({ items: p.items.map(x => x.track), next: p.next }),
      context: listCtx(collectionUri()), fallback: uriListCtx,
      opts: { cover: true, album: true },
    }) : empty('Todavía no tienes canciones guardadas. Pulsa el corazón en cualquier canción para tenerla aquí.'));
  },

  async playlist(id) {
    const uri = `spotify:playlist:${id}`;
    let p;
    try { p = await api(`/playlists/${id}`); }
    catch (e) {
      if (e.status !== 404 && e.status !== 403) throw e;
      // Listas de Spotify (editoriales o personalizadas): no se pueden leer, solo reproducir
      const c = cardCache.get(id) || prefs.pins.find(x => x.uri === uri) || {};
      const img = c.img || pickImg(c.images, bigSize());
      return hero({
        img, eyebrow: 'Lista de Spotify', title: c.name || 'Lista de Spotify',
        actions: bigPlay(`data-act="playctx" data-uri="${esc(uri)}" data-spotify="1"`) + pinBtn(uri, c.name || 'Lista de Spotify', img, 'Lista de Spotify'),
      }) + '<p class="note">Es una lista creada por Spotify. Spotify no deja ver sus canciones desde apps externas, pero puedes reproducirla y fijarla en Para ti.</p>';
    }
    const box = p.items || p.tracks;
    const entries = box?.items;
    const total = box?.total;
    const img = pickImg(p.images, bigSize());
    const meta = [esc(p.owner?.display_name || ''), total != null ? plural(total, 'canción', 'canciones') : ''].filter(Boolean).join(' · ');
    let body;
    if (entries) {
      const tracks = entries.map(e => e.item || e.track);
      body = tracks.length ? makeList('pl', {
        tracks, next: box.next,
        page: j => ({ items: j.items.map(e => e.item || e.track), next: j.next }),
        context: listCtx(p.uri), opts: { cover: true, album: true },
      }) : empty('Esta playlist está vacía.');
    } else {
      body = '<p class="note">Spotify solo deja ver las canciones de las playlists que has creado tú o en las que colaboras. Esta puedes escucharla igualmente con el botón de reproducir.</p>';
    }
    return hero({
      img, eyebrow: p.public === false ? 'Playlist privada' : 'Playlist',
      title: p.name, meta, desc: plainText(p.description),
      actions: (entries?.length ? bigPlay('data-act="playall" data-list="pl"') : bigPlay(`data-act="playctx" data-uri="${esc(p.uri)}"`)) + pinBtn(p.uri, p.name, img, 'Playlist'),
    }) + body;
  },

  async album(id) {
    const a = await api(`/albums/${id}`);
    const withAlbum = items => items.map(t => ({ ...t, album: { id: a.id, name: a.name, images: a.images } }));
    const tracks = withAlbum(a.tracks?.items || []);
    const totalMs = tracks.reduce((s, t) => s + (t.duration_ms || 0), 0);
    const kind = { album: 'Álbum', single: 'Single', compilation: 'Recopilatorio' }[a.album_type] || 'Álbum';
    const n = a.total_tracks ?? tracks.length;
    const img = pickImg(a.images, bigSize());
    const meta = [artistLinks(a.artists), a.release_date?.slice(0, 4), plural(n, 'canción', 'canciones'), a.tracks?.next ? '' : Math.round(totalMs / 60000) + ' min'].filter(Boolean).join(' · ');
    return hero({
      img, eyebrow: kind, title: a.name, meta,
      actions: bigPlay('data-act="playall" data-list="al"') + likeBtn(a.uri, 'album') + pinBtn(a.uri, a.name, img, kind),
    }) + makeList('al', {
      tracks, next: a.tracks?.next,
      page: j => ({ items: withAlbum(j.items), next: j.next }),
      context: listCtx(a.uri), opts: { cover: false, album: false },
    });
  },

  async artist(id) {
    const [ar, al] = await Promise.all([
      api(`/artists/${id}`),
      api(`/artists/${id}/albums`, { query: { include_groups: 'album,single', limit: 10 } }),
    ]);
    lists.artistAlbums = { next: al?.next };
    const items = (al?.items || []).filter(Boolean);
    const img = pickImg(ar.images, bigSize());
    return hero({
      img, round: true, eyebrow: 'Artista', title: ar.name,
      actions: bigPlay(`data-act="playctx" data-uri="${esc(ar.uri)}"`) + likeBtn(ar.uri, 'artist') + pinBtn(ar.uri, ar.name, img, 'Artista'),
    }) + sec('Discografía')
      + (items.length ? grid(items.map(x => card('album', x)), 'artistAlbums') : empty('Este artista no tiene álbumes ni singles publicados.'))
      + (al?.next ? '<button class="more" data-act="morealbums">Mostrar más</button>' : '');
  },

  async queue() {
    const q = await api('/me/player/queue');
    if (!q?.currently_playing) return '<h1 class="h1">Cola</h1>' + empty('No suena nada ahora mismo. Elige algo en Buscar o en tu Biblioteca y aquí verás lo que viene después.');
    return '<h1 class="h1">Cola</h1>' + sec('Sonando ahora')
      + makeList('qnow', { tracks: [q.currently_playing], opts: { cover: true, album: true, noplay: true } })
      + sec('A continuación')
      + (q.queue?.length ? makeList('qnext', { tracks: q.queue, opts: { cover: true, album: true, noplay: true } })
        : empty('No hay nada más en la cola. Añade canciones con el botón + de cada fila.'));
  },

  async search() {
    return `<label class="sbox">${icon('search')}<input id="sq" type="search" placeholder="Canciones, artistas, álbumes o playlists" autocomplete="off" spellcheck="false" aria-label="Buscar"></label><div id="sres"></div>`;
  },
};

/* ---------- búsqueda ---------- */
let lastQ = '', searchT = null, searchToken = 0;
function initSearch() {
  const inp = $('#sq');
  inp.value = lastQ;
  inp.focus();
  inp.addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(() => runSearch(inp.value.trim()), 300); });
  runSearch(lastQ);
}
async function runSearch(q) {
  lastQ = q;
  const my = ++searchToken;
  const out = $('#sres');
  if (!out) return;
  out.innerHTML = '<div class="loading"></div>';
  try {
    if (!q) {
      const j = await api('/me/player/recently-played', { query: { limit: 30 } });
      if (my !== searchToken) return;
      const seen = new Set();
      const tracks = (j?.items || []).map(x => x.track).filter(t => t && !seen.has(t.uri) && seen.add(t.uri));
      out.innerHTML = tracks.length
        ? sec('Escuchado hace poco') + makeList('recent', { tracks, context: uriListCtx, opts: { cover: true, album: true } })
        : empty('Escribe arriba para buscar canciones, artistas, álbumes o playlists.');
    } else {
      const j = await api('/search', { query: { q, type: 'track,artist,album,playlist', limit: 10 } });
      if (my !== searchToken) return;
      const tr = (j.tracks?.items || []).filter(Boolean), ar = (j.artists?.items || []).filter(Boolean);
      const al = (j.albums?.items || []).filter(Boolean), pl = (j.playlists?.items || []).filter(Boolean);
      if (!tr.length && !ar.length && !al.length && !pl.length) {
        out.innerHTML = empty(`No hay resultados para «${esc(q)}». Revisa cómo está escrito o prueba con menos palabras.`);
        return;
      }
      out.innerHTML = (tr.length ? sec('Canciones') + makeList('search', { tracks: tr, context: uriListCtx, opts: { cover: true, album: true } }) : '')
        + (ar.length ? sec('Artistas') + grid(ar.map(x => card('artist', x))) : '')
        + (al.length ? sec('Álbumes') + grid(al.map(x => card('album', x))) : '')
        + (pl.length ? sec('Playlists') + grid(pl.map(x => card('playlist', x))) : '');
    }
    paintRowsOn();
    checkLikes(out);
  } catch (e) {
    if (my === searchToken) out.innerHTML = `<p class="fail">${esc(msg(e))}</p>`;
  }
}

/* ---------- menú ··· y ajustes ---------- */
const MENU = [
  ['personal', 'Personalización'], ['features', 'Funciones'], ['access', 'Accesibilidad'], ['playback', 'Reproducción'], ['quality', 'Calidad'],
  ['clean', 'Limpiar caché'], ['keys', 'Atajos de teclado'], ['account', 'Cuenta'], ['about', 'Acerca de Onda'],
];
function closeOverlays() {
  ['#devpop', '#menu'].forEach(s => { const el = $(s); if (el) el.hidden = true; });
}
function toggleMenu() {
  const m = $('#menu');
  if (!m.hidden) { m.hidden = true; return; }
  closeOverlays();
  m.innerHTML = MENU.map(([k, l]) => `<button class="mi" role="menuitem" data-act="settings" data-sec="${k}">${l}</button>`).join('')
    + '<div class="mi-sep"></div>'
    + '<button class="mi" role="menuitem" data-act="cleannow">Limpiar caché ahora</button>'
    + '<button class="mi" role="menuitem" data-act="logout">Cerrar sesión</button>';
  m.hidden = false;
  m.querySelector('.mi')?.focus();
}

const toggleRow = (path, label, desc) => `<label class="tg"><span><b>${label}</b>${desc ? `<small>${desc}</small>` : ''}</span><input type="checkbox" role="switch" data-pref="${path}" ${getPref(path) ? 'checked' : ''}></label>`;
const segRow = (path, label, options) => `<div class="set-row"><b>${label}</b><div class="seg" role="radiogroup">${options.map(([v, l]) => `<button role="radio" aria-checked="${String(getPref(path)) === String(v)}" class="${String(getPref(path)) === String(v) ? 'on' : ''}" data-pref="${path}" data-val="${esc(v)}">${l}</button>`).join('')}</div></div>`;
const SWATCHES = [['#0a84ff', 'Azul'], ['#bf5af2', 'Morado'], ['#ff375f', 'Rosa'], ['#ff9f0a', 'Naranja'], ['#30d158', 'Verde'], ['#8e8e93', 'Gris']];
function swatchRow() {
  const custom = prefs.accent !== 'cover' && !SWATCHES.some(([c]) => c === prefs.accent);
  return `<div class="set-row"><b>Color</b><div class="swatches">
    <button class="sw cover ${prefs.accent === 'cover' ? 'on' : ''}" data-pref="accent" data-val="cover" title="El de la portada que suena" aria-label="Color de la portada"></button>
    ${SWATCHES.map(([c, l]) => `<button class="sw ${prefs.accent === c ? 'on' : ''}" style="--sw:${c}" data-pref="accent" data-val="${c}" title="${l}" aria-label="${l}"></button>`).join('')}
    <label class="sw custom ${custom ? 'on' : ''}" title="Elegir otro color"><input type="color" data-accent-custom value="${custom ? prefs.accent : '#5e5ce6'}" aria-label="Otro color"></label>
  </div><small>${prefs.accent === 'cover' ? 'Toma el color de la portada que suena.' : 'Color fijo.'}</small></div>`;
}
function getPref(path) { return path.split('.').reduce((o, k) => o?.[k], prefs); }

const SECTIONS = {
  personal: () => `<h2>Personalización</h2>
    ${segRow('theme', 'Tema', [['system', 'Como el sistema'], ['light', 'Claro'], ['dark', 'Oscuro']])}
    ${swatchRow()}
    ${segRow('wash', 'Color de fondo', [['off', 'Sin color'], ['soft', 'Suave'], ['normal', 'Normal'], ['strong', 'Intenso']])}
    ${segRow('density', 'Listas', [['comfy', 'Cómodas'], ['compact', 'Compactas']])}`,
  features: () => `<h2>Funciones</h2>
    <p class="set-note">Quita lo que no uses: Onda deja de cargarlo y la ventana queda más limpia. Puedes volver a activarlo cuando quieras.</p>
    ${toggleRow('features.foryou', 'Para ti', 'DJ, tus mixes, listas de Spotify y lo que más escuchas.')}
    ${toggleRow('features.search', 'Buscar', 'Canciones, artistas, álbumes y playlists.')}
    ${toggleRow('features.library', 'Biblioteca', 'Tus playlists, álbumes y artistas.')}
    ${toggleRow('features.queue', 'Cola', 'La vista de cola y los botones + para añadir canciones.')}
    ${toggleRow('features.sidePlaylists', 'Playlists en la barra lateral', 'Acceso rápido a tus playlists.')}
    ${toggleRow('features.likes', 'Botones de Me gusta', 'Corazones para guardar canciones, álbumes y artistas.')}
    ${toggleRow('features.localPlayback', 'Reproducir en este PC', 'Si lo quitas, Onda solo hace de mando de tus otros dispositivos y gasta menos memoria.')}`,
  access: () => `<h2>Accesibilidad</h2>
    ${segRow('zoom', 'Tamaño de la interfaz', [[0.9, 'Pequeño'], [1, 'Normal'], [1.15, 'Grande'], [1.3, 'Muy grande']])}
    ${toggleRow('reduceMotion', 'Reducir movimiento', 'Quita animaciones y transiciones.')}
    ${toggleRow('contrast', 'Más contraste', 'Textos y bordes más marcados, sin transparencias.')}
    <p class="set-note">Todo se puede usar con el teclado: Tab para moverte, Intro para reproducir la fila elegida y Espacio para pausar.</p>`,
  playback: () => `<h2>Reproducción</h2>
    ${segRow('fade', 'Fundido entre canciones', [[0, 'No'], [3, '3 s'], [6, '6 s'], [10, '10 s']])}
    <p class="set-note">Cuando suena en este PC, Onda baja el volumen poco a poco al final de cada canción y lo sube al empezar la siguiente, sin cortes secos.</p>
    ${prefs.fade && pb?.device && !isLocal() ? `<p class="note">Ahora suena en <b>${esc(pb.device.name)}</b>: el fundido solo funciona cuando suena en este ordenador. Cámbialo con el botón de dispositivo, abajo a la derecha → <b>Este PC (Onda)</b>.</p>` : ''}
    <p class="set-note">No es un crossfade de verdad: Spotify no deja a las apps externas mezclar el final de una canción con el principio de la siguiente, ni activar Automix.</p>
    <div class="set-row"><b>Crossfade y Automix en otros dispositivos</b>
      <p class="set-note">Si escuchas en el móvil o en otro ordenador, actívalos en la app de Spotify de ese dispositivo, en sus ajustes de <b>Reproducción</b> (el nombre exacto puede cambiar según la versión). Como es un ajuste de ese dispositivo, debería seguir funcionando cuando lo controlas desde Onda.</p></div>`,
  quality: () => `<h2>Calidad</h2>
    <div class="set-row"><b>Calidad del audio</b>
      <p class="set-note">Spotify no deja que las apps externas elijan la calidad del audio. Onda usa el reproductor web oficial de Spotify, que según Spotify suena a AAC 256 kbit/s con Premium y no se puede cambiar.</p>
      <p class="set-note">Si escuchas en el móvil o en otro ordenador, cambia la calidad en la app de Spotify de ese dispositivo: <b>Ajustes → Calidad de audio</b>.</p></div>
    ${segRow('covers', 'Portadas', [['normal', 'Normal (ahorra datos)'], ['high', 'Alta (más nítidas)']])}`,
  clean: () => `<h2>Limpiar caché</h2>
    <div class="set-row"><b>Memoria en uso</b><p class="mem" id="memNow">Midiendo…</p></div>
    <div class="set-row"><button class="primary" data-act="cleannow">Limpiar caché ahora</button>
      <p class="set-note">Borra las portadas y archivos temporales guardados y libera memoria al momento. Tu sesión y tus ajustes se quedan, y la música no se corta: si suena en este PC, Onda limpia sin recargar la interfaz.</p></div>
    ${toggleRow('autoClean', 'Limpiar al cerrar Onda', 'Borra la caché del disco cada vez que cierras la app.')}
    ${toggleRow('trimMinimized', 'Ahorrar memoria al minimizar', 'Pide a Windows que Onda use menos memoria mientras está minimizada (no lo hace si está sonando en este PC).')}`,
  keys: () => `<h2>Atajos de teclado</h2>
    <dl class="keys">
      <dt><kbd>Espacio</kbd></dt><dd>Reproducir o pausar, desde cualquier sitio salvo mientras escribes</dd>
      <dt><kbd>Ctrl</kbd> + <kbd>→</kbd></dt><dd>Siguiente canción</dd>
      <dt><kbd>Ctrl</kbd> + <kbd>←</kbd></dt><dd>Canción anterior</dd>
      <dt><kbd>/</kbd> o <kbd>Ctrl</kbd> + <kbd>F</kbd></dt><dd>Buscar</dd>
      <dt><kbd>Intro</kbd></dt><dd>Reproducir la canción seleccionada</dd>
      <dt><kbd>Esc</kbd></dt><dd>Cerrar menús y ventanas</dd>
      <dt>Teclas multimedia</dt><dd>Reproducir, pausar, siguiente y anterior, si Windows se las envía a Onda</dd>
    </dl>`,
  account: () => `<h2>Cuenta</h2>
    <div class="set-row"><b>Conectado como</b><p>${esc(me?.display_name || '')}</p></div>
    <div class="set-actions">
      <button class="chip" data-act="relogin">Volver a conectar con Spotify</button>
      <button class="chip" data-act="changeid">Cambiar Client ID</button>
      <button class="chip" data-act="onboard">Repetir el cuestionario inicial</button>
      <button class="chip" data-act="resetprefs">Restablecer ajustes</button>
      <button class="chip" data-act="logout">Cerrar sesión</button>
    </div>
    <p class="set-note">Para quitar del todo el acceso de Onda a tu cuenta, ve a <span class="ext" data-ext="https://www.spotify.com/account/apps/">spotify.com/account/apps</span>.</p>`,
  about: () => `<h2>Acerca de Onda</h2>
    <p>Versión ${VERSION}. Código abierto con licencia MIT: <span class="ext" data-ext="${REPO}">${REPO.replace('https://', '')}</span></p>
    <p class="set-note">Onda es un proyecto independiente y no está afiliado a Spotify.</p>
    <div class="set-row"><b>Registro de errores</b>
      ${errLog.length ? `<ol class="log">${errLog.map(e => `<li><time>${esc(e.t)}</time> ${esc(e.text)}</li>`).join('')}</ol>
      <div class="set-actions"><button class="chip" data-act="copylog">Copiar registro</button><button class="chip" data-act="clearlog">Borrar registro</button></div>`
      : '<p class="set-note">No se ha registrado ningún error.</p>'}</div>`,
};

let sheetSec = 'personal';
function openSettings(secName = sheetSec) {
  closeOverlays();
  sheetSec = secName;
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet-card">
    <nav class="sheet-nav" aria-label="Secciones de ajustes">${MENU.map(([k, l]) => `<button class="${k === sheetSec ? 'on' : ''}" data-act="settings" data-sec="${k}" aria-current="${k === sheetSec}">${l}</button>`).join('')}</nav>
    <div class="sheet-body">${SECTIONS[sheetSec]()}</div>
    <button class="ib sheet-close" data-act="closesheet" title="Cerrar (Esc)" aria-label="Cerrar">${icon('close')}</button>
  </div>`;
  s.hidden = false;
  s.querySelector('.sheet-nav .on')?.focus();
  if (sheetSec === 'clean') py('memory').then(mb => { const el = $('#memNow'); if (el) el.textContent = mb ? `${mb} MB` : 'No disponible fuera de la app de escritorio.'; });
}
function refreshSheet() {
  if ($('#sheet').hidden) return;
  const a = document.activeElement?.dataset || {};
  openSettings(sheetSec);
  if (a.pref) ($(`#sheet [data-pref="${a.pref}"]${a.val != null ? `[data-val="${CSS.escape(a.val)}"]` : ''}`) || $(`#sheet [data-pref="${a.pref}"]`))?.focus();
}
function closeSheet() { $('#sheet').hidden = true; $('#moreBtn')?.focus(); }

function setPref(path, value) {
  const keys = path.split('.');
  if (keys[0] === 'features' && value === false) {
    const views = ['foryou', 'search', 'library'].filter(k => k !== keys[1]);
    if (['foryou', 'search', 'library'].includes(keys[1]) && !views.some(k => prefs.features[k])) {
      toast('Deja al menos una de estas activada: Para ti, Buscar o Biblioteca.');
      refreshSheet();
      return;
    }
  }
  let o = prefs;
  keys.slice(0, -1).forEach(k => { o = o[k]; });
  o[keys.at(-1)] = value;
  savePrefs();
  applyPrefs();
  if (path === 'features.localPlayback') setLocalPlayback(value);
  if (path === 'covers' || path === 'features.likes' || (keys[0] === 'features' && !navEnabled(view.name))) go(navEnabled(view.name) ? view.name : firstView(), view.arg, false);
  if (keys[0] === 'features' && (keys[1] === 'likes')) checkLikes();
}

/* ---------- cuestionario inicial (se puede saltar) ---------- */
let obStep = 0;
function openOnboarding() {
  obStep = 0;
  $('#sheet').hidden = true;
  renderOnboarding();
  $('#onboard').hidden = false;
}
function renderOnboarding() {
  const f = prefs.features;
  const where = f.localPlayback ? 'both' : 'remote';
  const steps = [
    `<h2>¿Dónde vas a escuchar?</h2><p class="set-note">Así Onda solo carga lo que necesitas.</p>
     <div class="choices">
       <button class="choice ${where === 'both' ? 'on' : ''}" data-ob="where" data-val="both"><b>En este PC y en otros</b><small>Suena aquí y también controla tu móvil u otros equipos.</small></button>
       <button class="choice ${where === 'remote' ? 'on' : ''}" data-ob="where" data-val="remote"><b>Solo en otros dispositivos</b><small>Onda hace de mando. Gasta menos memoria.</small></button>
     </div>`,
    `<h2>¿Qué quieres tener a mano?</h2><p class="set-note">Marca lo que uses. Lo demás no aparecerá.</p>
     ${toggleRow('features.foryou', 'Para ti', 'DJ, tus mixes y listas de Spotify')}
     ${toggleRow('features.queue', 'Cola', 'Ver y añadir lo que viene después')}
     ${toggleRow('features.sidePlaylists', 'Playlists en la barra lateral')}
     ${toggleRow('features.likes', 'Botones de Me gusta')}`,
    `<h2>¿Cómo lo quieres ver?</h2>
     ${segRow('theme', 'Tema', [['system', 'Como el sistema'], ['light', 'Claro'], ['dark', 'Oscuro']])}
     ${swatchRow()}
     ${segRow('zoom', 'Tamaño', [[1, 'Normal'], [1.15, 'Grande']])}`,
  ];
  $('#onboard').innerHTML = `<div class="ob-card">
    <div class="ob-top"><span class="ob-dots" aria-label="Paso ${obStep + 1} de 3">${[0, 1, 2].map(i => `<i class="${i === obStep ? 'on' : ''}"></i>`).join('')}</span>
      <button class="link" data-act="obskip">Saltar</button></div>
    ${obStep === 0 ? '<p class="ob-hello">Tres preguntas rápidas para dejar Onda a tu gusto. Puedes cambiarlo todo después en <b>···</b>, arriba a la derecha.</p>' : ''}
    <div class="ob-body">${steps[obStep]}</div>
    <div class="ob-foot">${obStep > 0 ? '<button class="chip" data-act="obback">Atrás</button>' : '<span></span>'}
      <button class="primary" data-act="obnext">${obStep < 2 ? 'Siguiente' : 'Listo'}</button></div>
  </div>`;
  $('#onboard .ob-foot .primary').focus();
}
function closeOnboarding() {
  store.set('onboarded', '1');
  $('#onboard').hidden = true;
}

/* ---------- eventos ---------- */
function bindGlobal() {
  bindMediaKeys();

  document.addEventListener('click', async e => {
    const dv = e.target.closest('[data-dev]');
    if (dv) return transferTo(dv.dataset.dev);
    if (e.target.closest('#moreBtn')) { e.stopPropagation(); return toggleMenu(); }
    if (!e.target.closest('#devpop, #menu, #bDev')) closeOverlays();
    if (e.target.id === 'sheet') return closeSheet();

    const ext = e.target.closest('[data-ext]');
    if (ext) return openExternal(ext.dataset.ext);

    // Ajustes: interruptores de dos o más opciones
    const pv = e.target.closest('button[data-pref]');
    if (pv) {
      let v = pv.dataset.val;
      if (v === 'true' || v === 'false') v = v === 'true';
      else if (v !== '' && !isNaN(+v)) v = +v;
      setPref(pv.dataset.pref, v);
      return $('#onboard').hidden ? refreshSheet() : renderOnboarding();
    }
    const ob = e.target.closest('[data-ob="where"]');
    if (ob) {
      const local = ob.dataset.val === 'both';
      if (prefs.features.localPlayback !== local) setPref('features.localPlayback', local);
      return renderOnboarding();
    }

    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.tagName === 'A') e.preventDefault();
    const d = el.dataset;
    switch (d.act) {
      case 'nav': historyStack = []; if (d.nav !== view.name) go(d.nav, d.nav === 'library' ? 'playlists' : null, false); break;
      case 'libtab': view.arg = d.tab; render(true); break;
      case 'back': goBack(); break;
      case 'retry': render(true); break;
      case 'logout': logout(); break;
      case 'relogin': login(); break;
      case 'changeid': store.set('client_id', null); ['access', 'exp', 'refresh', 'scope'].forEach(k => store.set(k, null)); location.replace('/'); break;
      case 'liked': go('liked'); break;
      case 'playlist': case 'album': case 'artist': go(d.act, d.id); break;
      case 'rowplay': playRow(el.closest('.row')); break;
      case 'like': toggleLike(d.uri, d.kind); break;
      case 'queue': if (d.uri) addToQueue(d.uri); else go('queue'); break;
      case 'more': loadMore(d.list, el); break;
      case 'playall': { const L = lists[d.list]; if (L?.tracks.length) playRow({ dataset: { list: d.list, i: '0' } }); break; }
      case 'playctx': play({ context_uri: d.uri }, { failText: d.spotify ? SPOTIFY_LIST_FAIL : '' }); break;
      case 'pin': togglePin(d); break;
      case 'pinplay': { const p = prefs.pins[+d.i]; if (p) play({ context_uri: p.uri }, { failText: SPOTIFY_LIST_FAIL }); break; }
      case 'pindel': { const p = prefs.pins.splice(+d.i, 1)[0]; savePrefs(); render(false); if (p) toast(`«${p.name}» quitada de Para ti`); break; }
      case 'pinadd': {
        $('#pinForm').innerHTML = `<form class="pinform" id="pinf">
          <div class="field"><label for="pinLink">Enlace de Spotify</label><input id="pinLink" name="link" placeholder="https://open.spotify.com/playlist/…" autocomplete="off" spellcheck="false"></div>
          <div class="field"><label for="pinName">Nombre (opcional)</label><input id="pinName" name="name" placeholder="Por ejemplo: Daily Mix 1" autocomplete="off"></div>
          <div class="setup-row"><button class="primary">Añadir a Para ti</button><button type="button" class="link" data-act="pincancel">Cancelar</button></div>
          <p class="set-note">En la app de Spotify abre la lista (tu Daily Mix, Radar de novedades, una lista de Spotify…), pulsa <b>···</b> → <b>Compartir</b> → <b>Copiar enlace</b> y pégalo aquí.</p>
          <p class="setup-msg" id="pinMsg" hidden></p></form>`;
        $('#pinLink').focus();
        break;
      }
      case 'pincancel': $('#pinForm').innerHTML = ''; break;
      case 'settings': openSettings(d.sec); break;
      case 'closesheet': closeSheet(); break;
      case 'cleannow': cleanCache(); break;
      case 'onboard': openOnboarding(); break;
      case 'resetprefs': {
        const pins = prefs.pins, hadLocal = prefs.features.localPlayback;
        store.set('prefs', null);
        prefs = loadPrefs();
        prefs.pins = pins; // las listas fijadas se conservan
        savePrefs();
        applyPrefs();
        if (!hadLocal) setLocalPlayback(true);
        go(navEnabled(view.name) ? view.name : firstView(), view.arg, false);
        refreshSheet();
        toast('Ajustes restablecidos');
        break;
      }
      case 'copylog': navigator.clipboard.writeText(errLog.map(x => `${x.t} ${x.text}`).join('\n')).then(() => toast('Registro copiado'), () => toast('No se ha podido copiar.')); break;
      case 'clearlog': errLog.length = 0; store.set('errors', null); refreshSheet(); break;
      case 'obskip': closeOnboarding(); break;
      case 'obback': obStep = Math.max(0, obStep - 1); renderOnboarding(); break;
      case 'obnext': if (obStep < 2) { obStep++; renderOnboarding(); } else { closeOnboarding(); toast('Listo. Puedes cambiarlo cuando quieras en ···'); } break;
      case 'morealbums': {
        const A = lists.artistAlbums;
        if (!A?.next) break;
        el.disabled = true;
        try {
          const j = await api(A.next);
          A.next = j.next;
          $('#artistAlbums').insertAdjacentHTML('beforeend', (j.items || []).map(x => card('album', x)).join(''));
          if (A.next) el.disabled = false; else el.remove();
        } catch (err) { el.disabled = false; toast(msg(err)); }
        break;
      }
    }
  });

  // Ajustes: casillas y selector de color
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('input[type=checkbox][data-pref]')) {
      setPref(t.dataset.pref, t.checked);
      if (!$('#onboard').hidden) renderOnboarding(); else refreshSheet();
    }
    if (t.matches('[data-accent-custom]')) { setPref('accent', t.value); if (!$('#onboard').hidden) renderOnboarding(); else refreshSheet(); }
  });

  document.addEventListener('submit', async e => {
    if (e.target.id !== 'pinf') return;
    e.preventDefault();
    const f = e.target, btn = f.querySelector('.primary');
    btn.disabled = true;
    const err = await addPin(f.link.value.trim(), f.name.value.trim());
    btn.disabled = false;
    if (err) { const m = $('#pinMsg'); m.hidden = false; m.textContent = err; return; }
    toast('Añadida a Para ti');
    render(false);
  });

  document.addEventListener('dblclick', e => {
    const row = e.target.closest('.row');
    if (row && !e.target.closest('a, button')) playRow(row);
  });

  // El SDK necesita un gesto del usuario para poder sonar en el PC
  document.addEventListener('pointerdown', () => { try { sdk?.activateElement(); } catch { } }, { once: true });

  // Teclado. Va en fase de captura para que Espacio funcione aunque el foco esté en un botón
  // (antes, si el foco se quedaba en un corazón o en «Mostrar más», Espacio pulsaba ese botón).
  const isSpace = e => e.code === 'Space' || e.key === ' ';
  const formControl = t => t.matches?.('input, select, button, [role=switch], [role=radio]');
  document.addEventListener('keydown', e => {
    const t = e.target;
    const inModal = !!t.closest?.('.modal');
    if (e.key === 'Escape') {
      if (!$('#onboard').hidden) closeOnboarding();
      else if (!$('#sheet').hidden) closeSheet();
      closeOverlays();
      return;
    }
    if (t.closest?.(TYPING)) return;
    if (isSpace(e)) {
      if (inModal && formControl(t)) return; // en ajustes, Espacio activa la opción enfocada
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) togglePlay();
      return;
    }
    if (inModal) return;
    if (e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); skip(1); return; }
    if (e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); skip(-1); return; }
    if (e.key === 'Enter' && t.classList?.contains('row')) { playRow(t); return; }
    if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'f')) {
      if (!navEnabled('search')) return;
      e.preventDefault();
      historyStack = [];
      view.name === 'search' ? $('#sq')?.focus() : go('search', null, false);
    }
  }, true);
  document.addEventListener('keyup', e => {
    const t = e.target;
    if ((e.code === 'Space' || e.key === ' ') && !t.closest?.(TYPING) && !(t.closest?.('.modal') && formControl(t))) e.preventDefault();
  }, true);
}

boot();
