// 11. 개발자 보기: 사용자 활동 합계 (담당: 서버 세션)
//
// 사람 요청 11-13 01:03 "유저들 활동 기록을 수집해서 개발자들이 볼 수 있는 화면"(컨셉 쪽지 261113-0104). 화면은 Frontend.
//   GET /api/admin/summary?days=14   (1~30일, 오늘 포함) → 합계만. 개발자가 아니면(로그인 안 함 포함) 404로 숨긴다.
// 개발자 = 런타임 비밀값 ADMIN_EMAILS(쉼표로 이은 이메일, 대소문자 무시)에 든 로그인 이메일. 값이 없으면 아무도 못 본다.
//   값은 계정 주인이 Cloudflare 비밀값으로만 넣는다(저장소·소통판·쪽지에 쓰지 않음).
// 보내지 않는 것: 메모 글·일정 이름·이메일·이름·사람 번호. 사람 수는 날마다 합계로만(개인정보처리방침 초안 '사용 기록').
// 읽기: log는 log_action_at (action, at) 색인으로 기간 줄만 읽는다 — 행동 이름은 색인을 건너뛰며 모으고(이름 수만큼 몇 줄),
//   그 이름마다 기간을 찾는다. 쓰기는 없다(무료 하루 쓰기 한도). 공모전 신청서 사용 수치도 이 주소로 뽑는다.

import { json, fail } from './lib/http.js';
import { kstDate, DAY_MS } from './lib/time.js';

const MAX_DAYS = 30;
// 사람이 하지 않은 줄(Cron·밤 정리·AI 호출·오류 보고): '쓴 사람' 셈에서 뺀다
const SYSTEM_ACTIONS = new Set(['ics_sync', 'ics_fail', 'etl_sync', 'etl_fail', 'night_run', 'night_fail', 'llm', 'llm_fail', 'error_report']);
// 백만 토큰당 달러(입력, 출력). Claude 문서 11-13: Haiku 5.5 $0.10 / $0.50(프롬프트 10만 토큰 아래), Sonnet 5.5 $2 / $10
const PRICES = [
  [/haiku/i, 0.1, 0.5],
  [/sonnet/i, 2, 10],
];

export async function handle(request, env, ctx, user) {
  const url = new URL(request.url);
  if (!isAdmin(env, user)) return fail(404, '없는 주소예요');
  if (url.pathname.replace(/\/+$/, '') !== '/api/admin/summary') return fail(404, '없는 주소예요');
  if (request.method !== 'GET') return fail(405, '그 방법으로는 안 받아요');
  const raw = url.searchParams.get('days');
  const days = raw === null ? 14 : Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return fail(400, `days는 1~${MAX_DAYS}일이에요`);
  const res = json(await summary(env, days));
  res.headers.set('cache-control', 'private, no-store');
  return res;
}

/** ADMIN_EMAILS에 든 이메일로 로그인한 사람인지 */
export function isAdmin(env, user) {
  if (!user || !user.email || !env.ADMIN_EMAILS) return false;
  const list = String(env.ADMIN_EMAILS)
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(user.email).toLowerCase());
}

// 행동 이름을 색인에서 건너뛰며 모은다(SQLite에 '건너뛰기 찾기'를 직접 시킴): 이름마다 한 번씩만 찾는다
const ACTIONS = `WITH RECURSIVE acts(a) AS (
    SELECT MIN(action) FROM log
    UNION ALL
    SELECT (SELECT MIN(action) FROM log WHERE action > acts.a) FROM acts WHERE acts.a IS NOT NULL
  )`;
const IN_PERIOD = `action IN (SELECT a FROM acts WHERE a IS NOT NULL) AND at >= ?1`;

export async function summary(env, days, now = Date.now()) {
  const from = kstDate(now - (days - 1) * DAY_MS);
  const to = kstDate(now);
  const results = await env.DB.batch([
    // 날 × 행동 × 사람마다 몇 번(사람 번호는 셈에만 쓰고 내보내지 않는다)
    env.DB.prepare(`${ACTIONS} SELECT action, substr(at, 1, 10) AS day, user_id, count(*) AS n FROM log WHERE ${IN_PERIOD} GROUP BY 1, 2, 3`).bind(from),
    env.DB.prepare(
      `SELECT json_extract(detail, '$.model') AS model, json_extract(detail, '$.use') AS use, count(*) AS n,
              avg(json_extract(detail, '$.ms')) AS ms, sum(json_extract(detail, '$.in')) AS input, sum(json_extract(detail, '$.out')) AS output
         FROM log WHERE action = 'llm' AND at >= ? AND json_valid(detail) GROUP BY 1, 2`,
    ).bind(from),
    env.DB.prepare(`SELECT json_extract(detail, '$.use') AS use, count(*) AS n FROM log WHERE action = 'llm_fail' AND at >= ? AND json_valid(detail) GROUP BY 1`).bind(from),
    env.DB.prepare('SELECT substr(created_at, 1, 10) AS day, count(*) AS n FROM users WHERE created_at >= ? GROUP BY 1').bind(from),
    env.DB.prepare('SELECT substr(created_at, 1, 10) AS day, count(*) AS n FROM memos WHERE created_at >= ? GROUP BY 1').bind(from),
    // 표 크기: log는 번호 끝(지운 줄도 셈, 대략) — count(*)는 log 전체를 훑어서
    env.DB.prepare(
      `SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM tasks) AS tasks,
              (SELECT count(*) FROM memos) AS memos, (SELECT max(id) FROM log) AS log_about`,
    ),
  ]);
  const [rows, llm, llmFail, newUsers, memos, sizes] = results.map((r) => r.results);
  const read = results.reduce((sum, r) => sum + ((r.meta && r.meta.rows_read) || 0), 0);

  const dayList = [];
  for (let ms = Date.parse(`${from}T00:00:00+09:00`); kstDate(ms) <= to; ms += DAY_MS) dayList.push(kstDate(ms));
  const byDay = new Map(dayList.map((d) => [d, { day: d, users: new Set(), actions: 0, newUsers: 0, memos: 0 }]));
  const byAction = new Map();
  for (const r of rows) {
    const d = byDay.get(r.day);
    if (!d) continue;
    d.actions += r.n;
    if (r.user_id != null && !SYSTEM_ACTIONS.has(r.action)) d.users.add(r.user_id);
    const a = byAction.get(r.action) || { action: r.action, total: 0, days: {} };
    a.total += r.n;
    a.days[r.day] = (a.days[r.day] || 0) + r.n;
    byAction.set(r.action, a);
  }
  for (const r of newUsers) if (byDay.has(r.day)) byDay.get(r.day).newUsers = r.n;
  for (const r of memos) if (byDay.has(r.day)) byDay.get(r.day).memos = r.n;
  const total = (action) => (byAction.get(action) || { total: 0 }).total;
  const everyone = new Set();
  for (const d of byDay.values()) for (const id of d.users) everyone.add(id);

  const ai = llm.map((r) => {
    const price = PRICES.find(([re]) => re.test(r.model || ''));
    const cost = price ? ((r.input || 0) * price[1] + (r.output || 0) * price[2]) / 1e6 : null;
    return { model: r.model || '?', use: r.use || '?', calls: r.n, avgMs: r.ms == null ? null : Math.round(r.ms), input: r.input || 0, output: r.output || 0, costUsd: cost };
  });
  const known = ai.filter((x) => x.costUsd != null);

  return {
    ok: true,
    from,
    to,
    days,
    activeUsers: everyone.size, // 기간 안에 무엇이든 한 사람 수(Cron·AI 줄 빼고)
    daily: [...byDay.values()].map((d) => ({ day: d.day, users: d.users.size, newUsers: d.newUsers, memos: d.memos, actions: d.actions })),
    actions: [...byAction.values()].sort((a, b) => b.total - a.total),
    popup: { memos: memos.reduce((s, r) => s + r.n, 0), saved: total('popup_save'), edited: total('popup_edit'), cancelled: total('popup_cancel') },
    ai: {
      calls: ai.reduce((s, x) => s + x.calls, 0),
      failures: llmFail.reduce((s, r) => s + r.n, 0),
      failuresByUse: Object.fromEntries(llmFail.map((r) => [r.use || '?', r.n])),
      input: ai.reduce((s, x) => s + x.input, 0),
      output: ai.reduce((s, x) => s + x.output, 0),
      costUsd: Math.round(known.reduce((s, x) => s + x.costUsd, 0) * 10000) / 10000, // 캐시·긴 프롬프트 값은 빼고 어림
      byModel: ai.map((x) => ({ ...x, costUsd: x.costUsd == null ? null : Math.round(x.costUsd * 10000) / 10000 })),
    },
    collect: {
      ics: { ok: total('ics_sync'), fail: total('ics_fail') },
      etl: { ok: total('etl_sync'), fail: total('etl_fail') },
      device: total('device_sync'),
      night: { ok: total('night_run'), fail: total('night_fail') },
    },
    errors: { reports: total('error_report'), feedback: total('feedback') },
    tables: sizes[0] || {},
    rowsRead: read, // 이 합계를 만드느라 D1이 읽은 줄(무료 하루 500만)
  };
}
