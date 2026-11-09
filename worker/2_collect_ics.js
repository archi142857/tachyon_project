// 2. ICS 수집 (담당: 서버 세션)
//
// eTL·구글·애플 캘린더 주소(ICS)를 받아 eTL 과제는 tasks, 나머지는 events에 넣는다.
//
//   GET  /api/feeds          내 주소 세 칸(etl·google·apple)의 상태. 주소 원문은 돌려주지 않는다.
//   PUT  /api/feeds          {"etl": "https://…", "google": "", "apple": null}
//                            글 = 저장(바꾸기), "" 또는 null = 지우기, 칸이 없으면 그대로. 저장한 칸은 바로 한 번 받는다.
//   POST /api/feeds/collect  내 주소를 지금 다시 받는다.
//   Cron */15 * * * *        오래 안 받은 주소부터 FEEDS_PER_RUN개를 받는다.
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
// 표: feeds(아래 FEEDS_SQL, schema.sql에 넣어 달라고 소통판에 요청함), events, tasks, log(ics_sync · ics_fail)

import { prefilter, expandCalendar, fingerprint, isAssignment, IcsError } from './lib/ics.js';
import { seal, unseal } from './lib/secret.js';
import { json, fail, readJson, UserError } from './lib/http.js';
import { kstIso, kstDate, kstMidnight, DAY_MS } from './lib/time.js';
import { logStatement } from './lib/log.js';

export const KINDS = ['etl', 'google', 'apple'];

export const FEEDS_SQL = `CREATE TABLE IF NOT EXISTS feeds (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,      -- etl · google · apple (= events/tasks의 source)
  url         TEXT NOT NULL,      -- 잠근 주소(APP_SECRET). 원문은 어디에도 안 둔다
  last_hash   TEXT,               -- 마지막으로 반영한 내용의 지문
  last_try_at TEXT,               -- 마지막 시도
  last_ok_at  TEXT,               -- 마지막 성공
  last_error  TEXT,               -- 마지막 실패 이유(성공하면 NULL)
  item_count  INTEGER,            -- 마지막 반영 때 일정·할 일 수
  UNIQUE (user_id, kind)
)`;

const PAST_DAYS = 30;
const FUTURE_DAYS = 183;
const STALE_MS = 14 * 60 * 1000; // 15분 Cron이 매번 다시 받게
const STUCK_MS = 3 * 60 * 1000; // 시도 뒤 이만큼 지나도 결과가 없으면 '멈춤'
const FETCH_TIMEOUT_MS = 15000;
const MAX_CHARS = 5_000_000;

// ── 길 나누기 ────────────────────────────────────────────────────

export async function handle(request, env, ctx, user) {
  if (!user) return fail(401, '로그인이 필요해요');
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === '/api/feeds' && method === 'GET') return json({ ok: true, feeds: await listFeeds(env, user.id) });
  if (pathname === '/api/feeds' && method === 'PUT') return saveFeeds(request, env, user.id);
  if (pathname === '/api/feeds/collect' && method === 'POST') {
    const results = await collectUser(env, user.id, { force: true });
    return json({ ok: true, results, feeds: await listFeeds(env, user.id) });
  }
  return fail(404, '없는 주소예요');
}

export async function scheduled(event, env, ctx) {
  const summary = await collectDue(env);
  console.log('ICS 수집(Cron)', JSON.stringify(summary));
}

// ── 기간 ─────────────────────────────────────────────────────────

/** 지난 30일 ~ 앞으로 6개월. 한국 0시에 맞춰 하루 동안은 같은 값이다. */
export function syncWindow(now = Date.now()) {
  const day = kstMidnight(now);
  return { from: new Date(day - PAST_DAYS * DAY_MS), to: new Date(day + FUTURE_DAYS * DAY_MS) };
}

// ── 주소 저장·목록 ───────────────────────────────────────────────

/** 사용자가 붙인 주소를 https 주소로 고친다. webcal:// (애플)은 https://로 바꾼다. */
export function normalizeUrl(raw) {
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
  return url.toString();
}

/** 화면에 보여 줄 주소 힌트: 'calendar.google.com/…a1b2' (주소 전체는 비밀) */
export function urlHint(url) {
  try {
    const u = new URL(url);
    const tail = (u.pathname + u.search).replace(/\W/g, '').slice(-4);
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
    out.push({
      kind,
      set: true,
      hint,
      count: row.item_count ?? null,
      okAt: row.last_ok_at || null,
      triedAt: row.last_try_at || null,
      error: row.last_error || (stuck ? '받다가 멈췄어요(처리 시간 한도일 수 있어요)' : null),
    });
  }
  return out;
}

async function saveFeeds(request, env, userId) {
  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'JSON 본문이 필요해요: {"etl": "주소"}');

  const changed = [];
  const statements = [];
  try {
    for (const kind of KINDS) {
      if (!(kind in body)) continue;
      const raw = body[kind];
      if (raw === null || raw === '') {
        statements.push(...removeFeedStatements(env, userId, kind));
        continue;
      }
      if (typeof raw !== 'string') throw new UserError(`${kind} 칸에는 주소 글을 넣어 주세요`);
      const sealed = await seal(env, normalizeUrl(raw));
      statements.push(
        env.DB.prepare(
          `INSERT INTO feeds (user_id, kind, url) VALUES (?1, ?2, ?3)
           ON CONFLICT (user_id, kind) DO UPDATE SET
             url = excluded.url, last_hash = NULL, last_try_at = NULL, last_ok_at = NULL, last_error = NULL, item_count = NULL`,
        ).bind(userId, kind, sealed),
      );
      changed.push(kind);
    }
  } catch (err) {
    if (err instanceof UserError) return fail(400, err.message);
    throw err;
  }
  if (!statements.length) return fail(400, 'etl·google·apple 가운데 한 칸 이상 보내 주세요');
  await env.DB.batch(statements);

  const results = changed.length ? await collectUser(env, userId, { force: true, kinds: changed }) : [];
  return json({ ok: true, results, feeds: await listFeeds(env, userId) });
}

function removeFeedStatements(env, userId, kind) {
  const list = [
    env.DB.prepare('DELETE FROM feeds WHERE user_id = ? AND kind = ?').bind(userId, kind),
    env.DB.prepare('DELETE FROM events WHERE user_id = ? AND source = ?').bind(userId, kind),
  ];
  if (kind === 'etl') list.push(env.DB.prepare('DELETE FROM tasks WHERE user_id = ? AND source = ?').bind(userId, kind));
  return list;
}

// ── 받기 ─────────────────────────────────────────────────────────

/** 한 사용자의 주소를 받는다(지금 받기·저장 직후). */
export async function collectUser(env, userId, { force = false, kinds = KINDS, now = Date.now() } = {}) {
  const { results } = await env.DB.prepare('SELECT * FROM feeds WHERE user_id = ?').bind(userId).all();
  const out = [];
  for (const feed of results.filter((row) => kinds.includes(row.kind))) {
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
    ({ results } = await env.DB.prepare('SELECT * FROM feeds WHERE last_try_at IS NULL OR last_try_at < ? ORDER BY last_try_at LIMIT ?')
      .bind(kstIso(now - STALE_MS), limit)
      .all());
  } catch (err) {
    if (/no such table/i.test(String(err && err.message))) return { feeds: 0, note: 'feeds 표가 아직 없음' };
    throw err;
  }
  if (!results.length) return { feeds: 0 };
  await env.DB.prepare('UPDATE feeds SET last_try_at = ?1 WHERE id IN (SELECT value FROM json_each(?2))')
    .bind(kstIso(now), JSON.stringify(results.map((f) => f.id)))
    .run();

  const summary = { feeds: results.length, changed: 0, same: 0, failed: 0 };
  for (const feed of results) {
    const r = await syncFeed(env, feed, { now });
    if (!r.ok) summary.failed++;
    else if (r.same) summary.same++;
    else summary.changed++;
  }
  return summary;
}

/** 주소 하나를 받아 DB에 반영한다. 오류는 feeds.last_error와 log에 남기고 결과로 돌려준다(던지지 않음). */
export async function syncFeed(env, feed, { force = false, now = Date.now() } = {}) {
  const { user_id: userId, kind } = feed;
  try {
    const url = await unseal(env, feed.url).catch(() => {
      throw new FeedError('저장된 주소를 열 수 없어요. 주소를 다시 넣어 주세요');
    });
    const text = await fetchIcs(url);
    const window = syncWindow(now);
    const pre = prefilter(text, window.from.getTime(), window.to.getTime());
    const hash = await fingerprint(`${kstDate(window.from.getTime())}\n${pre.calendar}`);
    if (!force && hash === feed.last_hash) {
      await env.DB.prepare('UPDATE feeds SET last_ok_at = ?, last_error = NULL WHERE id = ?').bind(kstIso(now), feed.id).run();
      return { kind, ok: true, same: true, count: feed.item_count ?? null };
    }

    const { items } = expandCalendar(pre, window);
    const { tasks, events } = splitItems(kind, items);
    const range = [kstDate(window.from.getTime()), kstDate(window.to.getTime())];
    // 일정이 하나도 없는 캘린더는 잠깐의 오류일 수 있어 지우지 않는다.
    const allowDelete = pre.blocks > 0;

    const statements = [];
    if (kind === 'etl') statements.push(...taskStatements(env, userId, kind, tasks, range, allowDelete));
    statements.push(...eventStatements(env, userId, kind, events, range, allowDelete));
    statements.push(
      env.DB.prepare('UPDATE feeds SET last_hash = ?, last_ok_at = ?, last_error = NULL, item_count = ? WHERE id = ?').bind(
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
    if (!known) console.error('ICS 처리 오류', kind, err && err.stack);
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE feeds SET last_error = ? WHERE id = ?').bind(message, feed.id),
        logStatement(env, userId, 'ics_fail', { kind, error: message }),
      ]);
    } catch (dbErr) {
      console.error('ICS 실패 기록도 실패', dbErr && dbErr.message);
    }
    return { kind, ok: false, error: message };
  }
}

class FeedError extends Error {}

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
    const hint = res.status === 401 || res.status === 403 ? ' — 주소가 바뀌었거나 권한이 없어요' : res.status === 404 ? ' — 주소를 다시 확인해 주세요' : '';
    throw new FeedError(`주소가 오류로 답했어요(HTTP ${res.status})${hint}`);
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

function eventStatements(env, userId, source, events, [from, to], allowDelete) {
  const rows = events.map((e) => ({ extId: e.extId, title: e.title, start: e.start, end: e.end, place: e.place }));
  const list = [];
  if (rows.length) {
    list.push(
      env.DB.prepare(
        `INSERT INTO events (user_id, title, start, "end", place, source, ext_id)
         SELECT ?1, j.value ->> 'title', j.value ->> 'start', j.value ->> 'end', j.value ->> 'place', ?2, j.value ->> 'extId'
         FROM json_each(?3) AS j WHERE true
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
           AND ext_id NOT IN (SELECT value FROM json_each(?5))`,
      ).bind(userId, source, from, to, JSON.stringify(rows.map((r) => r.extId))),
    );
  }
  return list;
}

function taskStatements(env, userId, source, tasks, [from, to], allowDelete) {
  const list = [];
  if (tasks.length) {
    list.push(
      env.DB.prepare(
        `INSERT INTO tasks (user_id, title, due, source, ext_id)
         SELECT ?1, j.value ->> 'title', j.value ->> 'due', ?2, j.value ->> 'extId'
         FROM json_each(?3) AS j WHERE true
         ON CONFLICT (user_id, source, ext_id) DO UPDATE SET title = excluded.title, due = excluded.due
         WHERE tasks.title IS NOT excluded.title OR tasks.due IS NOT excluded.due`,
      ).bind(userId, source, JSON.stringify(tasks)),
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
