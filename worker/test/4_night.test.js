// worker/4_night.js 테스트. 실제 API는 부르지 않는다(가짜 fetch), DB는 schema.sql로 만든 가짜 D1. 자료는 모두 지어낸 예시.
// 실행: node --test "worker/test/*.test.js"

import test from "node:test";
import assert from "node:assert/strict";
import { handle, scheduled, runNight, rankTasks, crowdedWarning } from "../4_night.js";
import { fakeD1, addUser, fakeCtx } from "./helpers/d1.js";

const NIGHT = new Date("2026-11-10T01:30:00+09:00"); // 화요일 01:30

// ── 밀도 ──

test("서랍장: 마감 순서대로 하루 3시간 칸에 채운 뒤 남는 칸이 적은 순, 마감 없는 일은 맨 뒤, 끝낸 일은 뺀다", () => {
  const tasks = [
    { id: 1, title: "B", due: "2026-11-12", minutes: 360 }, // 칸 3일(오늘·내일·모레) − 채울 양 540분 = 0
    { id: 2, title: "A", due: "2026-11-10T23:59:00+09:00", minutes: 120 }, // 저녁 마감이라 오늘 1칸
    { id: 3, title: "C", due: "2026-11-11T09:00:00+09:00", minutes: 60 }, // 아침 마감이라 오늘 1칸. A와 같이 세면 1칸 − 180분 = 0
    { id: 4, title: "D", due: null, minutes: 30 },
    { id: 5, title: "E", due: "2026-11-20", minutes: null }, // 모르면 60분: 11칸 − 600분 = 7.7일
    { id: 6, title: "끝남", due: "2026-11-10", minutes: 30, done: 1 },
  ];
  const ranked = rankTasks(tasks, NIGHT);
  assert.deepEqual(ranked.map((t) => t.title), ["A", "C", "B", "E", "D"]);
  assert.deepEqual(ranked.map((t) => t.slack_days), [0, 0, 0, 7.7, null]);
  assert.equal(ranked[3].minutes, null, "모르는 걸리는 시간은 그대로 null로 돌려준다");

  // 큰 일이 뒤에 있으면 그게 먼저 올라온다(지금 시작해야 해서)
  const big = rankTasks([{ id: 1, title: "작은 일", due: "2026-11-11", minutes: 60 }, { id: 2, title: "큰 일", due: "2026-11-12", minutes: 900 }], NIGHT);
  assert.deepEqual(big.map((t) => [t.title, t.slack_days]), [["큰 일", -2.3], ["작은 일", 1.7]]);
});

test("몰린 주 경고: 모자라면 몇 시간 모자란지, 다 들어가도 한 주에 몰리면 미리 시작", () => {
  const light = rankTasks([{ id: 1, title: "보고서", due: "2026-11-13", minutes: 300 }], NIGHT);
  assert.equal(crowdedWarning(light, NIGHT), null);
  const heavy = rankTasks([{ id: 1, title: "보고서", due: "2026-11-13", minutes: 1500 }], NIGHT); // 4칸 720분
  assert.equal(crowdedWarning(heavy, NIGHT), "이번 주 마감까지 하루 3시간으로는 약 13시간 모자라요");
  const nextWeek = rankTasks(
    [
      { id: 1, title: "발표 준비", due: "2026-11-18", minutes: 700 },
      { id: 2, title: "레포트", due: "2026-11-18", minutes: 700 },
    ],
    NIGHT,
  ); // 9칸 1620분이라 들어가지만 다음 주에 1400분이 몰림
  assert.equal(crowdedWarning(nextWeek, NIGHT), "다음 주 마감인 할 일이 약 23시간 몰려 있어요. 미리 시작해 두세요");
  const overdue = rankTasks([{ id: 1, title: "놓친 퀴즈", due: "2026-11-09T23:59:00+09:00", minutes: 30 }], NIGHT);
  assert.equal(crowdedWarning(overdue, NIGHT), "마감이 지난 할 일이 있어요: 놓친 퀴즈");
});

// ── 밤 정리 ──

function seed() {
  const DB = fakeD1();
  const user = addUser(DB);
  const q = (sql, ...a) => DB.sqlite.prepare(sql).run(...a).lastInsertRowid;
  const ids = {
    m1: q("INSERT INTO memos (user_id, text, created_at) VALUES (?, ?, ?)", user.id, "유기화학 과제 다음주 월요일까지", "2026-11-09T14:02:00+09:00"),
    m2: q("INSERT INTO memos (user_id, text, created_at) VALUES (?, ?, ?)", user.id, "오늘 동아리 사람들 좋았음", "2026-11-09T21:05:00+09:00"),
    m3: q("INSERT INTO memos (user_id, text, created_at, handled) VALUES (?, ?, ?, 1)", user.id, "이미 일정으로 저장한 메모", "2026-11-09T10:00:00+09:00"),
    t1: q("INSERT INTO tasks (user_id, title, due, source, ext_id) VALUES (?, ?, ?, 'etl', 'uid-1')", user.id, "[예시] 3주차 퀴즈", "2026-11-12T23:59:00+09:00"),
    t2: q("INSERT INTO tasks (user_id, title, due, minutes, source, ext_id) VALUES (?, ?, ?, 30, 'etl', 'uid-2')", user.id, "[예시] 출석 확인", "2026-11-11"),
  };
  q("INSERT INTO events (user_id, title, start, source, ext_id) VALUES (?, '스터디', '2026-11-10T15:00:00+09:00', 'ics', 'e1')", user.id);
  q("INSERT INTO events (user_id, title, start, source, ext_id) VALUES (?, '종일 행사', '2026-11-10', 'ics', 'e2')", user.id);
  q("INSERT INTO events (user_id, title, start, source, ext_id) VALUES (?, '내일 일', '2026-11-11T10:00:00+09:00', 'ics', 'e3')", user.id);
  return { DB, user, ids };
}

function aiReply(input) {
  return new Response(
    JSON.stringify({ model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", name: "answer", input }], usage: { input_tokens: 900, output_tokens: 150 } }),
    { status: 200 },
  );
}

test("밤 정리: 메모 → 할 일(쓴 말 그대로, 마감은 쓴 시각 기준 정규식), 걸리는 시간 채우기, 브리핑 저장", async () => {
  const { DB, user, ids } = seed();
  const env = { DB, ANTHROPIC_API_KEY: "k" };
  const sent = [];
  const fetch = async (_u, init) => {
    sent.push(JSON.parse(init.body));
    return aiReply({
      memos: [
        { id: ids.m1, is_task: true, title: "유기화학 과제", due: "2026-11-23", minutes: 120, ready: "now" }, // AI 마감이 틀려도 정규식(11-16)이 이긴다
        { id: ids.m2, is_task: false, title: "오늘 동아리 사람들 좋았음", due: "?", minutes: 0, ready: "now" },
        { id: 999, is_task: true, title: "보내지 않은 메모", due: "?", minutes: 60, ready: "now" },
      ],
      tasks: [
        { id: ids.t1, minutes: 30, ready: "after" },
        { id: ids.t2, minutes: 999, ready: "now" }, // 걸리는 시간이 이미 있는 할 일은 안 바꾼다
      ],
    });
  };

  const card = await runNight(env, user.id, NIGHT, { fetch });

  // 보낸 것
  assert.equal(sent.length, 1);
  assert.equal(sent[0].model, "claude-sonnet-5-5");
  const msg = sent[0].messages[0].content;
  assert.match(msg, /^지금: 2026-11-10 \(화\) 01:30/);
  assert.match(msg, new RegExp(`- ${ids.m1} · 2026-11-09 \\(월\\) 14:02 · 유기화학 과제 다음주 월요일까지`));
  assert.ok(!msg.includes("이미 일정으로 저장한 메모"), "처리된 메모는 안 보낸다");
  assert.match(msg, new RegExp(`- ${ids.t1} · \\[예시\\] 3주차 퀴즈 · 2026-11-12T23:59:00\\+09:00`));
  assert.ok(!msg.includes("출석 확인"), "걸리는 시간이 있는 할 일은 안 보낸다");

  // DB
  const tasks = DB.sqlite.prepare("SELECT id, title, due, minutes, ready, source, ext_id FROM tasks ORDER BY id").all().map((r) => ({ ...r }));
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks[2], { id: tasks[2].id, title: "유기화학 과제", due: "2026-11-16", minutes: 120, ready: 1, source: "memo", ext_id: `memo:${ids.m1}` });
  assert.deepEqual([tasks[0].minutes, tasks[0].ready], [30, 0]);
  assert.equal(tasks[1].minutes, 30);
  const handled = DB.sqlite.prepare("SELECT id, handled FROM memos ORDER BY id").all().map((r) => r.handled);
  assert.deepEqual(handled, [1, 1, 1]);

  // 브리핑
  assert.equal(card.date, "2026-11-10");
  assert.equal(card.by, "night");
  assert.deepEqual(card.events.map((e) => e.title), ["종일 행사", "스터디"]);
  assert.deepEqual(card.top3.map((t) => t.title), ["[예시] 출석 확인", "[예시] 3주차 퀴즈", "유기화학 과제"]);
  assert.equal(card.postpone, null);
  assert.deepEqual(card.new_tasks, [{ id: tasks[2].id, title: "유기화학 과제", memo: "유기화학 과제 다음주 월요일까지" }]); // 근거 = 원문 메모
  assert.deepEqual(card.top3.map((t) => t.source), ["etl", "etl", "memo"]);
  const stored = JSON.parse(DB.sqlite.prepare("SELECT text FROM briefings WHERE user_id = ? AND date = ?").get(user.id, "2026-11-10").text);
  assert.deepEqual(stored, card);
  assert.deepEqual(DB.sqlite.prepare("SELECT action FROM log ORDER BY id").all().map((r) => r.action), ["night_run", "llm"]);

  // 다시 돌리면: 보낼 것이 없어서 AI를 안 부르고, 할 일도 늘지 않는다
  await runNight(env, user.id, NIGHT, { fetch });
  assert.equal(sent.length, 1);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM tasks").get().n, 3);
});

test("키가 없거나 AI가 실패하면 메모는 다음 밤으로 남기고 브리핑만 만든다", async () => {
  const { DB, user } = seed();
  const noKey = await runNight({ DB }, user.id, NIGHT);
  assert.equal(noKey.by, "night");
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM memos WHERE handled = 0").get().n, 2);

  const failing = async () => new Response("bad request", { status: 400 });
  await runNight({ DB, ANTHROPIC_API_KEY: "k" }, user.id, NIGHT, { fetch: failing });
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM memos WHERE handled = 0").get().n, 2);
  assert.equal(DB.sqlite.prepare("SELECT action FROM log WHERE action = 'llm_fail'").all().length, 1);
});

test("Cron: 모든 사용자에게 한 번씩 브리핑 (한국 날짜로 저장)", async () => {
  const { DB } = seed();
  addUser(DB, { email: "two@example.com", googleSub: "sub-two" });
  await scheduled({ scheduledTime: Date.parse("2026-11-09T16:30:00Z"), cron: "30 16 * * *" }, { DB }, fakeCtx());
  const rows = DB.sqlite.prepare("SELECT user_id, date FROM briefings ORDER BY user_id").all();
  assert.deepEqual(rows.map((r) => r.date), ["2026-11-10", "2026-11-10"]);
});

// ── 주소 ──

const call = (env, user, method, path, ctx = fakeCtx()) =>
  handle(new Request(`https://x.test${path}`, { method }), env, ctx, user).then(async (r) => ({ status: r.status, body: await r.json(), ctx }));

test("주소: 브리핑 열기(밤 정리 전이면 바로 만듦) · 순서 · 지금 돌리기 · 10분 3번 제한", async () => {
  const { DB, user } = seed();
  const env = { DB };
  assert.equal((await call(env, null, "GET", "/api/briefing")).status, 401);
  assert.equal((await call(env, user, "GET", "/api/briefing/nope")).status, 404);

  const first = await call(env, user, "GET", "/api/briefing");
  await first.ctx.settle();
  assert.equal(first.body.briefing.by, "now");
  assert.equal(DB.sqlite.prepare("SELECT action FROM log").get().action, "briefing_open");

  const rank = await call(env, user, "GET", "/api/briefing/rank");
  assert.deepEqual(rank.body.tasks.map((t) => t.title).sort(), ["[예시] 3주차 퀴즈", "[예시] 출석 확인"]);
  assert.ok("warning" in rank.body);

  for (let i = 0; i < 3; i++) assert.equal((await call(env, user, "POST", "/api/briefing/run")).status, 200);
  assert.equal((await call(env, user, "POST", "/api/briefing/run")).status, 429);

  const stored = await call(env, user, "GET", "/api/briefing");
  assert.equal(stored.body.briefing.by, "night");

  // 저장된 글이 카드 모양이 아니면(손으로 넣은 글 등) 지금 다시 만든다
  DB.sqlite.prepare("UPDATE briefings SET text = '시험용 글' WHERE user_id = ?").run(user.id);
  const rebuilt = await call(env, user, "GET", "/api/briefing");
  assert.equal(rebuilt.status, 200);
  assert.equal(rebuilt.body.briefing.by, "now");
});
