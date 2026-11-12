// 2. ICS 수집 (담당: 서버 세션)
//
// eTL·구글·애플 캘린더 주소(ICS)를 받아 eTL 과제는 tasks, 나머지는 events에 넣는다.
//
//   GET  /api/feeds          내 주소 세 칸(etl·google·apple)의 상태. 주소 원문은 돌려주지 않는다.
//   PUT  /api/feeds          {"etl": "https://…", "google": "", "apple": null}
//                            글 = 저장(바꾸기), "" 또는 null = 지우기, 칸이 없으면 그대로.
//                            붙이자마자 한 번 받아 보고 칸마다 결과를 돌려준다: results[] = {kind, ok, saved, tasks, events, error}
//                            모양이 틀리거나 이미 안 열리는 주소는 저장하지 않는다(saved: false).
//   POST /api/feeds/collect  내 주소를 지금 다시 받는다(멈춘 주소도 한 번 더 시도). 1분 안에 받은 주소는 건너뜀(recent: true).
//   Cron */15 * * * *        오래 안 받은 주소부터 FEEDS_PER_RUN개를 받는다.
//
// 주소 규칙(docs/tachyon/캘린더_주소_찾기.md '서버 규칙')
// - 다듬기: 앞뒤 공백, webcal:// → https://. 1단계에는 아는 모양만 받는다(서버가 아무 주소나 대신 받아 오지 않게):
//   eTL = https://myetl.snu.ac.kr/….ics, 구글 = https://calendar.google.com/calendar/ical/…/private-…/….ics,
//   애플 = https://p…-caldav.icloud.com/published/…
// - 화면에는 주소 끝 4자만(urlHint). 주소가 401·403·404·410이나 ICS가 아닌 글로 두 번 이어서 답하면
//   그 주소 수집을 멈추고 '다시 붙여 주세요'를 보인다(feeds.dead_count).
//
// 규칙
// - 같은 일정은 (user_id, source, ext_id)로 하나만. source = 주소 칸 이름(etl·google·apple),
//   ext_id = ICS의 UID, 반복 일정은 'UID#몇 번째'(UTC 시각 또는 날짜).
// - 기간은 지난 30일 ~ 앞으로 6개월(계획 1단계). 이 기간 안에서 주소에서 사라진 일정은 지운다. 기간 밖은 그대로 둔다.
// - 바뀐 줄만 쓴다(D1 무료 한도: 하루 쓰기 10만 줄): 거른 내용의 지문이 지난번과 같으면 건너뛰고,
//   다를 때도 값이 바뀐 줄만 고친다. 지문에 기간 첫날을 넣어 하루 한 번은 다시 펼친다(반복 일정 기간이 움직이므로).
// - 할 일의 done·minutes·ready, 일정의 important는 사용자·AI 값이라 덮어쓰지 않는다.
// - 주소는 APP_SECRET으로 잠가 feeds.url에만 둔다. 응답·로그·오류 문장에 주소를 넣지 않는다.
//
// 표(schema.sql): feeds(주소 한 칸 = 한 줄, url은 잠근 주소), events, tasks, log(ics_sync · ics_fail)

import { prefilter, expandCalendar, fingerprint, isAssignment, assertIcs, IcsError } from './lib/ics.js';
import { seal, unseal } from './lib/secret.js';
import { json, fail, readJson, UserError } from './lib/http.js';
import { kstIso, kstDate, kstMidnight, DAY_MS } from './lib/time.js';
import { logStatement } from './lib/log.js';

export const KINDS = ['etl', 'google', 'apple'];


const PAST_DAYS = 30;
const FUTURE_DAYS = 183;
const STALE_MS = 14 * 60 * 1000; // 15분 Cron이 매번 다시 받게
const STUCK_MS = 3 * 60 * 1000; // 시도 뒤 이만큼 지나도 결과가 없으면 '멈춤'
const DEAD_AFTER = 2; // 주소가 안 열린 답이 이만큼 이어지면 Cron이 그 주소를 멈춘다
const FETCH_TIMEOUT_MS = 15000;
const MAX_CHARS = 5_000_000;
const MANUAL_GAP_MS = 60 * 1000; // '지금 받기'를 거듭 눌러도 같은 주소는 1분에 한 번만(eTL·구글에 요청이 몰리지 않게)

// ── 길 나누기 ────────────────────────────────────────────────────

export async function handle(request, env, ctx, user) {
  if (!user) return fail(401, '로그인이 필요해요');
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === '/api/feeds' && method === 'GET') return json({ ok: true, feeds: await listFeeds(env, user.id) });
  if (pathname === '/api/feeds' && method === 'PUT') return saveFeeds(request, env, user.id);
  if (pathname === '/api/feeds/collect' && method === 'POST') {
    const results = await collectUser(env, user.id, { force: true, minGapMs: MANUAL_GAP_MS });
    return json({ ok: true, results, feeds: await listFeeds(env, user.id) });
  }
  if (pathname === '/api/feeds/device' && method === 'POST') return saveDeviceEvents(request, env, user.id);
  if (pathname === '/api/feeds' || pathname === '/api/feeds/collect') return fail(405, '그 방법으로는 안 받아요');
  return fail(404, '없는 주소예요');
}

export async function scheduled(event, env, ctx) {
  const summary = await collectDue(env);
  console.log('ICS 수집(Cron)', JSON.stringify(summary));
}

// ── 폰 캘린더(안드로이드 앱이 읽어 올림) ─────────────────────────
//
//   POST /api/feeds/device  {"events": [{ "id": "12", "title": "…", "start": 1794528000000, "end": …, "allDay": false, "place": "…" }]}
//   → { ok: true, count: 넣은 수, same: 다른 캘린더와 겹쳐 뺀 수 }
// 앱(web/src/native.js)이 열릴 때마다 폰 캘린더의 수집 기간 일정을 통째로 보낸다. source = 'device', ext_id = '<폰 일정 id>@<시작>'
// (되풀이 일정은 id가 같아서 시작을 붙인다). 보낸 목록에 없는 device 일정은 지운다(폰에서 지운 것).
// 주소로 이미 받는 캘린더(구글 등)와 이름·시작이 같은 것은 넣지 않는다(같은 일정이 두 번 보이지 않게).
// 지난번(6시간 안)과 똑같은 목록이면 DB에 다시 넣지 않고 지난 결과를 준다 — 앱을 열 때마다 오는데 대개 그대로라서.
// (11-12 무료 D1 하루 읽기 500만 줄을 넘긴 주범이 이 요청이었다: 색인 없이 한 번에 83만 줄 → 색인 뒤 6천 줄 → 같으면 수십 줄)
const DEVICE_MAX = 3000;
const DEVICE_SAME_MS = 6 * 60 * 60 * 1000;

async function saveDeviceEvents(request, env, userId, now = Date.now()) {
  const body = await readJson(request, 1024 * 1024);
  if (!body || !Array.isArray(body.events)) return fail(400, 'JSON 본문이 필요해요: {"events": [...]}');
  const { from, to } = syncWindow(now);
  const events = body.events
    .slice(0, DEVICE_MAX)
    .filter((e) => e && Number.isFinite(e.start) && e.start >= from.getTime() && e.start < to.getTime())
    .map((e) => {
      // 종일 일정: 안드로이드는 UTC 0시로 준다 → 날짜만
      const day = (ms) => new Date(ms).toISOString().slice(0, 10);
      const end = Number.isFinite(e.end) && e.end > e.start ? e.end : null;
      return {
        extId: `${String(e.id).slice(0, 80)}@${e.start}`,
        title: String(e.title || '(제목 없음)').slice(0, 200),
        start: e.allDay ? day(e.start) : kstIso(e.start),
        end: end ? (e.allDay ? day(end) : kstIso(end)) : null,
        place: e.place ? String(e.place).slice(0, 200) : null,
      };
    });
  const hash = (await fingerprint(JSON.stringify(events))).slice(0, 32);
  const last = await lastDeviceSync(env, userId, now);
  if (last && last.hash === hash && Number.isInteger(last.count)) {
    await logStatement(env, userId, 'device_sync', { sent: events.length, hash, count: last.count, skipped: true }).run();
    return json({ ok: true, count: last.count, same: events.length - last.count, unchanged: true });
  }
  const range = [kstIso(from.getTime()), kstIso(to.getTime())];
  const results = await env.DB.batch([
    ...eventStatements(env, userId, 'device', events, range, true, { skipTwins: true }),
    deviceTwinCleanup(env, userId),
    env.DB.prepare("SELECT count(*) AS n FROM events WHERE user_id = ? AND source = 'device' AND start >= ? AND start < ?").bind(userId, ...range),
  ]);
  const count = results.at(-1).results[0].n;
  await logStatement(env, userId, 'device_sync', { sent: events.length, hash, count }).run();
  return json({ ok: true, count, same: events.length - count });
}

/** 다른 칸(구글 등)에 이름·시작이 같은 일정이 있는 폰 일정을 지운다. 폰 캘린더를 받을 때와 주소 수집으로 일정이 바뀔 때. */
function deviceTwinCleanup(env, userId) {
  return env.DB.prepare(
    `DELETE FROM events WHERE user_id = ? AND source = 'device'
       AND EXISTS (SELECT 1 FROM events x WHERE x.user_id = events.user_id AND x.source != 'device' AND x.title = events.title AND x.start = events.start)`,
  ).bind(userId);
}

/** 이 사람의 마지막 폰 캘린더 받기(6시간 안) 기록 { hash, count } 또는 null. log_action_at 색인으로 그 시간의 device_sync 줄만 읽는다. */
async function lastDeviceSync(env, userId, now) {
  const row = await env.DB.prepare("SELECT detail FROM log WHERE action = 'device_sync' AND at >= ? AND user_id = ? ORDER BY at DESC, id DESC LIMIT 1")
    .bind(kstIso(now - DEVICE_SAME_MS), userId)
    .first();
  try {
    return row && row.detail ? JSON.parse(row.detail) : null;
  } catch {
    return null;
  }
}

// ── 기간 ─────────────────────────────────────────────────────────

/** 지난 30일 ~ 앞으로 6개월. 한국 0시에 맞춰 하루 동안은 같은 값이다. */
export function syncWindow(now = Date.now()) {
  const day = kstMidnight(now);
  return { from: new Date(day - PAST_DAYS * DAY_MS), to: new Date(day + FUTURE_DAYS * DAY_MS) };
}

// ── 주소 저장·목록 ───────────────────────────────────────────────

const SHAPES = {
  etl: {
    ok: (u) => u.host === 'myetl.snu.ac.kr' && u.pathname.endsWith('.ics'),
    help: "eTL '캘린더 피드' 주소(https://myetl.snu.ac.kr/로 시작하고 .ics로 끝남)를 넣어 주세요",
  },
  google: {
    ok: (u) => u.host === 'calendar.google.com' && u.pathname.startsWith('/calendar/ical/') && u.pathname.includes('/private-') && u.pathname.endsWith('.ics'),
    help: "구글 캘린더 설정의 'iCal 형식의 비공개 주소'를 넣어 주세요",
  },
  apple: {
    ok: (u) => /^p\d+-caldav\.icloud\.com$/.test(u.host) && u.pathname.startsWith('/published/'),
    help: "아이폰 캘린더의 '공개 캘린더' 링크(webcal://p…-caldav.icloud.com/published/…)를 넣어 주세요",
  },
};

/** 붙인 주소를 다듬고 칸에 맞는 모양인지 본다. webcal://은 https://로. 틀리면 UserError(화면에 그대로 보임). */
export function normalizeUrl(raw, kind) {
  let s = String(raw).trim();
  if (s.length > 2048) throw new UserError('주소가 너무 길어요');
  s = s.replace(/^webcals?:\/\//i, 'https://');
  let url;
  try {
    url = new URL(s);
  } catch {
    throw new UserError('주소 형식이 아니에요. 캘린더 설정에서 복사한 주소를 그대로 붙여 넣어 주세요');
  }
  if (url.protocol !== 'https:') throw new UserError('https 주소만 받아요');
  const shape = SHAPES[kind];
  if (shape && !shape.ok(url)) {
    if (kind === 'google' && url.pathname.includes('/public/')) throw new UserError("공개 주소가 아니라 'iCal 형식의 비공개 주소'를 넣어 주세요");
    throw new UserError(shape.help);
  }
  return url.toString();
}

/** 화면에 보여 줄 주소 힌트: 'myetl.snu.ac.kr/…a1b2' (주소 전체는 비밀이라 끝 4자만) */
export function urlHint(url) {
  try {
    const u = new URL(url);
    const tail = u.pathname.replace(/\.ics$/, '').replace(/\/basic$/, '').replace(/\W/g, '').slice(-4);
    return `${u.host}/…${tail}`;
  } catch {
    return '?';
  }
}

export async function listFeeds(env, userId, now = Date.now()) {
  const { results } = await env.DB.prepare('SELECT * FROM feeds WHERE user_id = ?').bind(userId).all();
  const byKind = new Map(results.map((row) => [row.kind, row]));
  const out = [];
  for (const kind of KINDS) {
    const row = byKind.get(kind);
    if (!row) {
      out.push({ kind, set: false });
      continue;
    }
    let hint;
    try {
      hint = urlHint(await unseal(env, row.url));
    } catch {
      hint = '(다시 넣어 주세요)';
    }
    const waiting = row.last_try_at && (!row.last_ok_at || row.last_try_at > row.last_ok_at) && !row.last_error;
    const stuck = waiting && now - Date.parse(row.last_try_at) > STUCK_MS;
    const stopped = (row.dead_count || 0) >= DEAD_AFTER;
    out.push({
      kind,
      set: true,
      hint,
      count: row.item_count ?? null,
      okAt: row.last_ok_at || null,
      triedAt: row.last_try_at || null,
      stopped, // true면 '이 주소가 더 이상 열리지 않아요 → 다시 붙이기'
      error: stopped
        ? '이 캘린더 주소가 더 이상 열리지 않아요. 캘린더에서 주소를 다시 복사해 붙여 주세요'
        : row.last_error || (stuck ? '받다가 멈췄어요(처리 시간 한도일 수 있어요)' : null),
    });
  }
  return out;
}

async function saveFeeds(request, env, userId, now = Date.now()) {
  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'JSON 본문이 필요해요: {"etl": "주소"}');
  const kinds = KINDS.filter((kind) => kind in body);
  if (!kinds.length) return fail(400, 'etl·google·apple 가운데 한 칸 이상 보내 주세요');

  const results = [];
  for (const kind of kinds) {
    const raw = body[kind];
    if (raw === null || raw === '') {
      await env.DB.batch(removeFeedStatements(env, userId, kind));
      results.push({ kind, ok: true, saved: false, removed: true });
      continue;
    }
    results.push(await addFeed(env, userId, kind, raw, now));
  }
  return json({ ok: true, results, feeds: await listFeeds(env, userId, now) });
}

/** 주소 한 칸: 모양 확인 → 한 번 받아 보기 → (이미 죽은 주소가 아니면) 잠가서 저장 → 받은 글로 바로 반영 */
async function addFeed(env, userId, kind, raw, now) {
  let url;
  let text = null;
  let transient = null;
  try {
    if (typeof raw !== 'string') throw new UserError('주소를 글로 넣어 주세요');
    url = normalizeUrl(raw, kind);
    text = await fetchIcs(url);
    assertIcs(text); // BEGIN:VCALENDAR가 없으면 IcsError
  } catch (err) {
    if (err instanceof UserError || (err instanceof FeedError && err.permanent) || err instanceof IcsError) {
      return { kind, ok: false, saved: false, error: err.message };
    }
    if (!(err instanceof FeedError)) throw err;
    transient = err.message; // 잠깐의 오류(시간 초과·5xx)면 저장해 두고 Cron이 다시 받는다
  }

  await env.DB.prepare(
    `INSERT INTO feeds (user_id, kind, url) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id, kind) DO UPDATE SET
       url = excluded.url, last_hash = NULL, last_try_at = NULL, last_ok_at = NULL, last_error = NULL, item_count = NULL, dead_count = 0`,
  )
    .bind(userId, kind, await seal(env, url))
    .run();
  const feed = await env.DB.prepare('SELECT * FROM feeds WHERE user_id = ? AND kind = ?').bind(userId, kind).first();
  if (transient) {
    await env.DB.prepare('UPDATE feeds SET last_try_at = ?, last_error = ? WHERE id = ?').bind(kstIso(now), transient, feed.id).run();
    return { kind, ok: false, saved: true, error: `${transient} — 저장해 두고 15분 뒤에 다시 받아요` };
  }
  await env.DB.prepare('UPDATE feeds SET last_try_at = ? WHERE id = ?').bind(kstIso(now), feed.id).run();
  return { ...(await syncFeed(env, feed, { force: true, now, text })), saved: true };
}

function removeFeedStatements(env, userId, kind) {
  const list = [
    env.DB.prepare('DELETE FROM feeds WHERE user_id = ? AND kind = ?').bind(userId, kind),
    env.DB.prepare("DELETE FROM events WHERE user_id = ? AND source = ? AND ext_id NOT LIKE 'api-%'").bind(userId, kind), // eTL API 일정은 9_etl.js가 맡음
  ];
  if (kind === 'etl') list.push(env.DB.prepare('DELETE FROM tasks WHERE user_id = ? AND source = ?').bind(userId, kind));
  return list;
}

// ── 받기 ─────────────────────────────────────────────────────────

/** 한 사용자의 주소를 받는다(지금 받기). minGapMs 안에 이미 시도한 주소는 건너뛴다. */
export async function collectUser(env, userId, { force = false, kinds = KINDS, now = Date.now(), minGapMs = 0 } = {}) {
  const { results } = await env.DB.prepare('SELECT * FROM feeds WHERE user_id = ?').bind(userId).all();
  const out = [];
  for (const feed of results.filter((row) => kinds.includes(row.kind))) {
    if (minGapMs > 0 && feed.last_try_at && feed.last_try_at > kstIso(now - minGapMs)) {
      out.push({ kind: feed.kind, ok: true, same: true, recent: true });
      continue;
    }
    await env.DB.prepare('UPDATE feeds SET last_try_at = ? WHERE id = ?').bind(kstIso(now), feed.id).run();
    out.push(await syncFeed(env, feed, { force, now }));
  }
  return out;
}

/**
 * Cron: 오래 안 받은 주소부터 받는다. 받기 전에 시도 시각을 먼저 적어 두어,
 * 한 주소에서 멈춰도(처리 시간 한도 등) 다음 차례에는 다른 주소가 먼저 받힌다.
 */
export async function collectDue(env, now = Date.now()) {
  const limit = Math.max(1, Math.min(40, Number(env.FEEDS_PER_RUN) || 20));
  let results;
  try {
    ({ results } = await env.DB.prepare(
      'SELECT * FROM feeds WHERE dead_count < ? AND (last_try_at IS NULL OR last_try_at < ?) ORDER BY last_try_at LIMIT ?',
    )
      .bind(DEAD_AFTER, kstIso(now - STALE_MS), limit)
      .all());
  } catch (err) {
    if (/no such table/i.test(String(err && err.message))) return { feeds: 0, note: 'feeds 표가 아직 없음' };
    throw err;
  }
  if (!results.length) return { feeds: 0 };
  await env.DB.prepare('UPDATE feeds SET last_try_at = ?1 WHERE id IN (SELECT value FROM json_each(?2))')
    .bind(kstIso(now), JSON.stringify(results.map((f) => f.id)))
    .run();

  // 작은 캘린더부터(지난번 개수 순, 모르면 맨 뒤). 무료 요금제(CPU 10ms)에서 큰 캘린더가 한도에 걸려
  // 이번 차례가 끊겨도 그 앞의 작은 캘린더는 받히고, 끊긴 큰 캘린더 때문에 다른 주소가 계속 밀리지 않는다.
  results.sort((a, b) => (a.item_count ?? Infinity) - (b.item_count ?? Infinity) || a.id - b.id);
  const summary = { feeds: results.length, changed: 0, same: 0, failed: 0 };
  for (const feed of results) {
    const r = await syncFeed(env, feed, { now });
    if (!r.ok) summary.failed++;
    else if (r.same) summary.same++;
    else summary.changed++;
  }
  return summary;
}

/**
 * 주소 하나를 받아 DB에 반영한다. 오류는 feeds.last_error와 log에 남기고 결과로 돌려준다(던지지 않음).
 * text를 주면(방금 받아 본 글) 다시 받지 않는다.
 */
export async function syncFeed(env, feed, { force = false, now = Date.now(), text: given = null } = {}) {
  const { user_id: userId, kind } = feed;
  try {
    let text = given;
    if (text == null) {
      const url = await unseal(env, feed.url).catch(() => {
        throw new FeedError('저장된 주소를 열 수 없어요. 주소를 다시 넣어 주세요', true);
      });
      text = await fetchIcs(url);
    }
    const window = syncWindow(now);
    const pre = prefilter(text, window.from.getTime(), window.to.getTime());
    const hash = await fingerprint(`${kstDate(window.from.getTime())}\n${pre.calendar}`);
    if (!force && hash === feed.last_hash) {
      await env.DB.prepare('UPDATE feeds SET last_ok_at = ?, last_error = NULL, dead_count = 0 WHERE id = ?').bind(kstIso(now), feed.id).run();
      return { kind, ok: true, same: true, count: feed.item_count ?? null };
    }

    const { items } = expandCalendar(pre, window);
    const { tasks, events } = splitItems(kind, items);
    const range = [kstDate(window.from.getTime()), kstDate(window.to.getTime())];
    // 일정이 하나도 없는 캘린더는 잠깐의 오류일 수 있어 지우지 않는다.
    const allowDelete = pre.blocks > 0;

    const statements = [];
    if (kind === 'etl') statements.push(...taskStatements(env, userId, kind, tasks, range, allowDelete, kstIso(now)));
    statements.push(...eventStatements(env, userId, kind, events, range, allowDelete));
    statements.push(deviceTwinCleanup(env, userId)); // 새로 온 일정과 겹치게 된 폰 일정(폰 쪽은 같은 목록이면 다시 안 넣음)
    statements.push(
      env.DB.prepare('UPDATE feeds SET last_hash = ?, last_ok_at = ?, last_error = NULL, item_count = ?, dead_count = 0 WHERE id = ?').bind(
        hash,
        kstIso(now),
        items.length,
        feed.id,
      ),
    );
    const res = await env.DB.batch(statements);
    const changes = res.slice(0, -1).reduce((sum, r) => sum + ((r.meta && r.meta.changes) || 0), 0);
    if (changes > 0) await env.DB.batch([logStatement(env, userId, 'ics_sync', { kind, tasks: tasks.length, events: events.length, changes })]);

    return { kind, ok: true, same: false, tasks: tasks.length, events: events.length, count: items.length, changes };
  } catch (err) {
    const known = err instanceof FeedError || err instanceof IcsError;
    const message = known ? err.message : '처리하다 오류가 났어요';
    const dead = err instanceof IcsError || (err instanceof FeedError && err.permanent); // 주소가 안 열림(저절로 안 돌아옴)
    if (!known) console.error('ICS 처리 오류', kind, err && err.stack);
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE feeds SET last_error = ?, dead_count = dead_count + ? WHERE id = ?').bind(message, dead ? 1 : 0, feed.id),
        logStatement(env, userId, 'ics_fail', { kind, error: message }),
      ]);
    } catch (dbErr) {
      console.error('ICS 실패 기록도 실패', dbErr && dbErr.message);
    }
    return { kind, ok: false, error: message };
  }
}

/** 주소 받기 실패. permanent = 주소가 죽음(401·403·404·410, 저장된 주소를 못 엶) → 다시 붙여야 함 */
class FeedError extends Error {
  constructor(message, permanent = false) {
    super(message);
    this.permanent = permanent;
  }
}

/** 주소를 받는다. 오류 문장에 주소를 넣지 않는다. */
export async function fetchIcs(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5', 'user-agent': 'Tachyon-calendar-sync/0.1' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw new FeedError(`${FETCH_TIMEOUT_MS / 1000}초 안에 응답이 없어요`);
    throw new FeedError('주소에 연결하지 못했어요');
  }
  if (!res.ok) {
    const dead = [401, 403, 404, 410].includes(res.status);
    const hint = dead ? ' — 주소가 바뀌었거나 공개를 껐어요. 캘린더에서 주소를 다시 복사해 주세요' : '';
    throw new FeedError(`주소가 오류로 답했어요(HTTP ${res.status})${hint}`, dead);
  }
  const text = await res.text();
  if (text.length > MAX_CHARS) throw new FeedError('캘린더가 너무 커요(5MB 넘음)');
  return text;
}

// ── DB에 쓰기 ────────────────────────────────────────────────────

/** eTL 주소의 과제는 할 일로, 나머지는 일정으로. 하루 종일 과제(eTL은 23:59 마감을 이렇게 준다)는 그날 23:59. */
export function splitItems(kind, items) {
  if (kind !== 'etl') return { tasks: [], events: items };
  const tasks = [];
  const events = [];
  for (const it of items) {
    if (!isAssignment(it.uid)) events.push(it);
    else tasks.push({ extId: it.extId, title: it.title, due: it.allDay ? `${it.start}T23:59:00+09:00` : it.start });
  }
  return { tasks, events };
}

// skipTwins: 다른 source에 이름·시작이 같은 일정이 있으면 넣지 않는다(폰 캘린더). 넣었다가 지우면 보낼 때마다
// 겹치는 일정 수 × 2번 쓰기가 되어(무료 D1 하루 10만 줄) 처음부터 뺀다.
function eventStatements(env, userId, source, events, [from, to], allowDelete, { skipTwins = false } = {}) {
  const rows = events.map((e) => ({ extId: e.extId, title: e.title, start: e.start, end: e.end, place: e.place }));
  const list = [];
  if (rows.length) {
    const twin = skipTwins
      ? `AND NOT EXISTS (SELECT 1 FROM events x WHERE x.user_id = ?1 AND x.source != ?2
           AND x.title = j.value ->> 'title' AND x.start = j.value ->> 'start')`
      : '';
    list.push(
      env.DB.prepare(
        `INSERT INTO events (user_id, title, start, "end", place, source, ext_id)
         SELECT ?1, j.value ->> 'title', j.value ->> 'start', j.value ->> 'end', j.value ->> 'place', ?2, j.value ->> 'extId'
         FROM json_each(?3) AS j WHERE true ${twin}
         ON CONFLICT (user_id, source, ext_id) DO UPDATE SET
           title = excluded.title, start = excluded.start, "end" = excluded."end", place = excluded.place
         WHERE events.title IS NOT excluded.title OR events.start IS NOT excluded.start
            OR events."end" IS NOT excluded."end" OR events.place IS NOT excluded.place`,
      ).bind(userId, source, JSON.stringify(rows)),
    );
  }
  if (allowDelete) {
    list.push(
      env.DB.prepare(
        `DELETE FROM events WHERE user_id = ?1 AND source = ?2 AND start >= ?3 AND start < ?4
           AND ext_id NOT IN (SELECT value FROM json_each(?5)) AND ext_id NOT LIKE 'api-%'`, // 'api-…'는 eTL API(9_etl.js)가 넣은 과목 일정
      ).bind(userId, source, from, to, JSON.stringify(rows.map((r) => r.extId))),
    );
  }
  return list;
}

// 처음 들어오는 과제 가운데 받는 순간 이미 마감이 지난 것은 끝낸 것으로 넣는다(nowIso가 있을 때). ICS에는 제출 여부가 없어서,
// eTL 주소를 처음 붙인 날 지난 30일 과제가 모두 '마감 지남'으로 할 일 맨 위를 차지했다(AI 세션 11-11 19:44 쪽지).
// 있는 줄의 done은 건드리지 않는다. eTL 토큰(9_etl)을 연결한 사람은 제출 여부를 API가 넣으니 그대로 0으로 넣는다.
function taskStatements(env, userId, source, tasks, [from, to], allowDelete, nowIso = null) {
  const list = [];
  if (tasks.length) {
    list.push(
      env.DB.prepare(
        `INSERT INTO tasks (user_id, title, due, source, ext_id, done)
         SELECT ?1, j.value ->> 'title', j.value ->> 'due', ?2, j.value ->> 'extId',
                CASE WHEN ?4 IS NOT NULL AND j.value ->> 'due' < ?4 AND NOT EXISTS (SELECT 1 FROM etl WHERE etl.user_id = ?1) THEN 1 ELSE 0 END
         FROM json_each(?3) AS j WHERE true
         ON CONFLICT (user_id, source, ext_id) DO UPDATE SET title = excluded.title, due = excluded.due
         WHERE tasks.title IS NOT excluded.title OR tasks.due IS NOT excluded.due`,
      ).bind(userId, source, JSON.stringify(tasks), nowIso),
    );
  }
  if (allowDelete) {
    list.push(
      env.DB.prepare(
        `DELETE FROM tasks WHERE user_id = ?1 AND source = ?2 AND due >= ?3 AND due < ?4
           AND ext_id NOT IN (SELECT value FROM json_each(?5))`,
      ).bind(userId, source, from, to, JSON.stringify(tasks.map((t) => t.extId))),
    );
  }
  return list;
}
