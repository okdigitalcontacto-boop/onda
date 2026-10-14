'use strict';
/* Onda: cliente ligero para Spotify. Solo usa la Web API oficial y el Web Playback SDK. */

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REDIRECT = location.origin + '/callback';
const LOCAL_NAME = 'Onda · PC';
const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
  'user-read-recently-played', 'playlist-read-private', 'playlist-read-collaborative',
  'user-library-read', 'user-library-modify', 'user-follow-read', 'user-follow-modify',
].join(' ');

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
const CID = () => store.get('client_id');

function pickImg(images, min = 64) {
  if (!images?.length) return '';
  const s = [...images].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (s.find(i => (i.width || 9999) >= min) || s[s.length - 1]).url;
}
function plainText(html) { return new DOMParser().parseFromString(html || '', 'text/html').body.textContent || ''; }
function openExternal(url) {
  if (window.pywebview?.api?.open_url) window.pywebview.api.open_url(url); else window.open(url, '_blank');
}

/* ---------- iconos ---------- */
const FILL = {
  play: '<path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.8-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>',
  next: '<path d="M5 6.3v11.4a.9.9 0 0 0 1.4.75l8.5-5.7a.9.9 0 0 0 0-1.5L6.4 5.55A.9.9 0 0 0 5 6.3z"/><rect x="16.5" y="5" width="2.4" height="14" rx="1"/>',
  prev: '<path d="M19 6.3v11.4a.9.9 0 0 1-1.4.75l-8.5-5.7a.9.9 0 0 1 0-1.5l8.5-5.7A.9.9 0 0 1 19 6.3z"/><rect x="5.1" y="5" width="2.4" height="14" rx="1"/>',
  heartOn: '<path d="M12 20.2s-7.7-4.7-7.7-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.7 2.6c0 5.7-7.7 10.4-7.7 10.4z"/>',
};
const STROKE = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  library: '<path d="M5 4v16M10 4v16M14.5 4.6l4.2 15"/>',
  queue: '<path d="M4 6h13M4 11.5h13M4 17h7"/><path d="M15 15v5.5l4.5-2.75z"/>',
  shuffle: '<path d="M3 17h3c2 0 3.2-1 4.4-2.8l2.2-3.4C13.8 9 15 8 17 8h4M18 5l3 3-3 3M3 7h3c1.4 0 2.4.5 3.3 1.4M14.7 15.6c.9.9 1.9 1.4 3.3 1.4h3M18 14l3 3-3 3"/>',
  repeat: '<path d="M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1"/>',
  heart: '<path d="M12 20.2s-7.7-4.7-7.7-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.7 2.6c0 5.7-7.7 10.4-7.7 10.4z"/>',
  speaker: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><circle cx="12" cy="14" r="3"/><path d="M12 7.4v.2"/>',
  phone: '<rect x="7" y="2.8" width="10" height="18.4" rx="2.4"/><path d="M11 18h2"/>',
  laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
  volume: '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
};
function icon(n, cls = '') {
  const inner = FILL[n]
    ? `<g fill="currentColor">${FILL[n]}</g>`
    : `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${STROKE[n]}</g>`;
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}

/* ---------- avisos ---------- */
let toastT = null;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 4200);
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

function logout() {
  ['access', 'exp', 'refresh'].forEach(k => store.set(k, null));
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
      throw e;
    }
    return j;
  }
  throw new Error('Spotify no responde ahora mismo. Prueba de nuevo en unos segundos.');
}

function msg(e) {
  if (e instanceof AuthError) return 'Tu sesión ha caducado. Vuelve a conectar con Spotify.';
  const reasons = {
    PREMIUM_REQUIRED: 'Esto necesita Spotify Premium en la cuenta conectada.',
    VOLUME_CONTROL_DISALLOW: 'Ese dispositivo no deja cambiar el volumen desde fuera. Cámbialo en el propio dispositivo.',
    NO_PREV_TRACK: 'No hay canción anterior.',
    NO_NEXT_TRACK: 'No hay más canciones en la cola.',
    NO_ACTIVE_DEVICE: 'No hay ningún dispositivo activo. Elige uno con el botón de dispositivos de abajo a la derecha.',
    QUOTA_EXCEEDED: 'Has llegado al límite de peticiones de Spotify por ahora. Espera un par de minutos.',
  };
  if (e.reason && reasons[e.reason]) return reasons[e.reason];
  if (e.status === 404) return reasons.NO_ACTIVE_DEVICE;
  if (e.status === 403) return 'Spotify no permite esta acción (' + e.message + ').';
  if (e instanceof TypeError) return 'Sin conexión con Spotify. Comprueba tu internet.';
  return e.message;
}

/* ---------- estado ---------- */
let me = null;
let sdk = null, localId = null;
let pb = null, pbAt = 0, endKick = false;
let seeking = false, volDragging = false;
const likeMap = new Map();
let lists = {};
let myPls = [];

/* ---------- primer arranque ---------- */
function showSetup(error) {
  $('#app').hidden = true;
  const s = $('#setup');
  s.hidden = false;
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
          <li>Dentro de la app que acabas de crear, pulsa <b>Settings</b>, copia el <b>Client ID</b> y pégalo aquí debajo.</li>
        </ol>
        <div class="field">
          <label for="cid">Client ID</label>
          <input id="cid" spellcheck="false" autocomplete="off" placeholder="32 letras y números" value="${esc(CID() || '')}">
        </div>
      </div>
      <div class="setup-row">
        <button class="primary" id="connect">Conectar con Spotify</button>
        ${hasId ? '<button class="link" id="changeId">Cambiar Client ID</button>' : ''}
      </div>
      <p class="setup-msg" id="setupMsg" ${error ? '' : 'hidden'}>${esc(error || '')}</p>
    </div>`;

  s.onclick = e => {
    const ext = e.target.closest('[data-ext]');
    if (ext) openExternal(ext.dataset.ext);
    if (e.target.closest('[data-copy]')) navigator.clipboard.writeText(REDIRECT).then(() => toast('Dirección copiada'), () => toast('No se ha podido copiar. Selecciónala y cópiala a mano.'));
    if (e.target.id === 'changeId') { $('#steps').hidden = false; e.target.remove(); $('#cid').focus(); }
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
  try { await handleCallback(); } catch (e) { return showSetup(e.message); }
  if (!CID() || !store.get('refresh')) return showSetup();
  try { me = await api('/me'); } catch (e) { return showSetup(msg(e)); }
  startApp();
}

function startApp() {
  $('#setup').hidden = true;
  $('#app').hidden = false;
  renderSide();
  renderBar();
  loadSdk();
  bindGlobal();
  go('library', 'playlists');
  myPlaylists().then(renderSideList).catch(() => { });
  schedulePoll(300);
  setInterval(tick, 500);
}

/* ---------- reproductor del PC (Web Playback SDK) ---------- */
function loadSdk() {
  window.onSpotifyWebPlaybackSDKReady = () => {
    sdk = new Spotify.Player({
      name: LOCAL_NAME,
      getOAuthToken: cb => getToken().then(cb).catch(() => { }),
      volume: +(store.get('vol') || 70) / 100,
    });
    sdk.addListener('ready', ({ device_id }) => { localId = device_id; soon(); });
    sdk.addListener('not_ready', () => { localId = null; });
    sdk.addListener('player_state_changed', s => { if (s) fromSdk(s); });
    sdk.addListener('initialization_error', ({ message }) => { console.warn(message); toast('Este equipo no puede reproducir dentro de Onda. Puedes seguir usándola como mando de tus otros dispositivos.'); });
    sdk.addListener('authentication_error', ({ message }) => { console.warn(message); });
    sdk.addListener('account_error', () => toast('Para que suene en el PC hace falta Spotify Premium.'));
    sdk.addListener('playback_error', ({ message }) => { console.warn(message); toast('No se ha podido reproducir esa canción en el PC.'); });
    sdk.connect();
  };
  const s = document.createElement('script');
  s.src = 'https://sdk.scdn.co/spotify-player.js';
  s.onerror = () => toast('No se ha podido cargar el reproductor de Spotify. Comprueba tu internet.');
  document.head.appendChild(s);
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
    if (st || !isLocal()) setState(st);
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

/* ---------- órdenes ---------- */
async function cmd(fn) {
  try { await fn(); }
  catch (e) {
    if ((e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE') && localId) {
      try {
        await api('/me/player', { method: 'PUT', body: { device_ids: [localId], play: false } });
        await sleep(600);
        await fn();
      } catch (e2) { toast(msg(e2)); }
    } else toast(msg(e));
  }
  soon();
}

async function play(body, fallback) {
  const run = b => api('/me/player/play', { method: 'PUT', query: { device_id: targetDevice() }, body: b });
  try { await run(body); }
  catch (e) {
    if (fallback && e.status !== 404 && e.reason !== 'NO_ACTIVE_DEVICE') {
      try { await run(fallback); } catch (e2) { toast(msg(e2)); }
    } else if ((e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE') && localId) {
      try { await api('/me/player/play', { method: 'PUT', query: { device_id: localId }, body }); }
      catch (e2) { toast(msg(e2)); }
    } else toast(msg(e));
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
  if (isLocal() && sdk) { store.set('vol', String(v)); sdk.setVolume(v / 100); return; }
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
  const root = document.documentElement;
  if (!url) { root.style.setProperty('--tint', 'rgb(128 128 136)'); return; }
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
      if (tintUrl === url) root.style.setProperty('--tint', `rgb(${clampLight(rgb).join(' ')})`);
    } catch { root.style.setProperty('--tint', 'rgb(128 128 136)'); }
  };
  img.onerror = () => root.style.setProperty('--tint', 'rgb(128 128 136)');
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
    <button class="nav" data-act="nav" data-nav="search">${icon('search')}Buscar</button>
    <button class="nav" data-act="nav" data-nav="library">${icon('library')}Biblioteca</button>
    <button class="nav" data-act="nav" data-nav="queue">${icon('queue')}Cola</button>
    <div class="side-h">Playlists</div>
    <div class="side-list" id="sideList"></div>
    <div class="side-foot"><span title="${esc(me?.display_name)}">${esc(me?.display_name || '')}</span><button class="link" data-act="logout">Cerrar sesión</button></div>`;
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
        <button class="ib" id="bPrev" title="Anterior" aria-label="Anterior">${icon('prev')}</button>
        <button class="pp" id="bPlay" title="Reproducir" aria-label="Reproducir">${icon('play')}</button>
        <button class="ib" id="bNext" title="Siguiente" aria-label="Siguiente">${icon('next')}</button>
        <button class="ib" id="bRepeat" title="Repetir" aria-label="Repetir">${icon('repeat')}<span class="badge" id="rep1" hidden>1</span></button>
      </div>
      <div class="prog"><span id="tCur">0:00</span><input type="range" id="seek" min="0" max="1000" value="0" aria-label="Posición"><span id="tDur">0:00</span></div>
    </div>
    <div class="rt">
      <button class="ib" data-act="nav" data-nav="queue" title="Cola" aria-label="Cola">${icon('queue')}</button>
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
  $('#bPlay').title = $('#bPlay').ariaLabel = pb?.playing ? 'Pausa' : 'Reproducir';
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
}
function onTrackChange() {
  const it = pb?.item;
  tintFrom(it ? pickImg(it.album?.images, 64) : null);
  paintRowsOn();
  if (it) checkLikes($('#bar'));
  if (view.name === 'queue') render(false);
}
function paintRowsOn() {
  const uri = pb?.item?.uri;
  document.querySelectorAll('.row').forEach(r => r.classList.toggle('on', !!uri && r.dataset.uri === uri));
}

/* ---------- dispositivos ---------- */
const DEV_LABEL = { Computer: 'Ordenador', Smartphone: 'Móvil', Speaker: 'Altavoz', TV: 'Televisión', Tablet: 'Tableta', CastAudio: 'Altavoz', CastVideo: 'Chromecast', GameConsole: 'Consola', AVR: 'Equipo de audio', Automobile: 'Coche' };
const DEV_ICON = { Computer: 'laptop', Smartphone: 'phone', Tablet: 'phone' };
async function toggleDevices() {
  const pop = $('#devpop');
  if (!pop.hidden) { pop.hidden = true; return; }
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
    + (onlyLocal ? '<p class="pop-note">¿No ves tu iPhone o tu Mac? Abre Spotify en ese dispositivo y aparecerá aquí.</p>' : '');
}
async function transferTo(id) {
  $('#devpop').hidden = true;
  try {
    await api('/me/player', { method: 'PUT', body: { device_ids: [id], play: pb ? pb.playing : true } });
    toast(id === localId ? 'Ahora suena en este PC' : 'Cambiado de dispositivo');
  } catch (e) { toast(msg(e)); }
  setTimeout(soon, 400);
}

/* ---------- vistas ---------- */
let view = { name: null, arg: null };
let historyStack = [];
let renderToken = 0;

function go(name, arg = null, push = true) {
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
    m.innerHTML = (historyStack.length && view.name !== 'search' && view.name !== 'library' && view.name !== 'queue'
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
  const src = pickImg(x.images, 300);
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

function hero({ img, round, eyebrow, title, meta = '', desc = '', actions = '' }) {
  return `<header class="hero">
    ${img ? `<img class="art ${round ? 'round' : ''}" src="${esc(img)}" alt="">` : `<div class="art ${round ? 'round' : ''}"></div>`}
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
      <div class="acts">${isTrack ? likeBtn(t.uri) : ''}<button class="ib" data-act="queue" data-uri="${esc(t.uri)}" title="Añadir a la cola" aria-label="Añadir a la cola">${icon('plus')}</button></div>
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
  play(body, L.fallback ? L.fallback(t, i, L) : null);
}
const listCtx = uri => t => ({ context_uri: uri, offset: { uri: t.uri } });
const uriListCtx = (t, i, L) => ({ uris: L.tracks.slice(0, 100).map(x => x.uri), offset: { position: Math.min(i, 99) } });
const collectionUri = () => `spotify:user:${me.id}:collection`;

const VIEWS = {
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
      eyebrow: 'Playlist', title: 'Canciones que te gustan',
      meta: plural(j.total, 'canción', 'canciones'),
      actions: j.total ? bigPlay('data-act="playall" data-list="liked"') : '',
    }).replace('<div class="art "></div>', `<div class="art cv liked-cv" style="margin:0">${icon('heartOn')}</div>`)
      + (tracks.length ? makeList('liked', {
        tracks, next: j.next,
        page: p => ({ items: p.items.map(x => x.track), next: p.next }),
        context: listCtx(collectionUri()), fallback: uriListCtx,
        opts: { cover: true, album: true },
      }) : empty('Todavía no tienes canciones guardadas. Pulsa el corazón en cualquier canción para tenerla aquí.'));
  },

  async playlist(id) {
    const p = await api(`/playlists/${id}`);
    const box = p.items || p.tracks;
    const entries = box?.items;
    const total = box?.total;
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
      img: pickImg(p.images, 300), eyebrow: p.public === false ? 'Playlist privada' : 'Playlist',
      title: p.name, meta, desc: plainText(p.description),
      actions: entries?.length ? bigPlay('data-act="playall" data-list="pl"') : bigPlay(`data-act="playctx" data-uri="${esc(p.uri)}"`),
    }) + body;
  },

  async album(id) {
    const a = await api(`/albums/${id}`);
    const withAlbum = items => items.map(t => ({ ...t, album: { id: a.id, name: a.name, images: a.images } }));
    const tracks = withAlbum(a.tracks?.items || []);
    const totalMs = tracks.reduce((s, t) => s + (t.duration_ms || 0), 0);
    const kind = { album: 'Álbum', single: 'Single', compilation: 'Recopilatorio' }[a.album_type] || 'Álbum';
    const n = a.total_tracks ?? tracks.length;
    const meta = [artistLinks(a.artists), a.release_date?.slice(0, 4), plural(n, 'canción', 'canciones'), a.tracks?.next ? '' : Math.round(totalMs / 60000) + ' min'].filter(Boolean).join(' · ');
    return hero({
      img: pickImg(a.images, 300), eyebrow: kind, title: a.name, meta,
      actions: bigPlay('data-act="playall" data-list="al"') + likeBtn(a.uri, 'album'),
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
    return hero({
      img: pickImg(ar.images, 300), round: true, eyebrow: 'Artista', title: ar.name,
      actions: bigPlay(`data-act="playctx" data-uri="${esc(ar.uri)}"`) + likeBtn(ar.uri, 'artist'),
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

/* ---------- eventos ---------- */
function bindGlobal() {
  document.addEventListener('click', async e => {
    const pop = $('#devpop');
    const dv = e.target.closest('[data-dev]');
    if (dv) return transferTo(dv.dataset.dev);
    if (!pop.hidden && !e.target.closest('#devpop')) pop.hidden = true;

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
      case 'liked': go('liked'); break;
      case 'playlist': case 'album': case 'artist': go(d.act, d.id); break;
      case 'rowplay': playRow(el.closest('.row')); break;
      case 'like': e.stopPropagation(); toggleLike(d.uri, d.kind); break;
      case 'queue': if (d.uri) addToQueue(d.uri); else go('queue'); break;
      case 'more': loadMore(d.list, el); break;
      case 'playall': { const L = lists[d.list]; if (L?.tracks.length) playRow({ dataset: { list: d.list, i: '0' } }); break; }
      case 'playctx': play({ context_uri: d.uri }); break;
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

  document.addEventListener('dblclick', e => {
    const row = e.target.closest('.row');
    if (row && !e.target.closest('a, button')) playRow(row);
  });

  // El SDK necesita un gesto del usuario para poder sonar en el PC
  document.addEventListener('pointerdown', () => { try { sdk?.activateElement(); } catch { } }, { once: true });

  document.addEventListener('keydown', e => {
    const typing = e.target.closest('input, textarea');
    if (e.key === 'Escape') $('#devpop').hidden = true;
    if (typing) return;
    if (e.key === 'Enter' && e.target.classList?.contains('row')) { playRow(e.target); return; }
    if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); togglePlay(); }
    if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'f')) { e.preventDefault(); historyStack = []; view.name === 'search' ? $('#sq')?.focus() : go('search', null, false); }
  });
}

boot();
