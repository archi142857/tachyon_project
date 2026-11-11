// 10_together.js 시험 (담당: 서버 세션). 사람·일정은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { TOGETHER_SQL, availability, bestTimes, slotStarts } from '../10_together.js';
import { makeSessionCookie } from '../lib/auth.js';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';

const ORIGIN = 'https://tachyon.example.invalid';
const NOW = Date.parse('2026-11-12T03:00:00Z'); // 한국 11/12(목) 12:00
const realNow = Date.now;
test.before(() => {
  Date.now = () => NOW;
});
test.after(() => {
  Date.now = realNow;
});

async function setup({ tables = true } = {}) {
  const env = makeEnv();
  if (tables) env.DB.sqlite.exec(TOGETHER_SQL);
  const people = {};
  for (const [key, name] of [['a', '예시 가'], ['b', '예시 나'], ['c', '예시 다'], ['d', '예시 라']]) {
    const user = await addTestUser(env, { sub: `sub-${key}`, email: `${key}@example.invalid`, name });
    const cookie = (await makeSessionCookie(env, user.id)).split(';')[0];
    people[key] = { ...user, cookie };
  }
  return { env, ...people };
}

async function call(env, who, path, { method = 'GET', body } = {}) {
  const headers = { origin: ORIGIN };
  if (who) headers.cookie = who.cookie;
  const res = await worker.fetch(new Request(`${ORIGIN}/api/together${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, makeCtx());
  return { status: res.status, data: await res.json() };
}

const addEvent = (env, user, title, start, end, extra = {}) =>
  env.DB.sqlite
    .prepare('INSERT INTO events (user_id, title, start, "end", place, source, ext_id, moved_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(user.id, title, start, end, extra.place ?? null, extra.source ?? 'memo', extra.extId ?? `${title}-${start}`, extra.movedTo ?? null);

async function befriend(env, from, to) {
  const inv = await call(env, from, '/invite', { method: 'POST' });
  return call(env, to, '/join', { method: 'POST', body: { code: inv.data.code } });
}

test('표가 원격 D1에 아직 없으면 503, 로그인 안 하면 401', async () => {
  const { env, a } = await setup({ tables: false });
  assert.equal((await call(env, a, '')).status, 503);
  assert.equal((await call(env, null, '')).status, 401);
});

test('친구: 링크 만들기 → 미리 보기 → 친구 되기(둘 다에게 보임) → 끊기. 내 링크·없는 링크·지난 링크', async () => {
  const { env, a, b } = await setup();
  const inv = await call(env, a, '/invite', { method: 'POST' });
  assert.equal(inv.status, 200);
  assert.match(inv.data.code, /^[\w-]{22}$/);
  assert.equal(inv.data.url, `${ORIGIN}/?join=${inv.data.code}`);
  assert.equal(inv.data.expiresAt, '2026-11-19T12:00:00+09:00');

  assert.deepEqual((await call(env, b, `/join/${inv.data.code}`)).data, { ok: true, kind: 'friend', from: { name: '예시 가' }, mine: false });
  assert.equal((await call(env, a, '/join', { method: 'POST', body: { code: inv.data.code } })).status, 400); // 내 링크
  const joined = await call(env, b, '/join', { method: 'POST', body: { code: inv.data.code } });
  assert.deepEqual(joined.data, { ok: true, kind: 'friend', friend: { id: a.id, name: '예시 가' } });
  assert.equal((await call(env, b, '/join', { method: 'POST', body: { code: inv.data.code } })).status, 200); // 두 번 눌러도 그대로

  assert.deepEqual((await call(env, a, '')).data.friends, [{ id: b.id, name: '예시 나' }]);
  assert.deepEqual((await call(env, b, '')).data.friends, [{ id: a.id, name: '예시 가' }]);
  const overview = JSON.stringify((await call(env, b, '')).data);
  assert.ok(!overview.includes('@example.invalid'), '이메일은 남에게 안 보낸다');

  assert.equal((await call(env, b, '/join/nothing-like-this-code')).status, 404);
  env.DB.sqlite.prepare("UPDATE invites SET expires_at = '2026-11-12T11:59:59+09:00'").run();
  assert.equal((await call(env, b, '/join', { method: 'POST', body: { code: inv.data.code } })).status, 410);

  assert.equal((await call(env, b, `/friends/${a.id}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual((await call(env, a, '')).data.friends, []);
  assert.equal((await call(env, b, `/friends/${a.id}`, { method: 'DELETE' })).status, 404);
});

test('그룹: 만들기·링크로 들어오기·친구 바로 넣기·이름(방장만)·내보내기·남은 못 봄', async () => {
  const { env, a, b, c, d } = await setup();
  await befriend(env, a, c);
  const made = await call(env, a, '/groups', { method: 'POST', body: { name: '  예시   스터디  ' } });
  assert.deepEqual(made.data.group, { id: made.data.group.id, name: '예시 스터디', owner: true, members: 1 });
  const g = made.data.group.id;
  assert.equal((await call(env, a, '/groups', { method: 'POST', body: { name: '' } })).status, 400);

  const inv = await call(env, a, `/groups/${g}/invite`, { method: 'POST' });
  assert.deepEqual((await call(env, b, `/join/${inv.data.code}`)).data, { ok: true, kind: 'group', from: { name: '예시 가' }, mine: false, group: { name: '예시 스터디', members: 1 } });
  assert.deepEqual((await call(env, b, '/join', { method: 'POST', body: { code: inv.data.code } })).data, { ok: true, kind: 'group', group: { id: g, name: '예시 스터디' } });
  assert.equal((await call(env, a, `/groups/${g}/members`, { method: 'POST', body: { friendId: c.id } })).status, 200);
  assert.equal((await call(env, a, `/groups/${g}/members`, { method: 'POST', body: { friendId: d.id } })).status, 404); // 친구 아님

  const shown = await call(env, b, `/groups/${g}`);
  assert.deepEqual(shown.data.group, { id: g, name: '예시 스터디', owner: false });
  assert.deepEqual(shown.data.members.map((m) => [m.name, m.owner, m.me]), [['예시 가', true, false], ['예시 나', false, true], ['예시 다', false, false]]);
  assert.equal((await call(env, d, `/groups/${g}`)).status, 404); // 멤버가 아니면 없는 것처럼
  assert.equal((await call(env, d, `/groups/${g}/invite`, { method: 'POST' })).status, 404);

  assert.equal((await call(env, b, `/groups/${g}`, { method: 'PATCH', body: { name: '바꿈' } })).status, 403);
  assert.equal((await call(env, a, `/groups/${g}`, { method: 'PATCH', body: { name: '예시 모임' } })).data.group.name, '예시 모임');
  assert.equal((await call(env, b, `/groups/${g}/members/${c.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await call(env, a, `/groups/${g}/members/${c.id}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual((await call(env, a, '')).data.groups, [{ id: g, name: '예시 모임', owner: true, members: 2 }]);
});

test('나가기: 방장이 나가면 다음 멤버가 방장, 마지막 사람이 나가면 그룹이 지워진다', async () => {
  const { env, a, b } = await setup();
  const g = (await call(env, a, '/groups', { method: 'POST', body: { name: '예시 그룹' } })).data.group.id;
  const inv = await call(env, a, `/groups/${g}/invite`, { method: 'POST' });
  await call(env, b, '/join', { method: 'POST', body: { code: inv.data.code } });
  assert.equal((await call(env, a, `/groups/${g}/members/me`, { method: 'DELETE' })).status, 200);
  assert.equal((await call(env, b, `/groups/${g}`)).data.group.owner, true);
  assert.equal((await call(env, b, `/groups/${g}/members/me`, { method: 'DELETE' })).status, 200);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) n FROM groups').get().n, 0);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) n FROM invites').get().n, 0); // 그룹 링크도 같이
});

/** 가·나·다가 든 그룹 + 11/16(월)~11/17(화) 09:00~12:00, 30분 칸, 모임 1시간 */
async function meetSetup() {
  const s = await setup();
  const { env, a, b, c } = s;
  const g = (await call(env, a, '/groups', { method: 'POST', body: { name: '예시 그룹' } })).data.group.id;
  const inv = await call(env, a, `/groups/${g}/invite`, { method: 'POST' });
  await call(env, b, '/join', { method: 'POST', body: { code: inv.data.code } });
  await call(env, c, '/join', { method: 'POST', body: { code: inv.data.code } });
  const made = await call(env, a, `/groups/${g}/meets`, { method: 'POST', body: { title: '예시 회의', from: '2026-11-16', to: '2026-11-17', dayStart: '09:00', dayEnd: '12:00', slot: 30, length: 60 } });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  return { ...s, g, meetId: made.data.meet.id };
}

test('모임 시간표 만들기: 잘못된 값은 알아듣는 문장으로 400', async () => {
  const { env, a, g } = await meetSetup();
  const bad = async (body) => (await call(env, a, `/groups/${g}/meets`, { method: 'POST', body: { title: '예시', from: '2026-11-16', to: '2026-11-17', ...body } })).status;
  assert.equal(await bad({ to: '2026-12-01' }), 400); // 14일 넘음
  assert.equal(await bad({ to: '2026-11-15' }), 400); // 끝이 앞
  assert.equal(await bad({ from: '2026-11-01', to: '2026-11-11' }), 400); // 지난 날짜
  assert.equal(await bad({ slot: 20 }), 400);
  assert.equal(await bad({ dayStart: '09:15' }), 400); // 30분 단위 아님
  assert.equal(await bad({ length: 45 }), 400);
  assert.equal(await bad({ title: '' }), 400);
  assert.equal(await bad({}), 200); // 나머지는 기본값(09:00~22:00, 30분, 1시간)
});

test('모임 시간표: 달력으로 바쁨을 세고(종일·옮긴 일정 빼고), 남에게는 빈/바쁨만, 달력 없는 사람은 모름', async () => {
  const { env, a, b, c, meetId } = await meetSetup();
  addEvent(env, a, '예시 비밀 수업', '2026-11-16T10:00:00+09:00', '2026-11-16T11:15:00+09:00', { place: '예시 비밀 강의실', source: 'google' });
  addEvent(env, a, '예시 종일 행사', '2026-11-17', '2026-11-18'); // 종일은 바쁨 아님
  addEvent(env, a, '예시 옮긴 일정', '2026-11-17T09:00:00+09:00', '2026-11-17T10:00:00+09:00', { movedTo: 999 });
  addEvent(env, b, '예시 지난주 일정', '2026-11-05T09:00:00+09:00', '2026-11-05T10:00:00+09:00'); // 달력은 있음, 이 기간엔 빔
  // 다(c)는 달력도 칠한 칸도 없음 → 모름

  const { status, data } = await call(env, b, `/meets/${meetId}`);
  assert.equal(status, 200);
  assert.equal(data.slots.length, 12); // 이틀 × 6칸
  assert.equal(data.known, 2);
  assert.equal(data.unknown, 1);
  assert.deepEqual(data.members.map((m) => [m.name, m.known, m.me]), [['예시 가', true, false], ['예시 나', true, true], ['예시 다', false, false]]);
  const at = (iso) => data.slots.find((x) => x.start === iso);
  assert.deepEqual(at('2026-11-16T09:30:00+09:00'), { start: '2026-11-16T09:30:00+09:00', free: 2, who: [a.id, b.id], me: 'free', mark: null });
  for (const t of ['10:00', '10:30', '11:00']) assert.deepEqual(at(`2026-11-16T${t}:00+09:00`).who, [b.id], t); // 가는 수업(10:00~11:15)
  assert.equal(at('2026-11-17T09:00:00+09:00').free, 2); // 옮긴 일정·종일은 바쁨 아님
  const text = JSON.stringify(data);
  for (const secret of ['비밀', 'google', '@example.invalid']) assert.ok(!text.includes(secret), `${secret}이 새면 안 됨`);

  // 후보: 1시간(두 칸) 이어서 되는 사람이 많은 순, 겹치지 않게 3개, 시간 순
  assert.deepEqual(data.best.map((x) => [x.start.slice(5, 16), x.end.slice(11, 16), x.free]), [
    ['11-16T09:00', '10:00', 2],
    ['11-17T09:00', '10:00', 2],
    ['11-17T10:00', '11:00', 2],
  ]);
  assert.equal(data.meet.canDelete, false);
  assert.equal((await call(env, c, `/meets/${meetId}`)).data.slots[0].me, 'busy'); // 달력 없는 사람은 칠하기 전엔 다 안 됨(when2meet처럼)
});

test('내 칸 칠하기: free·busy는 달력보다 먼저, null이면 달력대로. 없는 칸은 400', async () => {
  const { env, a, c, d, meetId } = await meetSetup();
  addEvent(env, a, '예시 수업', '2026-11-16T09:00:00+09:00', '2026-11-16T10:00:00+09:00');
  const put = (who, marks) => call(env, who, `/meets/${meetId}/marks`, { method: 'PUT', body: { marks } });

  // 다: 달력이 없어도 칠하면 셈에 들어간다
  let res = await put(c, [{ start: '2026-11-16T09:00:00+09:00', state: 'free' }, { start: '2026-11-16T09:30:00+09:00', state: 'free' }, { start: '2026-11-16T10:00:00+09:00', state: 'busy' }]);
  assert.equal(res.status, 200);
  assert.equal(res.data.known, 2); // 가(달력)·다(칠함), 나는 아직 모름
  const slot = (data, iso) => data.slots.find((x) => x.start === iso);
  assert.deepEqual(slot(res.data, '2026-11-16T09:00:00+09:00'), { start: '2026-11-16T09:00:00+09:00', free: 1, who: [c.id], me: 'free', mark: 'free' });
  assert.equal(slot(res.data, '2026-11-16T10:00:00+09:00').who.includes(c.id), false);
  assert.equal(slot(res.data, '2026-11-16T11:00:00+09:00').who.includes(c.id), false); // 달력 없는 사람은 칠한 '된다' 칸만
  assert.equal(slot(res.data, '2026-11-16T11:00:00+09:00').who.includes(a.id), true); // 달력 있는 사람의 안 칠한 칸은 달력대로(비어 있음)

  // 가: 수업 시간을 '된다'로 칠하면 달력보다 먼저
  res = await put(a, [{ start: '2026-11-16T09:00:00+09:00', state: 'free' }]);
  assert.deepEqual(slot(res.data, '2026-11-16T09:00:00+09:00').who, [a.id, c.id]);
  res = await put(a, [{ start: '2026-11-16T09:00:00+09:00', state: null }]);
  assert.deepEqual(slot(res.data, '2026-11-16T09:00:00+09:00').who, [c.id]);
  assert.equal(slot(res.data, '2026-11-16T09:00:00+09:00').mark, null);

  assert.equal((await put(c, [{ start: '2026-11-16T12:00:00+09:00', state: 'free' }])).status, 400); // 하루 끝 밖
  assert.equal((await put(c, [{ start: '2026-11-16T09:00:00+09:00', state: 'maybe' }])).status, 400);
  assert.equal((await put(d, [{ start: '2026-11-16T09:00:00+09:00', state: 'free' }])).status, 404); // 그룹 밖
});

test('모임 지우기는 만든 사람이나 방장만', async () => {
  const { env, a, b, g } = await meetSetup();
  const mine = (await call(env, b, `/groups/${g}/meets`, { method: 'POST', body: { title: '예시 나의 모임', from: '2026-11-20', to: '2026-11-20' } })).data.meet.id;
  const aMeet = (await call(env, a, `/groups/${g}`)).data.meets.find((m) => m.title === '예시 회의').id;
  assert.equal((await call(env, b, `/meets/${aMeet}`, { method: 'DELETE' })).status, 403);
  assert.equal((await call(env, b, `/meets/${mine}`, { method: 'DELETE' })).status, 200);
  assert.equal((await call(env, a, `/meets/${aMeet}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual((await call(env, a, `/groups/${g}`)).data.meets, []);
});

test('계정 지우기: 방장은 넘기고, 친구·초대 링크·칠한 칸은 지우고, 다른 사람 모임은 남긴다', async () => {
  const { env, a, b, c, meetId, g } = await meetSetup();
  await befriend(env, a, b);
  await call(env, a, `/meets/${meetId}/marks`, { method: 'PUT', body: { marks: [{ start: '2026-11-16T09:00:00+09:00', state: 'free' }] } });
  const res = await worker.fetch(
    new Request(`${ORIGIN}/api/login/me`, { method: 'DELETE', headers: { origin: ORIGIN, cookie: a.cookie }, body: JSON.stringify({ confirm: true }) }),
    env,
    makeCtx(),
  );
  assert.equal(res.status, 200);
  const one = (sql) => env.DB.sqlite.prepare(sql).get();
  assert.equal(one(`SELECT owner_id FROM groups WHERE id = ${g}`).owner_id, b.id);
  assert.equal(one(`SELECT count(*) n FROM friends WHERE user_id = ${a.id} OR friend_id = ${a.id}`).n, 0);
  assert.equal(one(`SELECT count(*) n FROM invites WHERE user_id = ${a.id}`).n, 0);
  assert.equal(one(`SELECT count(*) n FROM meet_marks WHERE user_id = ${a.id}`).n, 0);
  assert.equal(one(`SELECT created_by FROM meets WHERE id = ${meetId}`).created_by, null);
  const left = await call(env, b, `/meets/${meetId}`);
  assert.deepEqual(left.data.members.map((m) => m.name), ['예시 나', '예시 다']);
  assert.equal((await call(env, c, `/meets/${meetId}`)).data.meet.canDelete, false);
});

test('셈 도우미: 이어진 칸만 후보(날이 바뀌면 끊김), 사람이 많은 순, 겹치지 않게', () => {
  const meet = { from_date: '2026-11-16', to_date: '2026-11-17', day_start: 600, day_end: 660, slot_min: 30 }; // 10:00~11:00
  const starts = slotStarts(meet);
  assert.equal(starts.length, 4);
  const members = [{ id: 1, has_calendar: 1 }, { id: 2, has_calendar: 1 }];
  const events = [{ user_id: 2, start: '2026-11-16T10:30:00+09:00', end: null }]; // 끝 없으면 1시간 → 10:30~11:30
  const grid = availability({ starts, slotMs: 30 * 60000, members, marks: [], events });
  assert.deepEqual(grid.free, [0b11, 0b01, 0b11, 0b11]);
  const best = bestTimes({ starts, slotMs: 30 * 60000, free: grid.free, length: 2, members });
  // 16일 10:00~11:00은 1명, 16일 10:30 + 17일 10:00은 이어진 칸이 아니라 후보가 아님, 17일 10:00~11:00은 2명
  assert.deepEqual(best.map((x) => [x.start, x.free, x.who]), [['2026-11-16T10:00:00+09:00', 1, [1]], ['2026-11-17T10:00:00+09:00', 2, [1, 2]]]);
});
