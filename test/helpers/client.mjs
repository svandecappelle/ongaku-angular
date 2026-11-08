/**
 * HTTP client of the test instance started by test/run.mjs: one session per user,
 * opened on first use.
 */
import fs from 'node:fs';
import path from 'node:path';

export const BASE = process.env.ONGAKU_TEST_URL;
export const USERS = JSON.parse(process.env.ONGAKU_TEST_USERS || '{}');
export const MUSIC = process.env.ONGAKU_TEST_MUSIC;
export const ASSETS = process.env.ONGAKU_TEST_ASSETS;
export const APP = process.env.ONGAKU_TEST_APP;

if (!BASE) {
  throw new Error('Run the tests with "npm test" (test/run.mjs starts the test instance)');
}

const sessions = new Map();

/** Session cookie of a user ("boss" is the administrator) */
export async function login(name) {
  if (!sessions.has(name)) {
    const user = USERS[name];
    const response = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.username, password: user.password }),
    });
    const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('connect.sid='));
    if (!cookie) {
      throw new Error(`Cannot log in as ${name}: ${response.status}`);
    }
    sessions.set(name, cookie);
  }
  return sessions.get(name);
}

/** Forgets the session of a user (after a ban or a password change) */
export function logout(name) {
  sessions.delete(name);
}

/**
 * Request to the API. `as`: the user (anonymous when omitted); `json`: a JSON body;
 * `form`: a FormData body. Resolves with { status, body } (body parsed when JSON).
 */
export async function api(urlPath, { as, method, json, form, headers = {} } = {}) {
  const init = { method: method ?? (json || form ? 'POST' : 'GET'), headers: { ...headers }, redirect: 'manual' };
  if (as) {
    init.headers.Cookie = await login(as);
  }
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form) {
    init.body = form;
  }
  const response = await fetch(`${BASE}${urlPath}`, init);
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON
  }
  return { status: response.status, body, headers: response.headers };
}

/** FormData holding a file of the fixture assets (or a path) under `field` */
export function fileForm(file, field = 'file', type = 'application/octet-stream') {
  const full = path.isAbsolute(file) ? file : path.join(ASSETS, file);
  const form = new FormData();
  form.append(field, new Blob([fs.readFileSync(full)], { type }), path.basename(full));
  return form;
}

/** The visible track of this exact title (as `as` sees it), or undefined */
export async function track(title, as = 'boss') {
  const { body } = await api(`/api/audio/tracks/filter/${encodeURIComponent(title)}/0?lenght=50`, { as });
  return (Array.isArray(body) ? body : []).find((t) => t.title === title);
}

/** Like track(), failing when the track is not there */
export async function uidOf(title, as = 'boss') {
  const found = await track(title, as);
  if (!found) {
    throw new Error(`No track "${title}" for ${as}`);
  }
  return found.uid;
}

/** Tracks of /api/audio/album/:artist/:album */
export async function albumTracks(artist, album, as = 'boss') {
  const { body } = await api(`/api/audio/album/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`, { as });
  return (body?.[0]?.albums ?? []).flatMap((group) => group.tracks);
}

/** Waits until `check` resolves truthy (the server rescans in the background) */
export async function eventually(check, { timeout = 15000, interval = 250, what = 'the condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await check();
    if (last) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out waiting for ${what}`);
}
