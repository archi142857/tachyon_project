// worker/4_night.js 테스트. 실제 API는 부르지 않는다(가짜 fetch), DB는 schema.sql로 만든 가짜 D1. 자료는 모두 지어낸 예시.
// 실행: node --test "worker/test/*.test.js"

import test from "node:test";
import assert from "node:assert/strict";
import { handle, scheduled, runNight, rankTasks, crowdedWarning, planDays, AWAKE_MIN } from "../4_night.js";
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
  assert.equal(crowdedWarning(overdue, NIGHT), "마감이 지난 할 일이 있어요: 놓친 퀴즈. 끝났으면 체크해 주세요");
  // 여럿이면 개수와 가장 최근에 지난 것 하나 (eTL 주소만 붙이면 지난 과제가 끝남 표시 없이 들어온다)
  const many = rankTasks(
    [
      { id: 1, title: "[예시] 1주차 과제", due: "2026-10-20T23:59:00+09:00" },
      { id: 2, title: "[예시] 5주차 과제", due: "2026-11-09T23:59:00+09:00" },
      { id: 3, title: "[예시] 3주차 과제", due: "2026-11-02T23:59:00+09:00" },
      { id: 4, title: "다음 주 발표", due: "2026-11-18", minutes: 60 },
    ],
    NIGHT,
  );
  assert.equal(crowdedWarning(many, NIGHT), "마감이 지난 할 일이 3개 있어요: [예시] 5주차 과제 등. 끝났으면 체크해 주세요");
});

test("걸리는 시간 채우기는 마감이 다가오는 것부터(지난 것은 맨 뒤), 브리핑에 여러 날 이어지는 하루 종일 일정도", async () => {
  const DB = fakeD1();
  const user = addUser(DB);
  const q = (sql, ...a) => DB.sqlite.prepare(sql).run(...a).lastInsertRowid;
  // 지어낸 예시. id 순서는 일부러 지난 것 → 마감 없음 → 다가오는 것
  const old = q("INSERT INTO tasks (user_id, title, due, source, ext_id) VALUES (?, '[예시] 지난 과제', '2026-10-28T23:59:00+09:00', 'etl', 'u1')", user.id);
  const none = q("INSERT INTO tasks (user_id, title, source, ext_id) VALUES (?, '[예시] 마감 없는 일', 'memo', 'u2')", user.id);
  const soon = q("INSERT INTO tasks (user_id, title, due, source, ext_id) VALUES (?, '[예시] 금요일 퀴즈', '2026-11-13T23:59:00+09:00', 'etl', 'u3')", user.id);
  const sooner = q("INSERT INTO tasks (user_id, title, due, source, ext_id) VALUES (?, '[예시] 오늘 실습', '2026-11-10T18:00:00+09:00', 'etl', 'u4')", user.id);
  q("INSERT INTO events (user_id, title, start, \"end\", source, ext_id) VALUES (?, '[예시] 학회 여행', '2026-11-09', '2026-11-12', 'ics', 'e1')", user.id); // 9~11일
  q("INSERT INTO events (user_id, title, start, \"end\", source, ext_id) VALUES (?, '[예시] 어제 끝난 일', '2026-11-08', '2026-11-10', 'ics', 'e2')", user.id); // 8~9일
  q("INSERT INTO events (user_id, title, start, \"end\", source, ext_id) VALUES (?, '[예시] 어젯밤 회식', '2026-11-09T23:00:00+09:00', '2026-11-10T01:00:00+09:00', 'ics', 'e3')", user.id);
  let sent;
  const fetch = async (_u, init) => ((sent = JSON.parse(init.body).messages[0].content), aiReply({ memos: [], tasks: [] }));
  const card = await runNight({ DB, ANTHROPIC_API_KEY: "k" }, user.id, NIGHT, { fetch });
  const order = [...sent.matchAll(/^- (\d+) · /gm)].map((m) => Number(m[1]));
  assert.deepEqual(order, [sooner, soon, none, old]);
  assert.deepEqual(card.events.map((e) => e.title), ["[예시] 학회 여행"]); // 끝난 여러 날 일정·어젯밤 일정은 빼고
});

// ── 고르게 나누기 (planDays) ──

const T = (id, title, due, minutes) => ({ id, title, due, minutes, ready: 1, source: "memo" }); // 지어낸 예시
const sumOf = (days, key) => days.reduce((n, d) => n + d[key], 0);
const minOf = (days, id) => days.reduce((n, d) => n + (d.items.find((x) => x.task_id === id)?.min ?? 0), 0);

test("고르게 나누기: 가장 덜 찬 날부터 15분씩, 일정이 많은 날은 덜, 몰아서 할 때와 견줌", () => {
  // 화 01:30. 목요일 23:59 마감 360분 → 화·수·목 사흘에 120분씩. 몰아서 하면 목요일에 360분
  const even = planDays([T(1, "[예시] 레포트", "2026-11-12T23:59:00+09:00", 360)], [], NIGHT, { days: 7 });
  assert.equal(even.days.length, 7);
  assert.deepEqual(even.days.slice(0, 3).map((d) => d.task_min), [120, 120, 120]);
  assert.deepEqual(even.days.slice(0, 3).map((d) => d.cram_min), [0, 0, 360]);
  assert.equal(sumOf(even.days.slice(3), "task_min"), 0);
  assert.deepEqual(even.days[0].items, [{ task_id: 1, min: 120 }]);
  assert.equal(even.days[0].event_min, 0);
  assert.equal(even.days[0].room_min, AWAKE_MIN); // 01:30이면 오늘도 7시부터 하루 전부

  // 수요일에 6시간 일정(겹친 1시간은 한 번만) → 수요일엔 덜 넣는다(일정 + 할 일이 고르게)
  const events = [
    { start: "2026-11-11T09:00:00+09:00", end: "2026-11-11T13:00:00+09:00" },
    { start: "2026-11-11T12:00:00+09:00", end: "2026-11-11T15:00:00+09:00" },
    { start: "2026-11-11", end: "2026-11-12" }, // 하루 종일 일정은 시간을 차지하지 않는다
  ];
  const busy = planDays([T(1, "[예시] 레포트", "2026-11-12T23:59:00+09:00", 360)], events, NIGHT, { days: 7 });
  assert.equal(busy.days[1].event_min, 360);
  assert.equal(busy.days[1].task_min, 0);
  assert.deepEqual([busy.days[0].task_min, busy.days[2].task_min], [180, 180]);
});

test("고르게 나누기: 편한 몫(하루 3시간) → 빠듯(빈 시간까지) → 넘침, 여유 < 0 이면 빠듯이 생긴다", () => {
  // 수요일 23:59 마감 600분: 편한 몫 화·수 180씩 = 360, 나머지 240은 빠듯(빈 시간), 여유 = (360 − 600) / 180
  const tight = planDays([T(1, "[예시] 발표 준비", "2026-11-11T23:59:00+09:00", 600)], [], NIGHT, { days: 7 });
  assert.deepEqual(tight.days.slice(0, 2).map((d) => [d.task_min, d.extra_min]), [[180, 120], [180, 120]]);
  assert.equal(tight.ranked[0].slack_days, -1.3);
  assert.equal(crowdedWarning(tight.ranked, NIGHT), "이번 주 마감까지 하루 3시간으로는 약 4시간 모자라요");
  // 빈 시간보다 많으면 마지막 날에 넘침
  const over = planDays([T(1, "[예시] 밤샘 과제", "2026-11-10T23:59:00+09:00", AWAKE_MIN + 60)], [], NIGHT, { days: 3 });
  assert.deepEqual([over.days[0].task_min, over.days[0].extra_min, over.days[0].over_min], [180, AWAKE_MIN - 180, 60]);
  // 여유가 0 이상이면 빠듯·넘침은 없다(마감 이른 것부터 나누면 편한 몫에 다 들어갈 때는 늘 다 들어간다)
  const fits = planDays(
    [T(1, "[예시] 퀴즈", "2026-11-10T23:59:00+09:00", 120), T(2, "[예시] 레포트", "2026-11-12T23:59:00+09:00", 380), T(3, "[예시] 실험 보고서", "2026-11-11T23:59:00+09:00", 30)],
    [],
    NIGHT,
    { days: 7 },
  );
  assert.ok(fits.ranked.every((t) => t.slack_days >= 0));
  assert.equal(sumOf(fits.days, "extra_min") + sumOf(fits.days, "over_min"), 0);
  assert.deepEqual([1, 2, 3].map((id) => minOf(fits.days, id)), [120, 380, 30]); // 120 + 30 + 380 = 530 ≤ 사흘 540
});

test("고르게 나누기: 정오 전 마감은 전날까지, 지난 할 일은 오늘, 마감 없는 일은 2주 안, 시간 모르면 1시간, 오늘은 지금부터", () => {
  const plan = planDays(
    [
      T(1, "[예시] 아침 제출", "2026-11-11T10:00:00+09:00", 60), // 수 10시 → 화요일까지
      T(2, "[예시] 오후 제출", "2026-11-11T15:00:00+09:00", 60), // 수 15시 → 수요일도
      T(3, "[예시] 지난 과제", "2026-11-08T23:59:00+09:00", 30),
      T(4, "[예시] 언젠가 정리", null, 600),
      T(5, "[예시] 시간 모름", "2026-11-12", null),
    ],
    [],
    NIGHT,
    { days: 21 },
  );
  const lastDayOf = (id) => plan.days.findLastIndex((d) => d.items.some((x) => x.task_id === id));
  assert.equal(lastDayOf(1), 0);
  assert.equal(lastDayOf(2), 1);
  assert.equal(lastDayOf(3), 0);
  assert.ok(lastDayOf(4) <= 13 && minOf(plan.days, 4) === 600);
  assert.equal(minOf(plan.days, 5), 60);
  assert.equal(plan.guessed, 1);
  assert.deepEqual(plan.ranked.map((t) => t.id), [3, 1, 2, 5, 4]); // 지난 것 → 여유 적은 순 → 마감 없는 일
  assert.equal(plan.ranked.find((t) => t.id === 3).slack_days, -0.2);

  const late = planDays([T(1, "[예시] 오늘 밤 과제", "2026-11-10T23:59:00+09:00", 180)], [], new Date("2026-11-10T22:00:00+09:00"), { days: 2 });
  assert.equal(late.days[0].room_min, 120); // 22시부터 자정까지
  assert.deepEqual([late.days[0].task_min, late.days[0].over_min], [120, 60]);
  assert.equal(late.ranked[0].slack_days, -0.3);
});

test("rankTasks·경고는 같은 셈, 브리핑의 미룰 것은 오늘 몫이 있는 것 가운데 여유가 가장 많은 것", async () => {
  const tasks = [
    T(1, "[예시] 퀴즈", "2026-11-10T23:59:00+09:00", 60),
    T(2, "[예시] 레포트", "2026-11-12T23:59:00+09:00", 120),
    T(3, "[예시] 발표", "2026-11-13T23:59:00+09:00", 120),
    T(4, "[예시] 기말 정리", "2026-11-30T23:59:00+09:00", 2000), // 커서 3주 동안 날마다 나뉜다(오늘 몫 있음)
    T(5, "[예시] 다음 달 일", "2026-12-20T23:59:00+09:00", 60),
  ];
  assert.deepEqual(rankTasks(tasks, NIGHT).map((t) => t.id), planDays(tasks, [], NIGHT).ranked.map((t) => t.id));
  const DB = fakeD1();
  const user = addUser(DB);
  for (const t of tasks) DB.sqlite.prepare("INSERT INTO tasks (user_id, title, due, minutes, source, ext_id) VALUES (?, ?, ?, ?, 'memo', ?)").run(user.id, t.title, t.due, t.minutes, `m${t.id}`);
  const card = await runNight({ DB }, user.id, NIGHT);
  assert.deepEqual(card.top3.map((t) => t.title), ["[예시] 퀴즈", "[예시] 레포트", "[예시] 발표"]);
  // 할 일 3개가 아닌 것 중 오늘 몫이 나뉜 것은 '기말 정리'뿐(다음 달 일은 뒤쪽 빈 날에 나뉨) → 여유가 더 많은 '다음 달 일'이 아니라 이것
  assert.ok(card.top3.every((t) => t.title !== "[예시] 기말 정리"));
  assert.equal(card.postpone.title, "[예시] 기말 정리");
  const plan = planDays(tasks, [], NIGHT);
  assert.equal(minOf(plan.days.slice(0, 1), 5), 0);
  assert.ok(minOf(plan.days.slice(0, 1), 4) > 0);
  assert.equal(card.today.event_min, 0);
  assert.ok(card.today.task_min > 0 && card.today.extra_min === 0 && card.today.over_min === 0);
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

  const plan = await call(env, user, "GET", "/api/briefing/plan");
  assert.equal(plan.body.days.length, 42);
  assert.deepEqual(Object.keys(plan.body.days[0]).sort(), ["cram_min", "date", "event_min", "extra_min", "items", "over_min", "room_min", "task_min"]);
  assert.deepEqual([plan.body.awake.minutes, plan.body.daily_min, plan.body.guessed], [1020, 180, 1]);
  assert.equal((await call(env, user, "GET", "/api/briefing/plan?days=7")).body.days.length, 7);
  assert.equal((await call(env, user, "GET", "/api/briefing/plan?days=999")).body.days.length, 42);

  for (let i = 0; i < 3; i++) assert.equal((await call(env, user, "POST", "/api/briefing/run")).status, 200);
  assert.equal((await call(env, user, "POST", "/api/briefing/run")).status, 429);
  // 10분이 지나면 다시 된다 (log.at은 schema 기본값 '+09:00' 모양)
  assert.match(DB.sqlite.prepare("SELECT at FROM log WHERE action = 'night_run'").get().at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/);
  const eleven = new Date(Date.now() + 9 * 3600e3 - 11 * 60e3).toISOString().slice(0, 19) + "+09:00";
  DB.sqlite.prepare("UPDATE log SET at = ? WHERE action = 'night_run'").run(eleven);
  assert.equal((await call(env, user, "POST", "/api/briefing/run")).status, 200);

  const stored = await call(env, user, "GET", "/api/briefing");
  assert.equal(stored.body.briefing.by, "night");

  // 저장된 글이 카드 모양이 아니면(손으로 넣은 글 등) 지금 다시 만든다
  DB.sqlite.prepare("UPDATE briefings SET text = '시험용 글' WHERE user_id = ?").run(user.id);
  const rebuilt = await call(env, user, "GET", "/api/briefing");
  assert.equal(rebuilt.status, 200);
  assert.equal(rebuilt.body.briefing.by, "now");
});

// ── 지금 정리 (POST /api/briefing/now) ──

const postNow = (env, user, body) =>
  handle(new Request("https://x.test/api/briefing/now", { method: "POST", body: JSON.stringify(body ?? {}) }), env, fakeCtx(), user).then(async (r) => ({ status: r.status, body: await r.json() }));

async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test("지금 정리: 정리 보기는 AI 한 번(메모·빈 할 일 한꺼번에)으로 안과 한 줄을 주고 아무것도 안 바꾼다", async () => {
  const { DB, user, ids } = seed();
  const env = { DB, ANTHROPIC_API_KEY: "k" };
  let calls = 0;
  let sent;
  const fake = async (_u, init) => {
    calls++;
    sent = JSON.parse(init.body).messages[0].content;
    return aiReply({
      memos: [
        { id: ids.m1, is_task: true, title: "유기화학 과제", due: "?", minutes: 120, ready: "now" },
        { id: ids.m2, is_task: false, title: "?", due: "?", minutes: 0, ready: "now" },
      ],
      tasks: [{ id: ids.t1, minutes: 45, ready: "after" }],
    });
  };
  const r = await withFetch(fake, () => postNow(env, user, {}));
  assert.equal(r.status, 200);
  assert.equal(calls, 1);
  assert.match(sent, /유기화학 과제 다음주 월요일까지/);
  assert.doesNotMatch(sent, /이미 일정으로 저장한 메모/); // 정리된 메모는 안 보낸다
  assert.deepEqual(r.body.plan.memos, [
    { id: ids.m1, text: "유기화학 과제 다음주 월요일까지", task: true, title: "유기화학 과제", due: "2026-11-16", minutes: 120, ready: "now", answered: true }, // 마감은 쓴 날짜 말(쓴 때 기준) 먼저
    { id: ids.m2, text: "오늘 동아리 사람들 좋았음", task: false, title: null, due: null, minutes: null, ready: null, answered: true },
  ]);
  assert.deepEqual(r.body.plan.tasks, [{ id: ids.t1, title: "[예시] 3주차 퀴즈", due: "2026-11-12T23:59:00+09:00", minutes: 45, ready: "after" }]);
  assert.equal(r.body.summary, "메모 2개 → 할 일 1개 · 그냥 메모 1개 · 걸리는 시간 1개 어림");
  // 바뀐 것 없음(log만)
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM tasks WHERE source = 'memo'").get().n, 0);
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM memos WHERE handled = 0").get().n, 2);
  assert.equal(DB.sqlite.prepare("SELECT minutes FROM tasks WHERE id = ?").get(ids.t1).minutes, null);
  assert.deepEqual(DB.sqlite.prepare("SELECT action FROM log ORDER BY id").all().map((x) => x.action), ["night_now", "llm"]);
  assert.match(DB.sqlite.prepare("SELECT detail FROM log WHERE action = 'llm'").get().detail, /"use":"night_now"/);
});

test("지금 정리: 이대로 정리하기는 받은 안(고친 이름·마감 포함)을 AI 없이 넣고 브리핑을 새로 만든다", async () => {
  const { DB, user, ids } = seed();
  const env = { DB, ANTHROPIC_API_KEY: "k" };
  const plan = {
    memos: [
      { id: ids.m1, text: "…", task: true, title: "유기화학 과제 마무리", due: "2026-11-14", minutes: 90, ready: "now", answered: true }, // 사람이 이름·마감을 고침
      { id: ids.m2, task: false, answered: true },
      { id: ids.m3, task: true, title: "이미 넣은 것", due: "2026-11-20", answered: true }, // 이미 정리된 메모 → 건너뜀
      { id: 9999, task: true, title: "남의 메모", answered: true }, // 없는 메모 → 건너뜀
    ],
    tasks: [{ id: ids.t1, minutes: 45, ready: "after" }, { id: ids.t2, minutes: 10 }], // t2는 이미 시간이 있다 → 그대로
  };
  let calls = 0;
  const r = await withFetch(async () => (calls++, aiReply({})), () => postNow(env, user, { apply: plan }));
  assert.equal(r.status, 200);
  assert.equal(calls, 0); // AI 다시 안 부름
  const made = DB.sqlite.prepare("SELECT title, due, minutes, ready, ext_id FROM tasks WHERE source = 'memo'").all();
  assert.deepEqual(made.map((t) => ({ ...t })), [{ title: "유기화학 과제 마무리", due: "2026-11-14", minutes: 90, ready: 1, ext_id: `memo:${ids.m1}` }]);
  assert.deepEqual(DB.sqlite.prepare("SELECT id FROM memos WHERE handled = 0").all(), []);
  assert.deepEqual({ ...DB.sqlite.prepare("SELECT minutes, ready FROM tasks WHERE id = ?").get(ids.t1) }, { minutes: 45, ready: 0 });
  assert.equal(DB.sqlite.prepare("SELECT minutes FROM tasks WHERE id = ?").get(ids.t2).minutes, 30);
  assert.equal(r.body.briefing.by, "now");
  assert.deepEqual(r.body.briefing.new_tasks.map((t) => [t.title, t.memo]), [["유기화학 과제 마무리", "유기화학 과제 다음주 월요일까지"]]);
  assert.deepEqual(r.body.applied, { memos: 2, tasks: 1, minutes: 1 });
  assert.equal(r.body.summary, "메모 2개 → 할 일 1개 · 그냥 메모 1개 · 걸리는 시간 1개 어림");
  assert.ok(DB.sqlite.prepare("SELECT text FROM briefings WHERE user_id = ?").get(user.id).text.includes('"by":"now"'));
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM log WHERE action = 'night_now_apply'").get().n, 1);
  // 다시 넣어도 두 번 생기지 않는다
  await postNow(env, user, { apply: plan });
  assert.equal(DB.sqlite.prepare("SELECT count(*) AS n FROM tasks WHERE source = 'memo'").get().n, 1);
  assert.equal((await postNow(env, user, { apply: { memos: [], tasks: [] } })).status, 400);
});

test("지금 정리: 정리할 것이 없으면 AI를 안 부르고, 키가 없으면 503, AI가 실패하면 502, 10분에 5번까지", async () => {
  const empty = fakeD1();
  const nobody = addUser(empty);
  let calls = 0;
  const count = async () => (calls++, aiReply({ memos: [], tasks: [] }));
  const none = await withFetch(count, () => postNow({ DB: empty, ANTHROPIC_API_KEY: "k" }, nobody, {}));
  assert.deepEqual([none.status, none.body.summary, calls], [200, "정리할 메모가 없어요", 0]);

  const { DB, user } = seed();
  assert.equal((await postNow({ DB }, user, {})).status, 503);
  const env = { DB, ANTHROPIC_API_KEY: "k" };
  const fail = await withFetch(async () => new Response("bad", { status: 400 }), () => postNow(env, user, {}));
  assert.equal(fail.status, 502);
  assert.match(DB.sqlite.prepare("SELECT detail FROM log WHERE action = 'llm_fail'").get().detail, /night_now/);
  for (let i = 0; i < 4; i++) assert.equal((await withFetch(count, () => postNow(env, user, {}))).status, 200);
  assert.equal((await withFetch(count, () => postNow(env, user, {}))).status, 429); // 실패한 1번 + 4번 = 5번
  assert.equal((await postNow(null, null, {}).catch(() => ({ status: 401 }))).status, 401);
});
