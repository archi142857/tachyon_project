// 4. 밤 정리 (Cron 01:30 한국 시각) · 밀도 · 아침 브리핑
//
// 흐름 (사용자마다, 하루 한 번):
//  1) 아직 정리 안 된 메모(memos.handled = 0)와 걸리는 시간이 빈 할 일(tasks.minutes IS NULL, eTL 과제 포함)을
//     똑똑한 모델(Sonnet)에게 한 번에 보낸다. 프롬프트 원문: worker/prompts/night.js
//  2) 메모 → 할 일 후보: 쓴 말 그대로, 메모 하나에 할 일 하나까지(쪼개지 않음), 모르는 칸은 비워 둔다(화면에서 '?').
//     → tasks(source='memo', ext_id='memo:<메모 id>'). 할 일이 아닌 메모도 handled = 1(다음 밤에 다시 읽지 않게).
//     마감 날짜는 정규식(3_memo_popup.js의 findWhen)이 '메모를 쓴 시각' 기준으로 먼저 계산한다.
//  3) 할 일마다 걸리는 시간(분)과 '지금 가능 / 수업·자료 뒤'(ready) 어림 → 사용자가 고칠 수 있다.
//  4) 밀도(코드, AI 없음): 여유 = 마감까지 쓸 수 있는 날 − (걸리는 시간 ÷ 하루 할 일 시간). 여유 적은 순 3개,
//     마감까지 하루 양을 고르게 펴서('서랍장') 이번 주·다음 주가 넘치면 경고.
//  5) 아침 브리핑 카드(JSON: 오늘 일정 · 할 일 3개 · 미룰 것 1개 · 경고 · 새로 생긴 할 일) → briefings.text
//
// 주소 (worker/index.js가 /api/briefing* 를 여기로 보낸다. 응답은 JSON)
//   GET  /api/briefing        → { briefing }  오늘 카드. 밤 정리 전이면 지금 할 일로 바로 만든다(AI 없음). log: briefing_open
//   GET  /api/briefing/rank   → { tasks, warning }  지금 할 일 전체를 여유 적은 순으로(대시보드 '할 일 3개'용)
//   POST /api/briefing/run    → { briefing }  이 사용자 밤 정리를 지금 돌린다(시험용, 10분에 3번까지)
// Cron: scheduled() — wrangler.toml crons "30 16 * * *"(UTC) = 한국 01:30
// 설정(선택, wrangler.toml [vars]): DAILY_TASK_MIN = 하루에 할 일에 쓰는 시간(분), 기본 180

import { askJson, usageDetail } from "./llm.js";
import { SYSTEM, SCHEMA, userMessage } from "./prompts/night.js";
import { findWhen, kst, ymd, addDays, isoKst, nowLabel } from "./3_memo_popup.js"; // 한국 시각·날짜 읽기는 3번 파일에 한 번만 둔다

const DAILY_MIN_DEFAULT = 180;
const MAX_MEMOS = 40; // 한 번에 AI에 보내는 메모 수 (남으면 다음 밤)
const MAX_TASKS = 40;

export async function scheduled(event, env, ctx) {
  const now = new Date(event?.scheduledTime ?? Date.now());
  const { results: users } = await env.DB.prepare("SELECT id FROM users ORDER BY id").all();
  for (const u of users) {
    try {
      await runNight(env, u.id, now);
    } catch (e) {
      await writeLog(env, u.id, "night_fail", JSON.stringify({ error: String(e?.message ?? e).slice(0, 160) }));
    }
  }
}

export async function handle(request, env, ctx, user) {
  if (!user) return json({ error: "로그인이 필요하다" }, 401);
  const [, , action] = new URL(request.url).pathname.split("/").filter(Boolean); // api / briefing / :action
  if (!action && request.method === "GET") return getBriefing(env, ctx, user);
  if (action === "rank" && request.method === "GET") return getRank(env, user);
  if (action === "run" && request.method === "POST") return runNow(env, user);
  return json({ error: "없는 주소" }, 404);
}

// ── 주소별 처리 ──────────────────────────────────────────────

async function getBriefing(env, ctx, user) {
  const now = new Date();
  const date = kstDate(now);
  const row = await env.DB.prepare("SELECT text FROM briefings WHERE user_id = ? AND date = ?").bind(user.id, date).first();
  const briefing = parseCard(row?.text) ?? (await buildBriefing(env, user.id, now, { by: "now" }));
  background(ctx, writeLog(env, user.id, "briefing_open", JSON.stringify({ date })));
  return json({ briefing });
}

async function getRank(env, user) {
  const now = new Date();
  const ranked = rankTasks(await openTasks(env, user.id), now, dailyMin(env));
  return json({ tasks: ranked, warning: crowdedWarning(ranked, now, dailyMin(env)) });
}

async function runNow(env, user) {
  // log.at은 schema.sql 기본값대로 '2026-11-09T18:20:00+09:00' 모양이라 같은 모양으로 비교한다
  const since = isoKst(new Date(Date.now() - 10 * 60 * 1000));
  const recent = await env.DB.prepare("SELECT count(*) AS n FROM log WHERE user_id = ? AND action = 'night_run' AND at > ?")
    .bind(user.id, since)
    .first();
  if (recent.n >= 3) return json({ error: "10분에 3번까지만 돌릴 수 있다" }, 429);
  return json({ briefing: await runNight(env, user.id, new Date()) });
}

// ── 밤 정리 ──────────────────────────────────────────────────

/** 한 사용자의 밤 정리. AI가 없거나 실패해도 브리핑은 만든다(메모는 다음 밤에 다시 읽는다). */
export async function runNight(env, userId, now = new Date(), { fetch } = {}) {
  await writeLog(env, userId, "night_run", null);
  const memos = (
    await env.DB.prepare("SELECT id, text, created_at FROM memos WHERE user_id = ? AND handled = 0 ORDER BY id LIMIT ?")
      .bind(userId, MAX_MEMOS)
      .all()
  ).results;
  const blank = (
    await env.DB.prepare("SELECT id, title, due FROM tasks WHERE user_id = ? AND done = 0 AND minutes IS NULL ORDER BY id LIMIT ?")
      .bind(userId, MAX_TASKS)
      .all()
  ).results;

  let newTasks = [];
  if ((memos.length || blank.length) && env.ANTHROPIC_API_KEY) {
    try {
      const r = await askJson(env, {
        model: "smart",
        system: SYSTEM,
        schema: SCHEMA,
        content: userMessage(
          nowLabel(now),
          memos.map((m) => ({ id: m.id, written: nowLabel(dbTime(m.created_at)), text: m.text })),
          blank,
        ),
        maxTokens: 4000,
        timeoutMs: 90000,
        retries: 2,
        fetch,
      });
      await writeLog(env, userId, "llm", usageDetail("night", r));
      const memoText = new Map(memos.map((m) => [`memo:${m.id}`, m.text]));
      newTasks = (await applyNight(env, userId, memos, blank, r.data)).map((t) => ({ ...t, memo: memoText.get(t.ext_id) }));
    } catch (e) {
      await writeLog(env, userId, "llm_fail", JSON.stringify({ use: "night", error: String(e?.message ?? e).slice(0, 160) }));
    }
  }

  const card = await buildBriefing(env, userId, now, { by: "night", newTasks });
  await env.DB.prepare(
    "INSERT INTO briefings (user_id, date, text) VALUES (?, ?, ?) ON CONFLICT (user_id, date) DO UPDATE SET text = excluded.text",
  )
    .bind(userId, card.date, JSON.stringify(card))
    .run();
  return card;
}

/** AI 답 → tasks 넣기·걸리는 시간 채우기·메모 처리 표시 (한 번에, 보낸 id만 믿는다) */
async function applyNight(env, userId, memos, blank, data) {
  const memoById = new Map(memos.map((m) => [m.id, m]));
  const blankIds = new Set(blank.map((t) => t.id));
  const statements = [];
  const answered = [];

  for (const a of data?.memos ?? []) {
    const memo = memoById.get(a.id);
    if (!memo || answered.includes(memo.id)) continue;
    answered.push(memo.id);
    if (a.is_task !== true) continue;
    statements.push(
      env.DB.prepare(
        `INSERT INTO tasks (user_id, title, due, minutes, ready, source, ext_id) VALUES (?, ?, ?, ?, ?, 'memo', ?)
         ON CONFLICT (user_id, source, ext_id) DO NOTHING
         RETURNING id, title, due, minutes, ready, ext_id`,
      ).bind(userId, clean(a.title) ?? memo.text, dueOf(memo, a.due), minutesOf(a.minutes), a.ready === "after" ? 0 : 1, `memo:${memo.id}`),
    );
  }
  for (const a of data?.tasks ?? []) {
    if (!blankIds.has(a.id)) continue;
    statements.push(
      env.DB.prepare("UPDATE tasks SET minutes = ?, ready = ? WHERE id = ? AND user_id = ? AND minutes IS NULL").bind(
        minutesOf(a.minutes) ?? 60,
        a.ready === "after" ? 0 : 1,
        a.id,
        userId,
      ),
    );
  }
  if (answered.length) {
    statements.push(
      env.DB.prepare(`UPDATE memos SET handled = 1 WHERE user_id = ? AND id IN (${answered.map(() => "?").join(", ")})`).bind(userId, ...answered),
    );
  }
  if (!statements.length) return [];
  const results = await env.DB.batch(statements);
  return results.flatMap((r) => r.results ?? []).filter((row) => row && row.title !== undefined);
}

/** 마감: 메모 글의 날짜·시각(쓴 시각 기준, 정규식) → 없으면 AI 답 → 그것도 없으면 null */
function dueOf(memo, aiDue) {
  const when = findWhen(memo.text, dbTime(memo.created_at));
  if (when && !when.past) return when.time ? `${when.date}T${when.time}:00+09:00` : when.date;
  const d = String(aiDue ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d)) return `${d}:00+09:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(d)) return d;
  return null;
}

function minutesOf(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.max(Math.round(n / 5) * 5, 5), 1440);
}

// ── 밀도와 브리핑 (코드만) ───────────────────────────────────

async function buildBriefing(env, userId, now, { by, newTasks = [] }) {
  const date = kstDate(now);
  const [events, tasks] = await Promise.all([
    env.DB.prepare(`SELECT id, title, start, "end", place, important FROM events WHERE user_id = ? AND start >= ? AND start < ? ORDER BY start`)
      .bind(userId, date, addDays(date, 1))
      .all()
      .then((r) => r.results),
    openTasks(env, userId),
  ]);
  const ranked = rankTasks(tasks, now, dailyMin(env));
  const rest = ranked.slice(3);
  return {
    date,
    made_at: isoKst(now),
    by, // night = 01:30 밤 정리, now = 밤 정리 전에 바로 만든 것
    events,
    top3: ranked.slice(0, 3).map(short),
    postpone: rest.length ? short(rest[rest.length - 1]) : null, // 여유가 가장 많은 것(또는 마감 없는 것)
    warning: crowdedWarning(ranked, now, dailyMin(env)),
    new_tasks: newTasks.map((t) => ({ id: t.id, title: t.title, memo: t.memo ?? null })), // memo = 근거로 보여 줄 원문 메모
  };
}

// source = 어디서 왔나(etl · ics · memo …). 화면에서 근거로 보여 준다.
const short = (t) => ({ id: t.id, title: t.title, due: t.due, minutes: t.minutes, ready: t.ready, source: t.source, slack_days: t.slack_days });

/** 저장된 카드 글 → 객체. 다른 모양(손으로 넣은 글 등)이면 null → 지금 다시 만든다 */
function parseCard(text) {
  try {
    const card = JSON.parse(text);
    return card && typeof card === "object" && Array.isArray(card.top3) ? card : null;
  } catch {
    return null;
  }
}

function openTasks(env, userId) {
  return env.DB.prepare("SELECT id, title, due, minutes, ready, source FROM tasks WHERE user_id = ? AND done = 0")
    .bind(userId)
    .all()
    .then((r) => r.results);
}

/**
 * 여유 적은 순으로 줄 세우기 ('서랍장').
 * 하루를 칸 하나(하루 할 일 시간, 기본 3시간)로 보고, 마감이 이른 할 일부터 오늘부터의 칸에 채워 넣는다.
 * 여유(slack_days) = 그 마감까지의 칸 − 그 마감까지 채워야 할 양(앞 마감 것 포함), 날 단위. 0이면 빠듯, 음수면 모자람.
 * → 마감이 몰려 있으면 뒤쪽 할 일의 여유가 줄어서 위로 올라온다. 걸리는 시간을 모르면 60분, 마감 없는 일은 맨 뒤(null).
 */
export function rankTasks(tasks, now = new Date(), dailyMinutes = DAILY_MIN_DEFAULT) {
  const today = kstDate(now);
  const open = tasks.filter((t) => !t.done).map((t) => ({ ...t, days_left: daysLeft(t.due, today), slack_days: null }));
  const byDue = open.filter((t) => t.days_left != null).sort((a, b) => a.days_left - b.days_left);
  let filled = 0;
  for (let i = 0; i < byDue.length; ) {
    let j = i; // 같은 날 마감은 함께 센다
    while (j < byDue.length && byDue[j].days_left === byDue[i].days_left) filled += byDue[j++].minutes ?? 60;
    const slack = Math.round(((Math.max(byDue[i].days_left, 0) * dailyMinutes - filled) / dailyMinutes) * 10) / 10;
    for (let k = i; k < j; k++) byDue[k].slack_days = slack;
    i = j;
  }
  return open.sort(
    (a, b) =>
      (a.slack_days ?? Infinity) - (b.slack_days ?? Infinity) ||
      String(a.due ?? "~").localeCompare(String(b.due ?? "~")) ||
      a.id - b.id,
  );
}

/** 마감까지 쓸 수 있는 날 수 (오늘 포함). 날짜만 있거나 저녁(18시~) 마감이면 그날도 센다. */
function daysLeft(due, today) {
  if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) return null;
  const days = Math.round((Date.parse(`${due.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const hour = due.length > 10 ? Number(due.slice(11, 13)) : 24;
  return hour >= 18 ? days + 1 : days;
}

/**
 * 몰린 주 경고 한 줄 (rankTasks 결과를 받는다).
 * ① 서랍장에 다 안 들어가면(여유 < 0): 그 마감까지 몇 시간 모자란지.
 * ② 다 들어가도 이번 주·다음 주에 마감인 일이 한 주 칸(하루 할 일 시간 × 7)보다 많으면: 미리 시작하라고.
 */
export function crowdedWarning(ranked, now = new Date(), dailyMinutes = DAILY_MIN_DEFAULT) {
  const today = kstDate(now);
  const hours = (min) => Math.max(1, Math.round(min / 60));
  const worst = ranked.filter((t) => t.slack_days != null && t.slack_days < 0).sort((a, b) => a.slack_days - b.slack_days)[0];
  if (worst) {
    if (worst.due.slice(0, 10) < today) return `마감이 지난 할 일이 있어요: ${worst.title}`;
    return `${weekName(worst.due, today)} 마감까지 하루 ${dailyMinutes / 60}시간으로는 약 ${hours(-worst.slack_days * dailyMinutes)}시간 모자라요`;
  }
  const monday = mondayOf(today);
  for (const [name, from] of [["이번 주", 0], ["다음 주", 7]]) {
    const start = addDays(monday, from);
    const end = addDays(monday, from + 7);
    const due = ranked
      .filter((t) => t.due && t.due.slice(0, 10) >= start && t.due.slice(0, 10) < end)
      .reduce((sum, t) => sum + (t.minutes ?? 60), 0);
    if (due > dailyMinutes * 7) return `${name} 마감인 할 일이 약 ${hours(due)}시간 몰려 있어요. 미리 시작해 두세요`;
  }
  return null;
}

function mondayOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  return addDays(date, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
}

function weekName(due, today) {
  const monday = mondayOf(today);
  const weeks = Math.floor((Date.parse(`${due.slice(0, 10)}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / (7 * 86400000));
  if (weeks === 0) return "이번 주";
  if (weeks === 1) return "다음 주";
  return `${Number(due.slice(5, 7))}/${Number(due.slice(8, 10))}`;
}

// ── 작은 도구들 ──────────────────────────────────────────────

const dailyMin = (env) => Number(env.DAILY_TASK_MIN) || DAILY_MIN_DEFAULT;

function kstDate(date) {
  const k = kst(date);
  return ymd(k.y, k.m, k.d);
}

/** DB 시각 글자 → Date. "+09:00" 모양과 SQLite 기본값(UTC "2026-11-09 08:00:00") 둘 다 읽는다. */
function dbTime(s) {
  if (!s) return new Date();
  return new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
}

const clean = (v) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s !== "?" ? s : null;
};

function writeLog(env, userId, action, detail) {
  if (!env.DB) return Promise.resolve();
  return env.DB.prepare("INSERT INTO log (user_id, action, detail) VALUES (?, ?, ?)")
    .bind(userId ?? null, action, detail ?? null)
    .run()
    .catch(() => {});
}

function background(ctx, promise) {
  if (ctx?.waitUntil) ctx.waitUntil(promise);
}

function json(data, status = 200) {
  return Response.json(data, { status });
}
