// 12. 구글 캘린더 실시간 양방향 연동 (담당: 서버 세션 · 11-18 사람 "구글/노션 캘린더랑 연동되어서 실시간으로 둘 다 반영되게 해줘")
//
// 노션 캘린더는 API가 없고 연결된 구글 캘린더를 그대로 보여 주므로, 구글 기본 캘린더(primary)와 맞추면 노션에도 보인다.
//
//   GET    /api/gcal           (로그인) → { ready, linked, error, pulled_at }   ready = 표·비밀값이 있어 연결할 수 있음
//   GET    /api/gcal/connect   (로그인) → 구글 동의 화면(calendar.events 권한, 오프라인 토큰)
//   GET    /api/gcal/callback  → refresh 토큰을 잠가 저장 → 처음 맞추기 → /?gcal=ok|denied|scope|state|google|config
//   POST   /api/gcal/push      (구글이 부름, 로그인 없음) 바뀜 알림 → 바로 맞추기
//   POST   /api/gcal/sync      (로그인) 지금 맞추기(화면에 돌아올 때) → { linked }
//   DELETE /api/gcal           (로그인) 끊기: Tachyon이 넣은 구글 일정 지우기 · 알림 끄기 · 토큰 폐기
//
// 맞추는 법
// - 구글 → Tachyon: 알림 채널(events.watch)이 바뀔 때마다 /api/gcal/push를 부른다 → updatedMin 뒤에 바뀐 것만 받는다.
//   구글에서 처음 보는 일정은 source 'google'(ext_id = gcal_id = 구글 일정 id). 하루 한 번은 기간 전체를 받아 빠진 것을 지운다.
// - Tachyon → 구글: 쓰기 요청이 끝날 때마다(index.js) 기간 안 일정의 지금 내용을 마지막으로 맞춘 내용(gcal_seen)과 견줘
//   넣기·고치기, 지운 일정은 트리거가 gcal_gone에 남긴 id로 구글에서도 지운다. 구글 batch(한 요청에 50개)로 보낸다.
// - 넣는 것: 8_calendar_feed와 같다(구글·애플·네이버·폰 캘린더에서 온 것 빼고). 할 일은 안 넣는다(구독 주소에 마감이 남음).
// - 둘 다 바뀌면 구글이 이긴다(맞출 때 Tachyon 쪽을 먼저 보내고 받아 오므로 거의 안 생김).
// - 기간은 수집기와 같은 지난 30일 ~ 앞으로 6개월.

import { seal, unseal, b64url } from './lib/secret.js';
import { getCookie, cookie } from './lib/auth.js';
import { json, fail } from './lib/http.js';
import { kstIso, kstDate, DAY_MS } from './lib/time.js';
import { syncWindow } from './2_collect_ics.js';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const CAL = 'https://www.googleapis.com/calendar/v3';
const BATCH = 'https://www.googleapis.com/batch/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const STATE_COOKIE = 'tachyon_gcal';
const SKIP = ['google', 'apple', 'naver', 'device']; // 8_calendar_feed SKIP_SOURCES와 같음
const PER_RUN = 200; // 한 번에 보내는 넣기·고치기·지우기(batch 4번). ponytail: 나머지는 다음 쓰기·30분 Cron이 잇는다
const USERS_PER_CRON = 3; // 한 사람에 외부 요청 3~12개·DB 질의 약 14개 → 무료 요금제 한 번 50개 안. ponytail: 사람이 많아지면 Cron을 자주

export async function handle(request, env, ctx, user) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/api/gcal/push') return onPush(request, env, ctx);
  if (path === '/api/gcal/callback') return finish(request, url, env, ctx, user);
  if (!user) return fail(401, '로그인이 필요해요');
  if (path === '/api/gcal/connect') return start(url, env, user);
  if (path === '/api/gcal/sync' && request.method === 'POST') {
    if (!(await isLinked(env, user.id))) return json({ ok: true, linked: false });
    await sync(env, user.id);
    return json({ ok: true, linked: true });
  }
  if (path === '/api/gcal' && request.method === 'GET') return json(await status(env, user.id));
  if (path === '/api/gcal' && request.method === 'DELETE') return json(await disconnect(env, user.id));
  return fail(404, '없는 주소');
}

// ── 다른 번호 파일이 묻는 것 ──────────────────────────────────────

const noTable = (err) => /no such table|no such column/i.test(String(err && err.message));

/** 연동 중인가(2_collect_ics: 구글 ICS 건너뜀 · 7_items: 구글 일정도 고치고 지움 · 8_calendar_feed: 일정 빼고 마감만). 표가 없으면 false */
export async function isLinked(env, userId) {
  try {
    return !!(await env.DB.prepare('SELECT 1 FROM gcal WHERE user_id = ?').bind(userId).first());
  } catch (err) {
    if (noTable(err)) return false; // 원격 D1에 표를 넣기 전
    throw err;
  }
}

/** 연동 중인 사람 id 모음(수집기 Cron 한 번에 한 번) */
export async function linkedUsers(env) {
  try {
    return new Set((await env.DB.prepare('SELECT user_id FROM gcal').all()).results.map((r) => r.user_id));
  } catch (err) {
    if (noTable(err)) return new Set();
    throw err;
  }
}

/** index.js가 쓰기 요청 뒤에 부른다: 바뀐 일정만 구글에 보낸다(바뀐 게 없으면 구글에 안 묻는다) */
export async function afterWrite(env, userId) {
  if (await isLinked(env, userId)) await sync(env, userId, { pull: false });
}

// ── 연결 ─────────────────────────────────────────────────────────

async function status(env, userId) {
  const ready = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  try {
    const row = await env.DB.prepare('SELECT error, pulled_at FROM gcal WHERE user_id = ?').bind(userId).first();
    return { ok: true, ready, linked: !!row, error: row?.error ?? null, pulled_at: row?.pulled_at ? kstIso(row.pulled_at) : null };
  } catch (err) {
    if (noTable(err)) return { ok: true, ready: false, linked: false, error: null, pulled_at: null };
    throw err;
  }
}

function start(url, env, user) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return backHome(url, 'config');
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const google = new URL(AUTH);
  google.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/api/gcal/callback`,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // 다시 연결할 때도 refresh 토큰을 새로 받게
    login_hint: user.email,
    state,
  }).toString();
  return new Response(null, { status: 302, headers: { location: google.toString(), 'set-cookie': cookie(STATE_COOKIE, state, 600, { path: '/api/gcal' }) } });
}

async function finish(request, url, env, ctx, user) {
  const state = getCookie(request, STATE_COOKIE);
  const clear = cookie(STATE_COOKIE, '', 0, { path: '/api/gcal' });
  if (url.searchParams.get('error')) return backHome(url, 'denied', clear);
  if (!user || !state || state !== url.searchParams.get('state') || !url.searchParams.get('code')) return backHome(url, 'state', clear);
  let token;
  try {
    token = await tokenCall(env, { code: url.searchParams.get('code'), redirect_uri: `${url.origin}/api/gcal/callback`, grant_type: 'authorization_code' });
  } catch (err) {
    console.error('구글 캘린더: 토큰 교환 실패', err && err.message);
    return backHome(url, 'google', clear);
  }
  if (!String(token.scope || '').split(' ').includes(SCOPE)) return backHome(url, 'scope', clear); // 동의 화면에서 캘린더 칸을 껐다
  if (!token.refresh_token) return backHome(url, 'google', clear);
  await env.DB.prepare(
    `INSERT INTO gcal (user_id, refresh, hook) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET refresh = excluded.refresh, hook = excluded.hook, error = NULL, pulled_at = NULL, full_at = NULL`,
  )
    .bind(user.id, await seal(env, token.refresh_token), url.origin)
    .run();
  ctx?.waitUntil?.(sync(env, user.id, { token: token.access_token }).catch((err) => console.error('구글 캘린더: 처음 맞추기 실패', err && err.message)));
  return backHome(url, 'ok', clear);
}

function backHome(url, reason, setCookie) {
  const headers = { location: `${url.origin}/?gcal=${reason}` };
  if (setCookie) headers['set-cookie'] = setCookie;
  return new Response(null, { status: 302, headers });
}

async function disconnect(env, userId) {
  const row = await env.DB.prepare('SELECT * FROM gcal WHERE user_id = ?').bind(userId).first();
  if (!row) return { ok: true, linked: false };
  try {
    const token = await accessToken(env, row);
    // Tachyon이 넣은 일정을 구글에서 지운다(남기면 Tachyon과 따로 놀아서)
    const { results } = await env.DB.prepare("SELECT gcal_id FROM events WHERE user_id = ? AND gcal_id LIKE 'tc%' LIMIT 1000").bind(userId).all();
    await batch(token, results.map((r) => ({ method: 'DELETE', path: `/events/${encodeURIComponent(r.gcal_id)}` })));
    if (row.channel) await gfetch(token, 'POST', `${CAL}/channels/stop`, { id: row.channel, resourceId: row.resource }).catch(() => {});
    await fetch(`${REVOKE}?token=${encodeURIComponent(await unseal(env, row.refresh))}`, { method: 'POST' }).catch(() => {});
  } catch (err) {
    console.error('구글 캘린더: 끊기 중 구글 쪽 정리 실패(이쪽 기록은 지움)', err && err.message);
  }
  await env.DB.batch([
    // 구글에서 받아 온 일정은 지우고(구글 ICS 주소가 있으면 다음 수집 때 다시 들어온다), 남은 일정의 짝 id는 비운다
    env.DB.prepare("UPDATE events SET gcal_id = NULL, gcal_seen = 'gone' WHERE user_id = ? AND source = 'google' AND gcal_id IS NOT NULL").bind(userId),
    env.DB.prepare("DELETE FROM events WHERE user_id = ? AND gcal_seen = 'gone'").bind(userId),
    env.DB.prepare('UPDATE events SET gcal_id = NULL, gcal_seen = NULL WHERE user_id = ? AND gcal_id IS NOT NULL').bind(userId),
    env.DB.prepare('DELETE FROM gcal_gone WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM gcal WHERE user_id = ?').bind(userId),
    env.DB.prepare("UPDATE feeds SET last_hash = NULL, last_try_at = NULL WHERE user_id = ? AND kind = 'google'").bind(userId), // 내용이 같아도 다시 쓰게
  ]);
  return { ok: true, linked: false };
}

// ── 알림·Cron ───────────────────────────────────────────────────

async function onPush(request, env, ctx) {
  const channel = request.headers.get('x-goog-channel-id');
  const resource = request.headers.get('x-goog-resource-id');
  // 채널 id는 우리가 만든 무작위 UUID라 그 자체가 비밀. 모르는 채널이어도 200(구글이 되풀이하지 않게)
  if (channel && request.headers.get('x-goog-resource-state') !== 'sync') {
    const row = await env.DB.prepare('SELECT user_id FROM gcal WHERE channel = ? AND resource = ?').bind(channel, resource).first().catch(() => null);
    if (row) ctx?.waitUntil?.(sync(env, row.user_id).catch((err) => console.error('구글 캘린더: 알림 뒤 맞추기 실패', err && err.message)));
  }
  return new Response(null, { status: 204 });
}

export async function scheduled(event, env) {
  let rows;
  try {
    ({ results: rows } = await env.DB.prepare("SELECT user_id FROM gcal WHERE error IS NOT 'reconnect' ORDER BY pulled_at LIMIT ?").bind(USERS_PER_CRON).all());
  } catch (err) {
    if (noTable(err)) return;
    throw err;
  }
  for (const r of rows) await sync(env, r.user_id).catch((err) => console.error('구글 캘린더 Cron 실패', err && err.message));
  await env.DB.prepare('DELETE FROM gcal_gone WHERE user_id NOT IN (SELECT user_id FROM gcal)').run(); // 사람을 지울 때 남은 것
}

// ── 맞추기 ───────────────────────────────────────────────────────

/** 보내기 → (pull이면) 받아 오기 → 알림 채널이 하루 안에 끝나면 새로. 실패는 gcal.error에 적는다 */
export async function sync(env, userId, { pull = true, token = null, now = Date.now() } = {}) {
  const row = await env.DB.prepare('SELECT * FROM gcal WHERE user_id = ?').bind(userId).first();
  if (!row || row.error === 'reconnect') return;
  const auth = async () => (token ??= await accessToken(env, row));
  try {
    await push(env, userId, auth, now);
    if (!pull) return;
    await pullChanges(env, row, auth, now);
    if (!row.channel_exp || row.channel_exp < now + DAY_MS) await watch(env, row, await auth());
  } catch (err) {
    const error = err.dead ? 'reconnect' : String(err.message || err).slice(0, 200);
    await env.DB.prepare('UPDATE gcal SET error = ? WHERE user_id = ?').bind(error, userId).run();
    if (!err.dead) throw err;
  }
}

function range(now) {
  const { from, to } = syncWindow(now);
  return { from, to, fromDay: kstDate(from.getTime()), toDay: kstDate(to.getTime()) };
}

/** Tachyon → 구글 */
async function push(env, userId, auth, now) {
  const { fromDay, toDay } = range(now);
  const [, rows, gone] = await env.DB.batch([
    // 아직 짝이 없는 일정에 구글 id를 먼저 정해 둔다(보내다 끊겨도 다음에 같은 id로 → 두 번 안 들어감). base32hex 32자
    env.DB.prepare(
      `UPDATE events SET gcal_id = 'tc' || lower(hex(randomblob(15)))
        WHERE user_id = ? AND gcal_id IS NULL AND moved_to IS NULL AND source NOT IN (${SKIP.map(() => '?').join(', ')}) AND start >= ? AND start < ?`,
    ).bind(userId, ...SKIP, fromDay, toDay),
    env.DB.prepare('SELECT id, title, start, "end", place, moved_to, gcal_id, gcal_seen FROM events WHERE user_id = ? AND gcal_id IS NOT NULL AND start >= ? AND start < ?').bind(
      userId,
      fromDay,
      toDay,
    ),
    env.DB.prepare('SELECT gcal_id FROM gcal_gone WHERE user_id = ? LIMIT ?').bind(userId, PER_RUN),
  ]);
  const ops = [];
  for (const e of rows.results) {
    const k = seenKey(e);
    if (e.moved_to != null) ops.push({ e, kind: 'drop', method: 'DELETE', path: `/events/${encodeURIComponent(e.gcal_id)}` }); // 메모로 '일정 변경'·고친 사본에 가려짐
    else if (e.gcal_seen == null) ops.push({ e, k, kind: 'insert', method: 'POST', path: '/events', body: { id: e.gcal_id, ...toGoogle(e) } });
    else if (e.gcal_seen !== k) ops.push({ e, k, kind: 'patch', method: 'PATCH', path: `/events/${encodeURIComponent(e.gcal_id)}`, body: toGoogle(e) });
  }
  for (const g of gone.results) ops.push({ gone: g.gcal_id, method: 'DELETE', path: `/events/${encodeURIComponent(g.gcal_id)}` });
  if (!ops.length) return;

  const list = ops.slice(0, PER_RUN);
  const results = await batch(await auth(), list);
  const marks = []; // { id, gid, seen }
  const drop = [];
  list.forEach((op, i) => {
    const r = results[i];
    if (r === 'retry') return; // 다음에 다시
    if (op.gone) return drop.push(op.gone);
    const keep = { id: op.e.id, gid: op.e.gcal_id };
    if (op.kind === 'drop') marks.push({ id: op.e.id, gid: null, seen: null });
    else if (r === 'gone') marks.push({ id: op.e.id, gid: null, seen: null }); // 구글에서 사라짐 → Tachyon 것은 새 id로 다시 넣고, 구글 것은 하루 한 번 전체 받기 때 지움
    else if (r === 'exists') marks.push({ ...keep, seen: '' }); // 이미 있음 → 다음에 고치기로
    else marks.push({ ...keep, seen: op.k }); // ok, 또는 구글이 안 받는 일정(bad) — 되풀이해 보내지 않는다
  });
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE events SET gcal_id = j.gid, gcal_seen = j.seen
         FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.gid') AS gid, json_extract(value, '$.seen') AS seen FROM json_each(?)) AS j
        WHERE events.user_id = ? AND events.id = j.id`,
    ).bind(JSON.stringify(marks), userId),
    env.DB.prepare('DELETE FROM gcal_gone WHERE user_id = ? AND gcal_id IN (SELECT value FROM json_each(?))').bind(userId, JSON.stringify(drop)),
  ]);
}

/** 구글 → Tachyon. 처음·하루 한 번은 기간 전체, 그 밖에는 지난번 뒤에 바뀐 것만(지운 것 포함) */
async function pullChanges(env, row, auth, now) {
  const { from, to, fromDay, toDay } = range(now);
  let full = !row.pulled_at || !row.full_at || row.full_at < now - DAY_MS;
  let items;
  try {
    items = await listEvents(await auth(), from, to, full ? null : row.pulled_at - 120000);
  } catch (err) {
    if (err.status !== 410) throw err; // updatedMin이 너무 옛날이면 410 → 전체로
    full = true;
    items = await listEvents(await auth(), from, to, null);
  }
  const live = items.list.filter((g) => g.status !== 'cancelled' && (g.start?.date || g.start?.dateTime)).map(fromGoogle);
  const dead = items.list.filter((g) => g.status === 'cancelled').map((g) => g.id);
  const j = JSON.stringify(live);
  const cols = `json_extract(value, '$.gid') AS gid, json_extract(value, '$.title') AS title, json_extract(value, '$.start') AS start,
                json_extract(value, '$.end') AS e, json_extract(value, '$.place') AS place, json_extract(value, '$.seen') AS seen`;
  const userId = row.user_id;
  await env.DB.batch([
    // 이미 짝이 있는 일정(어느 쪽에서 왔든)은 구글에서 바뀐 것만 고친다
    env.DB.prepare(
      `UPDATE events SET title = j.title, start = j.start, "end" = j.e, place = j.place, gcal_seen = j.seen
         FROM (SELECT ${cols} FROM json_each(?)) AS j
        WHERE events.user_id = ? AND events.gcal_id = j.gid AND events.gcal_seen IS NOT j.seen`,
    ).bind(j, userId),
    // 처음 보는 구글 일정 → source google (Tachyon이 넣은 'tc…'는 Tachyon 쪽이 지워졌으면 다시 만들지 않는다)
    env.DB.prepare(
      `INSERT INTO events (user_id, title, start, "end", place, source, ext_id, gcal_id, gcal_seen)
       SELECT ?1, j.title, j.start, j.e, j.place, 'google', j.gid, j.gid, j.seen FROM (SELECT ${cols} FROM json_each(?2)) AS j
        WHERE j.gid NOT LIKE 'tc%' AND NOT EXISTS (SELECT 1 FROM events WHERE user_id = ?1 AND gcal_id = j.gid)
       ON CONFLICT (user_id, source, ext_id) DO UPDATE SET title = excluded.title, start = excluded.start, "end" = excluded."end",
          place = excluded.place, gcal_id = excluded.gcal_id, gcal_seen = excluded.gcal_seen`,
    ).bind(userId, j),
    // 구글에서 지운 것: 표시('gone')하고 짝 id를 비운 뒤 지운다 → 트리거가 다시 구글에 지우라고 남기지 않는다
    env.DB.prepare("UPDATE events SET gcal_id = NULL, gcal_seen = 'gone' WHERE user_id = ? AND gcal_id IN (SELECT value FROM json_each(?))").bind(userId, JSON.stringify(dead)),
    // 기간 전체를 다 받았으면 구글에 없는 구글 일정(옛 ICS로 받은 것 포함)도 지운다
    env.DB.prepare(
      `UPDATE events SET gcal_id = NULL, gcal_seen = 'gone'
        WHERE ?1 AND user_id = ?2 AND source = 'google' AND start >= ?3 AND start < ?4
          AND (gcal_id IS NULL OR gcal_id NOT IN (SELECT json_extract(value, '$.gid') FROM json_each(?5)))`,
    ).bind(full && items.complete ? 1 : 0, userId, fromDay, toDay, j),
    // 지우는 일정에 가려 둔 옛 일정은 다시 보이게(7_items 지우기와 같음)
    env.DB.prepare("UPDATE events SET moved_to = NULL WHERE user_id = ?1 AND moved_to IN (SELECT id FROM events WHERE user_id = ?1 AND gcal_seen = 'gone')").bind(userId),
    env.DB.prepare("DELETE FROM events WHERE user_id = ? AND gcal_seen = 'gone'").bind(userId),
    env.DB.prepare('UPDATE gcal SET pulled_at = ?, full_at = ?, error = NULL WHERE user_id = ?').bind(now, full ? now : row.full_at, userId),
  ]);
}

async function listEvents(token, from, to, updatedMin) {
  const q = new URLSearchParams({ singleEvents: 'true', maxResults: '2500', timeMin: from.toISOString(), timeMax: to.toISOString() });
  if (updatedMin) {
    q.set('updatedMin', new Date(updatedMin).toISOString());
    q.set('showDeleted', 'true');
  }
  const list = [];
  for (let page = 0; page < 4; page++) {
    const r = await gfetch(token, 'GET', `${CAL}/calendars/primary/events?${q}`);
    list.push(...(r.items || []));
    if (!r.nextPageToken) return { list, complete: true };
    q.set('pageToken', r.nextPageToken);
  }
  return { list, complete: false };
}

async function watch(env, row, token) {
  const id = crypto.randomUUID();
  const r = await gfetch(token, 'POST', `${CAL}/calendars/primary/events/watch`, { id, type: 'web_hook', address: `${row.hook}/api/gcal/push` });
  await env.DB.prepare('UPDATE gcal SET channel = ?, resource = ?, channel_exp = ? WHERE user_id = ?').bind(id, r.resourceId, Number(r.expiration) || null, row.user_id).run();
  // 옛 채널은 새 채널을 연 뒤에 닫는다(그 사이 바뀜을 놓치지 않게)
  if (row.channel) await gfetch(token, 'POST', `${CAL}/channels/stop`, { id: row.channel, resourceId: row.resource }).catch(() => {});
}

// ── 모양 바꾸기 ─────────────────────────────────────────────────

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** DB 시각을 한 모양으로: 종일은 날짜(끝 = 다음 날, 8_calendar_feed와 같음), 시각은 kstIso(끝이 없으면 시작과 같음) */
export function times(start, end) {
  if (DATE.test(start)) {
    return { allDay: true, start, end: end && DATE.test(end) && end > start ? end : kstDate(Date.parse(`${start}T00:00:00+09:00`) + DAY_MS) };
  }
  const s = Date.parse(start);
  const e = end ? Date.parse(end) : NaN;
  return { allDay: false, start: kstIso(s), end: kstIso(e > s ? e : s) };
}

/** 두 쪽이 같은지 견주는 글: 이름·시각·장소 */
export function seenKey(e) {
  const t = times(e.start, e.end);
  return JSON.stringify([e.title, t.start, t.end, e.place || '']);
}

export function toGoogle(e) {
  const t = times(e.start, e.end);
  const at = (v) => (t.allDay ? { date: v, dateTime: null } : { dateTime: v, date: null });
  return { summary: e.title, location: e.place || '', start: at(t.start), end: at(t.end) };
}

export function fromGoogle(g) {
  const allDay = !!g.start.date;
  const start = allDay ? g.start.date : kstIso(Date.parse(g.start.dateTime));
  const end = allDay ? g.end?.date : g.end?.dateTime && kstIso(Date.parse(g.end.dateTime));
  const e = { title: String(g.summary || '(제목 없음)').slice(0, 200), start, end: end || null, place: g.location ? String(g.location).slice(0, 200) : null };
  return { gid: g.id, ...e, seen: seenKey(e) };
}

// ── 구글에 묻기 ─────────────────────────────────────────────────

async function tokenCall(env, params) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  // invalid_grant = 사용자가 권한을 거뒀거나 토큰이 죽음(시험 모드 앱은 7일) → 다시 연결해야 함
  if (!res.ok) throw Object.assign(new Error(`구글 토큰 HTTP ${res.status} ${body.error || ''}`.trim()), { dead: body.error === 'invalid_grant' });
  return body;
}

async function accessToken(env, row) {
  return (await tokenCall(env, { refresh_token: await unseal(env, row.refresh), grant_type: 'refresh_token' })).access_token;
}

async function gfetch(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body && { 'content-type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw Object.assign(new Error(`구글 캘린더 HTTP ${res.status}`), { status: res.status });
  return res.status === 204 ? {} : res.json();
}

/** 구글 batch: 요청 50개를 한 번에(외부 요청 하나로 셈). 결과는 ops 순서대로 'ok' | 'gone' | 'exists' | 'bad' | 'retry' */
export async function batch(token, ops) {
  const out = [];
  for (let i = 0; i < ops.length; i += 50) {
    const part = ops.slice(i, i + 50);
    const boundary = `tachyon${crypto.randomUUID()}`;
    const body =
      part
        .map((op, k) =>
          [
            `--${boundary}`,
            'Content-Type: application/http',
            `Content-ID: <op${k}>`,
            '',
            `${op.method} /calendar/v3/calendars/primary${op.path} HTTP/1.1`,
            ...(op.body ? ['Content-Type: application/json', '', JSON.stringify(op.body)] : ['']),
            '',
          ].join('\r\n'),
        )
        .join('') + `--${boundary}--`;
    const res = await fetch(BATCH, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/mixed; boundary=${boundary}` }, body });
    if (!res.ok) throw Object.assign(new Error(`구글 batch HTTP ${res.status}`), { status: res.status });
    const codes = part.map(() => 'retry');
    for (const m of (await res.text()).matchAll(/Content-ID:\s*<response-op(\d+)>[\s\S]*?HTTP\/1\.1 (\d{3})([\s\S]*?)(?=\r?\n--|$)/gi)) {
      codes[Number(m[1])] = outcome(Number(m[2]), m[3]);
    }
    out.push(...codes);
  }
  return out;
}

function outcome(code, text) {
  if (code >= 200 && code < 300) return 'ok';
  if (code === 404 || code === 410) return 'gone';
  if (code === 409) return 'exists';
  if (code === 401 || code === 429 || code >= 500 || (code === 403 && /rateLimit|usageLimits|quotaExceeded/i.test(text))) return 'retry';
  return 'bad';
}
