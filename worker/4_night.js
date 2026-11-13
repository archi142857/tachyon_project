// 4. 밤 정리 (Cron 01:30 한국 시각) · 밀도 · 아침 브리핑
//
// 흐름 (사용자마다, 하루 한 번):
//  1) 아직 정리 안 된 메모(memos.handled = 0)와 걸리는 시간이 빈 할 일(tasks.minutes IS NULL, eTL 과제 포함)을
//     똑똑한 모델(Sonnet)에게 한 번에 보낸다. 프롬프트 원문: worker/prompts/night.js
//  2) 메모 → 할 일 후보: 쓴 말 그대로, 메모 하나에 할 일 하나까지(쪼개지 않음), 모르는 칸은 비워 둔다(화면에서 '?').
//     → tasks(source='memo', ext_id='memo:<메모 id>'). 할 일이 아닌 메모도 handled = 1(다음 밤에 다시 읽지 않게).
//     마감 날짜는 정규식(3_memo_popup.js의 findWhen)이 '메모를 쓴 시각' 기준으로 먼저 계산한다.
//  3) 할 일마다 걸리는 시간(분)과 '지금 가능 / 수업·자료 뒤'(ready) 어림 → 사용자가 고칠 수 있다.
//  4) 밀도(코드, AI 없음) = '고르게 나누기' 한 규칙(planDays, 아래 '고르게 나누기' 머리글): 할 일을 마감 전 날들에
//     가장 덜 찬 날부터 나눈다. 날마다 몫(화면의 밀도 고리)·여유 순(할 일 3개)·몰린 주 경고·미룰 것이 모두 이 셈에서 나온다.
//  5) 아침 브리핑 카드(JSON: 오늘 일정 · 할 일 3개 · 미룰 것 1개 · 경고 · 오늘 몫 · 새로 생긴 할 일) → briefings.text
//
// 주소 (worker/index.js가 /api/briefing* 를 여기로 보낸다. 응답은 JSON)
//   GET  /api/briefing        → { briefing }  오늘 카드. 밤 정리 전이면 지금 할 일로 바로 만든다(AI 없음). log: briefing_open
//   GET  /api/briefing/rank   → { tasks, warning }  지금 할 일 전체를 여유 적은 순으로(대시보드 '할 일 3개'용)
//   GET  /api/briefing/plan?days=42 → { days: [...] }  오늘부터 날마다 몫(밀도 고리·주 '고르게' 줄). 모양은 web/API.md
//   POST /api/briefing/now    {}             → { plan, summary }   지금 정리 — 정리 보기(밤 정리 규칙, AI 한 번, 아무것도 안 바꿈, 10분에 5번까지)
//   POST /api/briefing/now    { apply: plan } → { briefing, summary } 이대로 정리하기 — 받은 안을 그대로 넣는다(AI 다시 안 부름)
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
  if (action === "plan" && request.method === "GET") return getPlan(env, user, new URL(request.url));
  if (action === "run" && request.method === "POST") return runNow(env, user);
  if (action === "now" && request.method === "POST") return organizeNow(request, env, user);
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
  const [tasks, events] = await Promise.all([openTasks(env, user.id), planEvents(env, user.id, now)]);
  const ranked = rankTasks(tasks, now, dailyMin(env), events);
  return json({ tasks: ranked, warning: crowdedWarning(ranked, now, dailyMin(env)) });
}

async function getPlan(env, user, url) {
  const now = new Date();
  const days = Math.min(Math.max(Math.round(Number(url.searchParams.get("days")) || PLAN_DAYS), 1), PLAN_DAYS);
  const [tasks, events] = await Promise.all([openTasks(env, user.id), planEvents(env, user.id, now, days)]);
  const plan = planDays(tasks, events, now, { days, dailyMinutes: dailyMin(env) });
  return json({
    ok: true,
    awake: { from: "07:00", minutes: AWAKE_MIN }, // 고리 한 바퀴
    daily_min: dailyMin(env), // 하루 편한 할 일 시간(이보다 많이 나눈 몫이 extra_min)
    guessed: plan.guessed, // 걸리는 시간을 몰라 1시간으로 센 할 일 수(밤 정리 전)
    warning: crowdedWarning(plan.ranked, now, dailyMin(env)),
    days: plan.days,
  });
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
  const { memos, blank } = await loadUnsorted(env, userId, now);

  let newTasks = [];
  if ((memos.length || blank.length) && env.ANTHROPIC_API_KEY) {
    try {
      const data = await askNight(env, userId, now, memos, blank, { fetch, use: "night" });
      const memoText = new Map(memos.map((m) => [`memo:${m.id}`, m.text]));
      newTasks = (await applyNight(env, userId, memos, blank, data)).map((t) => ({ ...t, memo: memoText.get(t.ext_id) }));
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
/** 아직 정리하지 않은 메모(handled = 0)와 걸리는 시간이 빈 할 일. 밤 정리·지금 정리가 같이 쓴다 */
async function loadUnsorted(env, userId, now) {
  const memos = (
    await env.DB.prepare("SELECT id, text, created_at FROM memos WHERE user_id = ? AND handled = 0 ORDER BY id LIMIT ?")
      .bind(userId, MAX_MEMOS)
      .all()
  ).results;
  // 걸리는 시간을 채울 할 일: 마감이 다가오는 것부터, 그다음 마감 없는 것, 마감이 지난 것은 맨 뒤
  // (eTL 주소를 처음 붙이면 지난 30일 과제가 끝남 표시 없이 들어와서, 앞에서부터 40개를 고르면 지난 과제가 다 차지한다)
  const blank = (
    await env.DB.prepare(
      `SELECT id, title, due FROM tasks WHERE user_id = ? AND done = 0 AND minutes IS NULL
       ORDER BY CASE WHEN due IS NULL THEN 1 WHEN due < ? THEN 2 ELSE 0 END, due, id LIMIT ?`,
    )
      .bind(userId, kstDate(now), MAX_TASKS)
      .all()
  ).results;
  return { memos, blank };
}

/** 밤 정리 프롬프트로 AI에게 한 번 묻는다(메모·빈 할 일을 한꺼번에). 답 JSON을 돌려주고 사용량을 log에 남긴다 */
async function askNight(env, userId, now, memos, blank, { fetch, use }) {
  const r = await askJson(env, {
    model: "smart",
    system: SYSTEM,
    schema: SCHEMA,
    content: userMessage(
      nowLabel(now),
      memos.map((m) => ({ id: m.id, written: nowLabel(dbTime(m.created_at)), text: m.text })),
      blank,
    ),
    maxTokens: 8000, // 메모 40 + 할 일 40이면 답이 3천 토큰을 넘을 수 있다(5.5 모델은 같은 글에 토큰이 더 든다). 쓴 만큼만 값을 낸다
    timeoutMs: 120000,
    retries: 2,
    fetch,
  });
  await writeLog(env, userId, "llm", usageDetail(use, r));
  return r.data;
}

// ── 지금 정리 (11-13 사람 요청 "할 일 바로 정리", 밤 01:30까지 기다리지 않고) ──
// 정리 보기: 밤 정리와 같은 규칙·같은 AI 한 번(메모 n개를 한꺼번에)으로 안(plan)을 만들어 보여 준다. DB는 log만 쓴다.
// 이대로 정리하기: 화면이 받은 안을 그대로(빼거나 이름·마감을 고친 것도) 돌려보내면 넣는다. AI는 다시 안 부른다(토큰 아끼기).
// 그사이 팝업으로 넣은 메모·이미 시간이 찬 할 일은 건너뛴다.
const NOW_PER_10MIN = 5;

async function organizeNow(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const now = new Date();
  if (body && body.apply) return applyPlan(env, user.id, now, body.apply);

  const since = isoKst(new Date(now.getTime() - 10 * 60 * 1000));
  const recent = await env.DB.prepare("SELECT count(*) AS n FROM log WHERE user_id = ? AND action = 'night_now' AND at > ?").bind(user.id, since).first();
  if (recent.n >= NOW_PER_10MIN) return json({ error: `10분에 ${NOW_PER_10MIN}번까지만 정리해 볼 수 있어요` }, 429);

  const { memos, blank } = await loadUnsorted(env, user.id, now);
  if (!memos.length && !blank.length) return json({ plan: { memos: [], tasks: [] }, summary: "정리할 메모가 없어요" });
  if (!env.ANTHROPIC_API_KEY) return json({ error: "지금은 AI가 없어 정리하지 못해요. 밤 01:30에 정리해요" }, 503);
  await writeLog(env, user.id, "night_now", null);
  let data;
  try {
    data = await askNight(env, user.id, now, memos, blank, { use: "night_now" }); // fetch는 llm.js가 쓰는 전역 fetch(시험은 그것을 바꾼다)
  } catch (e) {
    await writeLog(env, user.id, "llm_fail", JSON.stringify({ use: "night_now", error: String(e?.message ?? e).slice(0, 160) }));
    return json({ error: "지금은 정리하지 못했어요. 잠시 뒤에 다시 해 보거나 밤 01:30 정리를 기다려 주세요" }, 502);
  }
  const plan = planOf(memos, blank, data);
  return json({ plan, summary: summaryOf(plan) });
}

/** AI 답 → 화면에 보일 안: 메모마다 할 일인지·이름·마감(쓴 날짜 말 먼저)·걸릴 분, 빈 할 일마다 걸릴 분 */
function planOf(memos, blank, data) {
  const byMemo = new Map((data?.memos ?? []).map((a) => [a.id, a]));
  const byTask = new Map((data?.tasks ?? []).map((a) => [a.id, a]));
  return {
    memos: memos.map((m) => {
      const a = byMemo.get(m.id);
      const task = a?.is_task === true;
      return {
        id: m.id,
        text: m.text,
        task,
        title: task ? (clean(a.title) ?? m.text) : null,
        due: task ? dueOf(m, a.due) : null,
        minutes: task ? minutesOf(a.minutes) : null,
        ready: task ? (a.ready === "after" ? "after" : "now") : null,
        answered: Boolean(a), // AI가 답하지 않은 메모는 넣어도 그대로 남는다(밤에 다시 읽음)
      };
    }),
    tasks: blank
      .filter((t) => byTask.has(t.id))
      .map((t) => {
        const a = byTask.get(t.id);
        return { id: t.id, title: t.title, due: t.due, minutes: minutesOf(a.minutes) ?? 60, ready: a.ready === "after" ? "after" : "now" };
      }),
  };
}

/** 정리 결과 한 줄(11-13 사람 요청 '정리 결과를 한 줄로') */
function summaryOf(plan) {
  const answered = plan.memos.filter((m) => m.answered);
  const tasks = answered.filter((m) => m.task).length;
  const parts = [];
  if (answered.length) parts.push(`메모 ${answered.length}개 → 할 일 ${tasks}개${answered.length - tasks ? ` · 그냥 메모 ${answered.length - tasks}개` : ""}`);
  if (plan.tasks.length) parts.push(`걸리는 시간 ${plan.tasks.length}개 어림`);
  return parts.length ? parts.join(" · ") : "정리할 메모가 없어요";
}

/** 이대로 정리하기: 화면이 돌려보낸 안을 검사해 넣는다(내 것이고 아직 정리 안 된 메모·시간 빈 할 일만) */
async function applyPlan(env, userId, now, plan) {
  const memoIds = [...new Set((plan?.memos ?? []).map((m) => m?.id).filter(Number.isInteger))].slice(0, MAX_MEMOS);
  const taskIds = [...new Set((plan?.tasks ?? []).map((t) => t?.id).filter(Number.isInteger))].slice(0, MAX_TASKS);
  if (!memoIds.length && !taskIds.length) return json({ error: "넣을 안이 없다" }, 400);
  const placeholders = (ids) => ids.map(() => "?").join(", ");
  const [memos, blank] = await Promise.all([
    memoIds.length
      ? env.DB.prepare(`SELECT id, text, created_at FROM memos WHERE user_id = ? AND handled = 0 AND id IN (${placeholders(memoIds)})`).bind(userId, ...memoIds).all().then((r) => r.results)
      : [],
    taskIds.length
      ? env.DB.prepare(`SELECT id, title, due FROM tasks WHERE user_id = ? AND done = 0 AND minutes IS NULL AND id IN (${placeholders(taskIds)})`).bind(userId, ...taskIds).all().then((r) => r.results)
      : [],
  ]);
  // 안 → applyNight가 받는 AI 답 모양. 마감은 화면이 보낸 것(고쳤을 수 있다)이 맞는 모양이면 그것, 아니면 밤 정리와 같은 셈
  const memoById = new Map(memos.map((m) => [m.id, m]));
  const data = {
    memos: (plan.memos ?? [])
      .filter((m) => memoById.has(m?.id) && m.answered !== false)
      .map((m) => ({ id: m.id, is_task: m.task === true, title: m.title, due: validDue(m.due) ?? "?", minutes: m.minutes, ready: m.ready === "after" ? "after" : "now", keepDue: Boolean(validDue(m.due)) })),
    tasks: (plan.tasks ?? []).map((t) => ({ id: t?.id, minutes: t?.minutes, ready: t?.ready === "after" ? "after" : "now" })),
  };
  const memoText = new Map(memos.map((m) => [`memo:${m.id}`, m.text]));
  const newTasks = (await applyNight(env, userId, memos, blank, data)).map((t) => ({ ...t, memo: memoText.get(t.ext_id) }));
  const card = await buildBriefing(env, userId, now, { by: "now", newTasks });
  await env.DB.prepare(
    "INSERT INTO briefings (user_id, date, text) VALUES (?, ?, ?) ON CONFLICT (user_id, date) DO UPDATE SET text = excluded.text",
  )
    .bind(userId, card.date, JSON.stringify(card))
    .run();
  const applied = { memos: data.memos.length, tasks: newTasks.length, minutes: blank.filter((t) => data.tasks.some((a) => a.id === t.id)).length };
  await writeLog(env, userId, "night_now_apply", JSON.stringify(applied));
  const notes = data.memos.filter((m) => !m.is_task).length;
  return json({ briefing: card, applied, summary: doneSummaryOf(applied.tasks, notes, applied.minutes) });
}

/**
 * 넣은 뒤 한 줄(화면 스낵바). 디자인 11-13 01:09 규칙: 정한 것은 '…넣었어요'·'…했어요', 추천은 '…어때요?'·'…해 보세요'.
 * 정리 보기의 summary(summaryOf)는 넣기 전 안을 세는 말이라 '→'로만 쓴다.
 */
function doneSummaryOf(tasks, notes, minutes) {
  const parts = [];
  if (tasks) parts.push(`할 일 ${tasks}개를 넣었어요`);
  if (notes) parts.push(`메모 ${notes}개는 메모로 뒀어요`);
  if (minutes) parts.push(`걸리는 시간 ${minutes}개를 채웠어요`);
  return parts.length ? parts.join(" · ") : "새로 넣은 것은 없어요";
}

const validDue = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\+09:00)?$/.test(d) ? d : null);

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
      ).bind(userId, clean(a.title) ?? memo.text, a.keepDue ? a.due : dueOf(memo, a.due), minutesOf(a.minutes), a.ready === "after" ? 0 : 1, `memo:${memo.id}`),
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
  const [events, tasks, spans] = await Promise.all([
    // 오늘 시작하는 일정 + 전에 시작해 오늘도 이어지는 하루 종일 일정(여행·시험 기간 같은 여러 날 일정)
    env.DB.prepare(
      `SELECT id, title, start, "end", place, important FROM events
       WHERE user_id = ? AND moved_to IS NULL AND start < ? AND (start >= ? OR (length(start) = 10 AND "end" > ?)) ORDER BY start`,
    )
      .bind(userId, addDays(date, 1), date, date)
      .all()
      .then((r) => r.results),
    openTasks(env, userId),
    planEvents(env, userId, now),
  ]);
  const plan = planDays(tasks, spans, now, { dailyMinutes: dailyMin(env) });
  const ranked = plan.ranked;
  const top3 = ranked.slice(0, 3);
  const today = plan.days[0];
  return {
    date,
    made_at: isoKst(now),
    by, // night = 01:30 밤 정리, now = 밤 정리 전에 바로 만든 것
    events,
    top3: top3.map(short),
    postpone: postponeOf(ranked, top3, today),
    warning: crowdedWarning(ranked, now, dailyMin(env)),
    // 오늘 몫(화면 밀도 고리의 오늘 칸과 같은 셈): 일정 · 할 일(편한 몫) · 빠듯 · 넘침, 분
    today: { event_min: today.event_min, task_min: today.task_min, extra_min: today.extra_min, over_min: today.over_min },
    new_tasks: newTasks.map((t) => ({ id: t.id, title: t.title, memo: t.memo ?? null })), // memo = 근거로 보여 줄 원문 메모
  };
}

/** 미룰 것 1개: 오늘 몫이 나뉜 할 일 가운데 할 일 3개가 아닌 것 중 여유가 가장 많은 것(마감 없는 것 포함). 없으면 남은 것 중 맨 뒤 */
function postponeOf(ranked, top3, today) {
  const inTop = new Set(top3.map((t) => t.id));
  const planned = new Set(today.items.map((x) => x.task_id));
  const rest = ranked.filter((t) => !inTop.has(t.id));
  const pick = rest.filter((t) => planned.has(t.id)).at(-1) ?? rest.at(-1);
  return pick ? short(pick) : null;
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

// ── 고르게 나누기 (코드만, AI 없음) ─────────────────────────
// 날마다 몫(화면의 밀도 고리·주 '고르게' 줄), 할 일 여유 순, 몰린 주 경고, 미룰 것이 모두 이 한 규칙을 쓴다
// (11-11 사람 요청 "날마다 밀도 고리 + 주간 밀도가 고르게 유지되는 것이 보이게", 화면 셈과 하나로 — 컨셉 쪽지 261111-2228).
// - 하루 = 깨어 있는 7시~24시(1020분). 오늘은 지금부터. 빈 시간(room) = 그 시간 − 시각 일정(겹침은 한 번만, 하루 종일 일정은 안 셈).
// - 편한 몫(cap) = min(빈 시간, 하루 할 일 시간 DAILY_TASK_MIN — 기본 3시간).
// - 할 일은 마감이 이른 것부터, 오늘 ~ 마지막 날에 15분씩 '가장 덜 찬 날(일정 + 나눈 할 일)'부터 나눈다(물 채우기).
//   ① 편한 몫 안에서(task_min) → ② 모자라면 빈 시간까지(빠듯, extra_min) → ③ 그래도 남으면 마지막 날에 넘침(over_min).
// - 마지막 날: 정오(12시) 이후 마감이면 마감 날, 정오 전이면 전날. 날짜만 있는 마감은 그날 23:59. 지난 할 일은 오늘. 마감 없는 일은 2주 안.
// - 걸리는 시간을 모르면(밤 정리 전) 1시간. 견주려고 '마지막 날에 몰아서 할 때'(cram_min)도 센다.
// - 여유(slack_days) = 마지막 날까지 편한 몫의 합 − 그 마감까지 해야 할 양(앞 마감 것 포함), 하루 할 일 시간 단위.
//   0보다 작으면 편한 몫으로는 모자라 ②·③이 생긴다 = 경고 '하루 3시간으로는 약 N시간 모자라요'. (마감이 이른 것부터 나누면
//   편한 몫 안에 다 들어갈 수 있을 때는 늘 다 들어가서, 여유 < 0 ⟺ 그 마감 앞에 빠듯·넘침이 생김.)

export const AWAKE_FROM = 7 * 60; // 일어나는 시각(분). 화면 slots.js WAKE = 7과 같게
export const AWAKE_MIN = 24 * 60 - AWAKE_FROM; // 1020
export const PLAN_DAYS = 42; // 오늘부터 6주
const STEP = 15;
const GUESS_MIN = 60;
const NO_DUE_DAYS = 14;
const DAY_MS = 86400000;

/**
 * 오늘부터 days일의 날마다 몫과 여유 순.
 * tasks = 끝나지 않은 할 일({id, title, due, minutes, ready, source}), events = 그 기간 일정({start, end}).
 * → { days: [{ date, event_min, room_min, task_min, extra_min, over_min, cram_min, items: [{ task_id, min }] }], ranked, guessed }
 */
export function planDays(tasks, events = [], now = new Date(), { days = PLAN_DAYS, dailyMinutes = DAILY_MIN_DEFAULT } = {}) {
  const today = kstDate(now);
  const k = kst(now);
  const spans = timedSpans(events);
  const list = Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    const from = i === 0 ? Math.max(AWAKE_FROM, k.hh * 60 + k.mi) : AWAKE_FROM;
    const room = Math.max(0, 24 * 60 - from - busyMinutes(spans, date, from));
    return { date, event_min: busyMinutes(spans, date, AWAKE_FROM), room_min: room, cap: Math.min(room, dailyMinutes), task_min: 0, extra_min: 0, over_min: 0, cram_min: 0, items: new Map() };
  });
  const open = tasks
    .filter((t) => !t.done)
    .map((t) => ({ ...t, need: t.minutes > 0 ? t.minutes : GUESS_MIN, last: lastDay(t.due, today, now), slack_days: null }));

  // 여유: 마지막 날 순으로, 같은 날은 함께 센다
  const withDue = open.filter((t) => t.last != null).sort((a, b) => a.last - b.last || dueMs(a.due) - dueMs(b.due) || a.id - b.id);
  let filled = 0;
  let capSum = 0;
  let upto = -1;
  for (let i = 0; i < withDue.length; ) {
    let j = i;
    while (j < withDue.length && withDue[j].last === withDue[i].last) filled += withDue[j++].need;
    while (upto < withDue[i].last) capSum += ++upto < days ? list[upto].cap : dailyMinutes;
    const slack = Math.round(((capSum - filled) / dailyMinutes) * 10) / 10;
    for (let x = i; x < j; x++) {
      withDue[x].slack_days = slack;
      withDue[x].days_left = withDue[x].last + 1; // 쓸 수 있는 날 수(오늘 포함, 지났으면 0 이하)
    }
    i = j;
  }

  // 날마다 몫: 마감이 이른 것부터 물 채우기
  const load = (d) => d.event_min + d.task_min + d.extra_min;
  const pour = (task, left, hi, space, put) => {
    while (left > 0) {
      let best = null;
      for (let i = 0; i <= hi; i++) if (space(list[i]) > 0 && (!best || load(list[i]) < load(best))) best = list[i];
      if (!best) break;
      const add = Math.min(STEP, left, space(best));
      put(best, add);
      best.items.set(task.id, (best.items.get(task.id) ?? 0) + add);
      left -= add;
    }
    return left;
  };
  const order = [...withDue, ...open.filter((t) => t.last == null).sort((a, b) => a.id - b.id)];
  for (const t of order) {
    const hi = Math.min(days - 1, t.last == null ? NO_DUE_DAYS - 1 : Math.max(0, t.last));
    list[hi].cram_min += t.need;
    let left = pour(t, t.need, hi, (d) => Math.min(d.cap, d.room_min - d.extra_min) - d.task_min, (d, m) => (d.task_min += m));
    left = pour(t, left, hi, (d) => d.room_min - d.task_min - d.extra_min, (d, m) => (d.extra_min += m));
    if (left > 0) list[hi].over_min += left;
  }

  const ranked = open
    .sort((a, b) => (a.slack_days ?? Infinity) - (b.slack_days ?? Infinity) || String(a.due ?? "~").localeCompare(String(b.due ?? "~")) || a.id - b.id)
    .map(({ need, last, ...t }) => t);
  return {
    days: list.map(({ cap, items, ...d }) => ({ ...d, items: [...items].map(([task_id, min]) => ({ task_id, min })) })),
    ranked,
    guessed: open.filter((t) => !(t.minutes > 0)).length,
  };
}

/** 여유 적은 순(위 planDays와 같은 셈). events를 주면 일정이 많은 날의 빈 시간까지 본다(안 주면 깨어 있는 시간 전부) */
export function rankTasks(tasks, now = new Date(), dailyMinutes = DAILY_MIN_DEFAULT, events = []) {
  return planDays(tasks, events, now, { dailyMinutes }).ranked;
}

/** 할 일을 할 수 있는 마지막 날(오늘 = 0). 정오 전 마감이면 전날, 지났으면 -1, 마감 없으면 null */
function lastDay(due, today, now) {
  if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) return null;
  if (!(dueMs(due) > now.getTime())) return -1;
  const i = Math.round((Date.parse(`${due.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  const hour = due.length > 10 ? Number(due.slice(11, 13)) : 24;
  return hour < 12 ? i - 1 : i;
}

const dueMs = (due) => (!due ? Infinity : Date.parse(due.length > 10 ? due : `${due}T23:59:00+09:00`));

/** 시각 일정만 [시작, 끝] ms로(끝이 없으면 1시간). 하루 종일 일정(날짜만)은 시간을 차지하지 않는 것으로 본다 */
function timedSpans(events) {
  return events
    .filter((e) => e.start && e.start.length > 10)
    .map((e) => {
      const s = Date.parse(e.start);
      return [s, e.end && e.end.length > 10 ? Date.parse(e.end) : s + 3600000];
    })
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
}

/** 그날 fromMin부터 자정까지 일정이 차지하는 분(겹친 것은 한 번만) */
function busyMinutes(spans, date, fromMin) {
  const d0 = Date.parse(`${date}T00:00:00+09:00`);
  const a = d0 + fromMin * 60000;
  const b = d0 + DAY_MS;
  let total = 0;
  let cur = null;
  for (const [s0, e0] of spans) {
    const s = Math.max(a, s0);
    const e = Math.min(b, e0);
    if (e <= s) continue;
    if (!cur || s > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [s, e];
    } else cur[1] = Math.max(cur[1], e);
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round(total / 60000);
}

/** 계획에 쓰는 일정: 어제(밤을 넘는 일정)부터 days일 */
function planEvents(env, userId, now, days = PLAN_DAYS) {
  const today = kstDate(now);
  return env.DB.prepare(`SELECT start, "end" FROM events WHERE user_id = ? AND moved_to IS NULL AND start >= ? AND start < ?`)
    .bind(userId, addDays(today, -1), addDays(today, days))
    .all()
    .then((r) => r.results);
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
    const overdue = ranked.filter((t) => t.due && t.due.slice(0, 10) < today);
    if (worst.due.slice(0, 10) < today) {
      // 마감이 가장 가까웠던 것 하나를 이름으로. eTL 주소만 붙이면 제출해도 끝남이 안 들어와서 '끝났으면 체크'를 함께 적는다
      const latest = overdue.reduce((a, b) => (String(b.due) > String(a.due) ? b : a));
      return `마감이 지난 할 일이 ${overdue.length > 1 ? `${overdue.length}개 ` : ""}있어요: ${latest.title}${overdue.length > 1 ? " 등" : ""}. 끝났으면 체크해 주세요`;
    }
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
