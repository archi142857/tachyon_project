// 같이 쓰기 (담당: 서버 세션): 친구 · 그룹 · 그룹별 모임 시간표(when2meet 모양)
//
// 사람 요청 11-11 22:07 "친구 추가 기능이랑, 그룹 만드는 기능, 그룹 별로 when2meet 기능" (계획 3단계 '같이 쓰기'를 앞당김).
// 모두 로그인 필요. 남에게는 빈/바쁨만 보낸다 — 일정 이름·장소·출처는 이 파일 밖으로 나가지 않는다. 이메일은 안 보낸다.
// 친구·그룹은 링크(초대 코드)로만 맺는다. 이메일로 사람 찾기는 하지 않는다(그 이메일의 계정이 있는지 드러나서).
//
//   GET    /api/together                            → { friends: [{ id, name }], groups: [{ id, name, owner, members }] }
//   POST   /api/together/invite                      친구 초대 링크 → { code, url, expiresAt } (7일, 여러 번 쓸 수 있음)
//   GET    /api/together/join/:code                  링크 미리 보기 → { kind: 'friend'|'group', from: { name }, group?: { name, members } }
//   POST   /api/together/join      { code }          링크로 친구 되기·그룹 들어가기 → { kind, friend? | group? }
//   DELETE /api/together/friends/:id                 친구 끊기(둘 다에서)
//   POST   /api/together/groups    { name }          그룹 만들기(만든 사람 = 방장) → { group }
//   GET    /api/together/groups/:id                  → { group, members: [{ id, name, owner, me }], meets: [{ id, title, from, to, length }] }
//   PATCH  /api/together/groups/:id { name }          이름 바꾸기(방장)
//   POST   /api/together/groups/:id/invite           그룹 초대 링크(멤버 누구나) → { code, url, expiresAt }
//   POST   /api/together/groups/:id/members { friendId }  내 친구를 바로 넣기(멤버 누구나)
//   DELETE /api/together/groups/:id/members/me       나가기(방장이 나가면 가장 먼저 들어온 멤버가 방장, 아무도 없으면 그룹을 지움)
//   DELETE /api/together/groups/:id/members/:userId  내보내기(방장)
//   POST   /api/together/groups/:id/meets { title, from, to, dayStart, dayEnd, slot, length }  모임 시간표 만들기
//   GET    /api/together/meets/:id                   칸마다 되는 사람 수 · 내 칸 · 후보 3개 (아래)
//   PUT    /api/together/meets/:id/marks { marks: [{ start, state: 'free'|'busy'|null }] }  내 칸 칠하기(null = 달력대로 되돌림)
//   DELETE /api/together/meets/:id                   지우기(만든 사람 또는 방장)
//
// 모임 시간표: 사람마다 칸(slot)의 빈/바쁨 = 손으로 칠한 칸이 있으면 그것, 없으면 그 사람 달력(events)에 시각이 있는 일정이
//   칸과 겹치면 바쁨(종일 일정·마감은 바쁨으로 치지 않음, 옮긴 일정 moved_to는 뺌). 달력이 없는 사람(시각 있는 일정이 하나도 없음)은
//   when2meet처럼 칠한 '된다' 칸만 된다. 칠한 칸도 달력도 없는 사람은 '아직 모름'(unknown)이라 세지 않는다.
//   후보 = 모임 길이만큼 이어진 칸(같은 날) 가운데 처음부터 끝까지 되는 사람이 많은 순, 겹치지 않게 3개.
//
// 표는 TOGETHER_SQL(아래, schema.sql에 넣자고 소통판에 제안). 원격 D1에 표가 없으면 503 '준비 중'.

import { json, fail, readJson } from './lib/http.js';
import { kstIso, kstDate, DAY_MS } from './lib/time.js';
import { logStatement } from './lib/log.js';
import { b64url } from './lib/secret.js';

const NOW_ISO = "strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours')";

/** 제안 표(schema.sql 합의 전까지 시험이 이걸로 만든다). 모두 사용자·그룹을 지우면 같이 지워진다. */
export const TOGETHER_SQL = `
-- 친구: 둘이 친구가 되면 두 줄(나 → 친구, 친구 → 나). 끊으면 두 줄 다 지운다.
CREATE TABLE IF NOT EXISTS friends (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (${NOW_ISO}),
  PRIMARY KEY (user_id, friend_id)
);
-- 그룹: 방장(owner_id)이 이름을 바꾸고 멤버를 내보낸다. 방장 계정이 지워지면 NULL → 가장 먼저 들어온 멤버가 방장 노릇.
CREATE TABLE IF NOT EXISTS groups (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW_ISO})
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (${NOW_ISO}),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user ON group_members (user_id);
-- 초대 링크: 무작위 코드(22자). kind friend = 만든 사람과 친구, group = 그 그룹에 들어감. 7일 동안 여러 번 쓸 수 있다.
CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id   INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  uses       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW_ISO})
);
-- 모임 시간표: 날짜 from~to(끝 날 포함, 14일까지), 하루 day_start~day_end(분), 칸 slot_min분, 모임 길이 length_min분.
CREATE TABLE IF NOT EXISTS meets (
  id         INTEGER PRIMARY KEY,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  from_date  TEXT NOT NULL,
  to_date    TEXT NOT NULL,
  day_start  INTEGER NOT NULL,
  day_end    INTEGER NOT NULL,
  slot_min   INTEGER NOT NULL DEFAULT 30,
  length_min INTEGER NOT NULL DEFAULT 60,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW_ISO})
);
-- 손으로 칠한 칸만 저장한다(나머지는 각자 달력으로 셈). slot = 칸 시작 '2026-11-16T09:30:00+09:00'.
CREATE TABLE IF NOT EXISTS meet_marks (
  meet_id INTEGER NOT NULL REFERENCES meets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot    TEXT NOT NULL,
  state   TEXT NOT NULL,
  PRIMARY KEY (meet_id, user_id, slot)
);
`;

const INVITE_DAYS = 7;
const LIMITS = { groups: 20, members: 30, meets: 30, invites: 20, days: 14 };
const SLOTS = [15, 30, 60];

export async function handle(request, env, ctx, user) {
  if (!user) return fail(401, '로그인이 필요해요');
  try {
    return await route(request, env, user);
  } catch (err) {
    if (/no such table/i.test((err && err.message) || '')) return fail(503, '같이 쓰기를 준비 중이에요. 조금 뒤에 다시 해 주세요');
    throw err;
  }
}

async function route(request, env, user) {
  const url = new URL(request.url);
  const method = request.method;
  const parts = url.pathname.replace(/\/+$/, '').split('/').slice(3); // ['groups', '12', 'members', 'me']
  const [a, b, c, d] = parts;

  if (!a) return method === 'GET' ? overview(env, user) : fail(405, '그 방법으로는 안 받아요');
  if (a === 'invite' && !b) return method === 'POST' ? makeInvite(env, user, url, 'friend', null) : fail(405, '그 방법으로는 안 받아요');
  if (a === 'join') {
    if (b && method === 'GET') return previewInvite(env, user, b);
    if (!b && method === 'POST') return join(request, env, user);
    return fail(405, '그 방법으로는 안 받아요');
  }
  if (a === 'friends' && isId(b) && !c) return method === 'DELETE' ? removeFriend(env, user, Number(b)) : fail(405, '그 방법으로는 안 받아요');
  if (a === 'groups') {
    if (!b) return method === 'POST' ? createGroup(request, env, user) : fail(405, '그 방법으로는 안 받아요');
    if (!isId(b)) return fail(404, '없는 주소예요');
    const groupId = Number(b);
    if (!c) {
      if (method === 'GET') return showGroup(env, user, groupId);
      if (method === 'PATCH') return renameGroup(request, env, user, groupId);
      return fail(405, '그 방법으로는 안 받아요');
    }
    if (c === 'invite' && !d) return method === 'POST' ? groupInvite(env, user, url, groupId) : fail(405, '그 방법으로는 안 받아요');
    if (c === 'members' && !d) return method === 'POST' ? addFriendToGroup(request, env, user, groupId) : fail(405, '그 방법으로는 안 받아요');
    if (c === 'members' && (d === 'me' || isId(d))) {
      if (method !== 'DELETE') return fail(405, '그 방법으로는 안 받아요');
      return d === 'me' || Number(d) === user.id ? leaveGroup(env, user, groupId) : kickMember(env, user, groupId, Number(d));
    }
    if (c === 'meets' && !d) return method === 'POST' ? createMeet(request, env, user, groupId) : fail(405, '그 방법으로는 안 받아요');
  }
  if (a === 'meets' && isId(b)) {
    const meetId = Number(b);
    if (!c) {
      if (method === 'GET') return showMeet(env, user, meetId);
      if (method === 'DELETE') return deleteMeet(env, user, meetId);
      return fail(405, '그 방법으로는 안 받아요');
    }
    if (c === 'marks' && !d) return method === 'PUT' ? saveMarks(request, env, user, meetId) : fail(405, '그 방법으로는 안 받아요');
  }
  return fail(404, '없는 주소예요');
}

const isId = (v) => typeof v === 'string' && /^\d{1,12}$/.test(v);

// ── 한눈에 ───────────────────────────────────────────────────────

async function overview(env, user) {
  const [friends, groups] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.name FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.name, u.id`,
    ).bind(user.id),
    env.DB.prepare(
      `SELECT g.id, g.name,
              COALESCE(g.owner_id, (SELECT user_id FROM group_members x WHERE x.group_id = g.id ORDER BY joined_at, user_id LIMIT 1)) = ?1 AS owner,
              (SELECT count(*) FROM group_members x WHERE x.group_id = g.id) AS members
         FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ?1 ORDER BY m.joined_at DESC, g.id DESC`,
    ).bind(user.id),
  ]);
  return json({
    ok: true,
    friends: friends.results.map((f) => ({ id: f.id, name: displayName(f.name) })),
    groups: groups.results.map((g) => ({ id: g.id, name: g.name, owner: Boolean(g.owner), members: g.members })),
  });
}

/** 이름이 비었으면 '이름 없음' — 이메일로 대신하지 않는다 */
const displayName = (name) => (name && String(name).trim()) || '이름 없음';

// ── 초대 링크 ─────────────────────────────────────────────────────

function newCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return b64url(bytes); // 22자, 맞혀 볼 수 없는 길이
}

async function makeInvite(env, user, url, kind, groupId) {
  const now = Date.now();
  const active = await env.DB.prepare('SELECT count(*) AS n FROM invites WHERE user_id = ? AND expires_at > ?').bind(user.id, kstIso(now)).first();
  if (active.n >= LIMITS.invites) return fail(429, `초대 링크는 한 번에 ${LIMITS.invites}개까지예요. 며칠 뒤에 다시 만들어 주세요`);
  const code = newCode();
  const expiresAt = kstIso(now + INVITE_DAYS * DAY_MS);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM invites WHERE user_id = ? AND expires_at <= ?').bind(user.id, kstIso(now)), // 지난 것 치우기
    env.DB.prepare('INSERT INTO invites (code, kind, user_id, group_id, expires_at) VALUES (?, ?, ?, ?, ?)').bind(code, kind, user.id, groupId, expiresAt),
    logStatement(env, user.id, 'invite_create', { kind }),
  ]);
  return json({ ok: true, code, url: `${url.origin}/?join=${code}`, expiresAt });
}

async function groupInvite(env, user, url, groupId) {
  if (!(await memberOf(env, groupId, user.id))) return fail(404, '없는 그룹이에요');
  return makeInvite(env, user, url, 'group', groupId);
}

/** 쓸 수 있는 초대인지. 없으면 404, 지났으면 410 응답을 error에 */
async function findInvite(env, code) {
  if (!/^[\w-]{16,40}$/.test(code || '')) return { error: fail(404, '없는 링크예요') };
  const invite = await env.DB.prepare(
    `SELECT i.code, i.kind, i.user_id, i.group_id, i.expires_at, u.name AS from_name, g.name AS group_name,
            (SELECT count(*) FROM group_members x WHERE x.group_id = i.group_id) AS members
       FROM invites i JOIN users u ON u.id = i.user_id LEFT JOIN groups g ON g.id = i.group_id WHERE i.code = ?`,
  )
    .bind(code)
    .first();
  if (!invite || (invite.kind === 'group' && invite.group_name == null)) return { error: fail(404, '없는 링크예요') };
  if (invite.expires_at <= kstIso()) return { error: fail(410, '기한이 지난 링크예요. 새 링크를 받아 주세요') };
  return { invite };
}

async function previewInvite(env, user, code) {
  const { invite, error } = await findInvite(env, code);
  if (error) return error;
  const out = { ok: true, kind: invite.kind, from: { name: displayName(invite.from_name) }, mine: invite.user_id === user.id };
  if (invite.kind === 'group') out.group = { name: invite.group_name, members: invite.members };
  return json(out);
}

async function join(request, env, user) {
  const body = await readJson(request);
  if (!body || typeof body.code !== 'string') return fail(400, '링크 코드가 없어요');
  const { invite, error } = await findInvite(env, body.code);
  if (error) return error;
  const used = env.DB.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').bind(invite.code);

  if (invite.kind === 'friend') {
    if (invite.user_id === user.id) return fail(400, '내가 만든 링크예요. 친구에게 보내 주세요');
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?1, ?2), (?2, ?1)').bind(user.id, invite.user_id),
      used,
      logStatement(env, user.id, 'friend_add', { via: 'link' }),
    ]);
    return json({ ok: true, kind: 'friend', friend: { id: invite.user_id, name: displayName(invite.from_name) } });
  }

  // 그룹
  const group = { id: invite.group_id, name: invite.group_name };
  if (await memberOf(env, group.id, user.id)) return json({ ok: true, kind: 'group', group, already: true });
  const limit = await joinLimits(env, user.id, group.id, invite.members);
  if (limit) return limit;
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').bind(group.id, user.id),
    used,
    logStatement(env, user.id, 'group_join', { via: 'link' }),
  ]);
  return json({ ok: true, kind: 'group', group });
}

/** 그룹 인원·내 그룹 수 한도를 넘으면 실패 응답 */
async function joinLimits(env, userId, groupId, members) {
  if (members >= LIMITS.members) return fail(409, `한 그룹은 ${LIMITS.members}명까지예요`);
  const mine = await env.DB.prepare('SELECT count(*) AS n FROM group_members WHERE user_id = ?').bind(userId).first();
  if (mine.n >= LIMITS.groups) return fail(409, `그룹은 ${LIMITS.groups}개까지 들어갈 수 있어요`);
  return null;
}

async function removeFriend(env, user, friendId) {
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM friends WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)').bind(user.id, friendId),
    logStatement(env, user.id, 'friend_remove', null),
  ]);
  if (!res[0].meta || !res[0].meta.changes) return fail(404, '친구가 아니에요');
  return json({ ok: true });
}

// ── 그룹 ─────────────────────────────────────────────────────────

function cleanName(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text && text.length <= max ? text : null;
}

async function memberOf(env, groupId, userId) {
  return Boolean(await env.DB.prepare('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, userId).first());
}

/** 그룹 줄 + 이 사람이 방장인지(방장이 비었으면 가장 먼저 들어온 멤버). 멤버가 아니면 null */
async function groupFor(env, groupId, userId) {
  const row = await env.DB.prepare(
    `SELECT g.id, g.name, g.owner_id,
            (SELECT user_id FROM group_members WHERE group_id = g.id ORDER BY joined_at, user_id LIMIT 1) AS first_member
       FROM groups g JOIN group_members m ON m.group_id = g.id AND m.user_id = ? WHERE g.id = ?`,
  )
    .bind(userId, groupId)
    .first();
  if (!row) return null;
  return { id: row.id, name: row.name, ownerId: row.owner_id ?? row.first_member, owner: (row.owner_id ?? row.first_member) === userId };
}

async function createGroup(request, env, user) {
  const body = await readJson(request);
  const name = cleanName(body && body.name, 40);
  if (!name) return fail(400, '그룹 이름을 40자 안으로 써 주세요');
  const mine = await env.DB.prepare('SELECT count(*) AS n FROM group_members WHERE user_id = ?').bind(user.id).first();
  if (mine.n >= LIMITS.groups) return fail(409, `그룹은 ${LIMITS.groups}개까지 들어갈 수 있어요`);
  const [created] = await env.DB.batch([
    env.DB.prepare('INSERT INTO groups (name, owner_id) VALUES (?, ?) RETURNING id, name').bind(name, user.id),
    env.DB.prepare('INSERT INTO group_members (group_id, user_id) VALUES (last_insert_rowid(), ?)').bind(user.id),
    logStatement(env, user.id, 'group_create', null),
  ]);
  const group = created.results[0];
  return json({ ok: true, group: { id: group.id, name: group.name, owner: true, members: 1 } });
}

async function showGroup(env, user, groupId) {
  const group = await groupFor(env, groupId, user.id);
  if (!group) return fail(404, '없는 그룹이에요');
  const [members, meets] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.name FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at, u.id`,
    ).bind(groupId),
    env.DB.prepare('SELECT id, title, from_date, to_date, length_min, created_by FROM meets WHERE group_id = ? ORDER BY from_date DESC, id DESC').bind(groupId),
  ]);
  return json({
    ok: true,
    group: { id: group.id, name: group.name, owner: group.owner },
    members: members.results.map((m) => ({ id: m.id, name: displayName(m.name), owner: m.id === group.ownerId, me: m.id === user.id })),
    meets: meets.results.map((m) => ({ id: m.id, title: m.title, from: m.from_date, to: m.to_date, length: m.length_min, mine: m.created_by === user.id })),
  });
}

async function renameGroup(request, env, user, groupId) {
  const group = await groupFor(env, groupId, user.id);
  if (!group) return fail(404, '없는 그룹이에요');
  if (!group.owner) return fail(403, '이름은 방장만 바꿀 수 있어요');
  const body = await readJson(request);
  const name = cleanName(body && body.name, 40);
  if (!name) return fail(400, '그룹 이름을 40자 안으로 써 주세요');
  await env.DB.prepare('UPDATE groups SET name = ? WHERE id = ?').bind(name, groupId).run();
  return json({ ok: true, group: { id: groupId, name, owner: true } });
}

async function addFriendToGroup(request, env, user, groupId) {
  const body = await readJson(request);
  const friendId = body && Number(body.friendId);
  if (!Number.isInteger(friendId) || friendId <= 0) return fail(400, '넣을 친구를 골라 주세요');
  if (!(await memberOf(env, groupId, user.id))) return fail(404, '없는 그룹이에요');
  const friend = await env.DB.prepare('SELECT u.id, u.name FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.friend_id = ?')
    .bind(user.id, friendId)
    .first();
  if (!friend) return fail(404, '내 친구만 바로 넣을 수 있어요. 다른 사람은 초대 링크로');
  if (await memberOf(env, groupId, friendId)) return json({ ok: true, already: true });
  const members = await env.DB.prepare('SELECT count(*) AS n FROM group_members WHERE group_id = ?').bind(groupId).first();
  const limit = await joinLimits(env, friendId, groupId, members.n);
  if (limit) return limit;
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').bind(groupId, friendId),
    logStatement(env, user.id, 'group_add', null),
  ]);
  return json({ ok: true, member: { id: friend.id, name: displayName(friend.name) } });
}

/** 그룹에서 이 사람을 빼는 문장들(나가기·계정 지우기 같이 씀): 방장이면 다음 멤버에게 넘기고, 남는 사람이 없으면 그룹을 지운다 */
export function leaveStatements(env, userId, groupId = null) {
  const only = groupId == null ? '' : ' AND group_id = ?2';
  const onlyG = groupId == null ? '' : ' AND id = ?2';
  const args = groupId == null ? [userId] : [userId, groupId];
  return [
    env.DB.prepare(
      `DELETE FROM groups WHERE id IN (SELECT group_id FROM group_members WHERE user_id = ?1${only})
         AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = groups.id AND m.user_id != ?1)`,
    ).bind(...args),
    env.DB.prepare(
      `UPDATE groups SET owner_id = (SELECT user_id FROM group_members m WHERE m.group_id = groups.id AND m.user_id != ?1 ORDER BY joined_at, user_id LIMIT 1)
         WHERE owner_id = ?1${onlyG}`,
    ).bind(...args),
    env.DB.prepare(`DELETE FROM meet_marks WHERE user_id = ?1 AND meet_id IN (SELECT id FROM meets WHERE ${groupId == null ? 'true' : 'group_id = ?2'})`).bind(...args),
    env.DB.prepare(`DELETE FROM group_members WHERE user_id = ?1${only}`).bind(...args),
  ];
}

/** 계정 지우기(1_login.js)가 부른다: 그룹 넘기기·나가기, 친구 끊기, 내 초대 링크·칠한 칸 지우기 */
export function deleteAccountStatements(env, userId) {
  return [
    ...leaveStatements(env, userId),
    env.DB.prepare('DELETE FROM friends WHERE user_id = ?1 OR friend_id = ?1').bind(userId),
    env.DB.prepare('DELETE FROM invites WHERE user_id = ?').bind(userId),
    env.DB.prepare('UPDATE meets SET created_by = NULL WHERE created_by = ?').bind(userId),
  ];
}
export const TOGETHER_TABLES = ['friends', 'groups', 'group_members', 'invites', 'meets', 'meet_marks'];

async function leaveGroup(env, user, groupId) {
  if (!(await memberOf(env, groupId, user.id))) return fail(404, '없는 그룹이에요');
  await env.DB.batch([...leaveStatements(env, user.id, groupId), logStatement(env, user.id, 'group_leave', null)]);
  return json({ ok: true });
}

async function kickMember(env, user, groupId, memberId) {
  const group = await groupFor(env, groupId, user.id);
  if (!group) return fail(404, '없는 그룹이에요');
  if (!group.owner) return fail(403, '내보내기는 방장만 할 수 있어요');
  if (!(await memberOf(env, groupId, memberId))) return fail(404, '그룹에 없는 사람이에요');
  await env.DB.batch([...leaveStatements(env, memberId, groupId), logStatement(env, user.id, 'group_kick', null)]);
  return json({ ok: true });
}

// ── 모임 시간표 ───────────────────────────────────────────────────

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^(\d{2}):(\d{2})$/;
const minutesOf = (text) => {
  const m = HHMM.exec(text || '');
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v <= 1440 ? v : null;
};
const dayMs = (date) => Date.parse(`${date}T00:00:00+09:00`);
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

async function createMeet(request, env, user, groupId) {
  if (!(await memberOf(env, groupId, user.id))) return fail(404, '없는 그룹이에요');
  const body = (await readJson(request)) || {};
  const title = cleanName(body.title, 60);
  if (!title) return fail(400, '모임 이름을 60자 안으로 써 주세요');
  const { from, to } = body;
  if (!DATE.test(from || '') || !DATE.test(to || '') || Number.isNaN(dayMs(from)) || Number.isNaN(dayMs(to))) return fail(400, '날짜는 2026-11-16 모양으로 보내 주세요');
  const days = Math.round((dayMs(to) - dayMs(from)) / DAY_MS) + 1;
  if (days < 1) return fail(400, '끝 날이 시작 날보다 앞이에요');
  if (days > LIMITS.days) return fail(400, `날짜는 ${LIMITS.days}일까지 고를 수 있어요`);
  if (to < kstDate()) return fail(400, '이미 지난 날짜예요');
  const slot = body.slot == null ? 30 : Number(body.slot);
  if (!SLOTS.includes(slot)) return fail(400, '칸은 15·30·60분 가운데 하나예요');
  const dayStart = minutesOf(body.dayStart ?? '09:00');
  const dayEnd = minutesOf(body.dayEnd ?? '22:00');
  if (dayStart == null || dayEnd == null || dayStart >= dayEnd) return fail(400, '하루 시작·끝 시각은 09:00 모양이고 시작이 끝보다 앞이어야 해요');
  if (dayStart % slot || dayEnd % slot) return fail(400, `시작·끝 시각은 ${slot}분 단위로 골라 주세요`);
  const length = body.length == null ? 60 : Number(body.length);
  if (!Number.isInteger(length) || length < slot || length % slot || length > dayEnd - dayStart) return fail(400, `모임 길이는 ${slot}분 단위, 하루 범위 안으로 골라 주세요`);
  const count = await env.DB.prepare('SELECT count(*) AS n FROM meets WHERE group_id = ?').bind(groupId).first();
  if (count.n >= LIMITS.meets) return fail(409, `한 그룹의 모임 시간표는 ${LIMITS.meets}개까지예요. 지난 것을 지워 주세요`);
  const [saved] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO meets (group_id, title, from_date, to_date, day_start, day_end, slot_min, length_min, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(groupId, title, from, to, dayStart, dayEnd, slot, length, user.id),
    logStatement(env, user.id, 'meet_create', { days, slot }),
  ]);
  return json({ ok: true, meet: { id: saved.results[0].id, title, from, to, dayStart: hhmm(dayStart), dayEnd: hhmm(dayEnd), slot, length } });
}

/** 모임 줄 + 멤버인지. 멤버가 아니면 null */
async function meetFor(env, meetId, userId) {
  return env.DB.prepare(
    `SELECT t.*, g.name AS group_name, g.owner_id,
            (SELECT user_id FROM group_members WHERE group_id = g.id ORDER BY joined_at, user_id LIMIT 1) AS first_member
       FROM meets t JOIN groups g ON g.id = t.group_id JOIN group_members m ON m.group_id = g.id AND m.user_id = ? WHERE t.id = ?`,
  )
    .bind(userId, meetId)
    .first();
}

/** 칸 시작들(밀리초, 시간 순). 하루마다 dayStart ~ dayEnd */
export function slotStarts(meet) {
  const out = [];
  for (let day = dayMs(meet.from_date); day <= dayMs(meet.to_date); day += DAY_MS) {
    for (let m = meet.day_start; m + meet.slot_min <= meet.day_end; m += meet.slot_min) out.push(day + m * 60000);
  }
  return out;
}

async function showMeet(env, user, meetId) {
  const meet = await meetFor(env, meetId, user.id);
  if (!meet) return fail(404, '없는 모임 시간표예요');
  const starts = slotStarts(meet);
  const slotMs = meet.slot_min * 60000;
  const fromIso = kstIso(starts[0]);
  const toIso = kstIso(starts[starts.length - 1] + slotMs);

  const [members, marks, events] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.name, EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.id AND length(e.start) > 10) AS has_calendar
         FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at, u.id`,
    ).bind(meet.group_id),
    env.DB.prepare('SELECT user_id, slot, state FROM meet_marks WHERE meet_id = ?').bind(meetId),
    // 시각이 있는 일정만(종일·마감 빼고), 옮긴 일정 빼고. 이름·장소는 읽지 않는다.
    env.DB.prepare(
      `SELECT user_id, start, "end" FROM events
        WHERE user_id IN (SELECT user_id FROM group_members WHERE group_id = ?1)
          AND moved_to IS NULL AND length(start) > 10 AND start < ?3 AND COALESCE("end", start) > ?2`,
    ).bind(meet.group_id, fromIso, toIso),
  ]);

  const grid = availability({ starts, slotMs, members: members.results, marks: marks.results, events: events.results });
  const ownerId = meet.owner_id ?? meet.first_member;
  const memberList = members.results.map((m, i) => ({ id: m.id, name: displayName(m.name), me: m.id === user.id, known: grid.known[i] }));
  const meIndex = members.results.findIndex((m) => m.id === user.id);
  const slots = starts.map((ms, j) => ({
    start: kstIso(ms),
    free: popcount(grid.free[j]),
    who: idsOf(grid.free[j], members.results),
    me: grid.stateOf(meIndex, j), // 내 칸: 칠한 것, 없으면 내 달력대로('free'|'busy')
    mark: grid.marked[meIndex].get(j) || null, // 내가 칠한 칸이면 'free'|'busy', 아니면 null(달력대로)
  }));
  return json({
    ok: true,
    meet: {
      id: meet.id,
      groupId: meet.group_id,
      group: meet.group_name,
      title: meet.title,
      from: meet.from_date,
      to: meet.to_date,
      dayStart: hhmm(meet.day_start),
      dayEnd: hhmm(meet.day_end),
      slot: meet.slot_min,
      length: meet.length_min,
      canDelete: meet.created_by === user.id || ownerId === user.id,
    },
    members: memberList,
    known: memberList.filter((m) => m.known).length,
    unknown: memberList.filter((m) => !m.known).length,
    slots,
    best: bestTimes({ starts, slotMs, free: grid.free, length: meet.length_min / meet.slot_min, members: members.results }),
  });

  function idsOf(mask, list) {
    const out = [];
    for (let i = 0; i < list.length; i++) if (bit(mask, i)) out.push(list[i].id);
    return out;
  }
}

const bit = (mask, i) => i >= 0 && ((mask >>> i) & 1) === 1;
function popcount(mask) {
  let n = 0;
  for (let v = mask >>> 0; v; v &= v - 1) n++;
  return n;
}

/** 첫 칸 j: 칸 끝이 ms보다 뒤인 첫 칸 */
function firstSlotEndingAfter(starts, slotMs, ms) {
  let lo = 0;
  let hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] + slotMs > ms) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * 칸마다 되는 사람(비트 묶음, i번째 비트 = members[i]). 칠한 칸이 먼저, 없으면 달력 일정과 겹치면 바쁨,
 * 달력이 없는 사람은 칠한 '된다' 칸만 된다. known[i] = 칠한 칸이 있거나 달력(시각 있는 일정)이 있는 사람.
 */
export function availability({ starts, slotMs, members, marks, events }) {
  const index = new Map(members.map((m, i) => [m.id, i]));
  const n = starts.length;
  const busy = members.map(() => new Uint8Array(n));
  for (const e of events) {
    const i = index.get(e.user_id);
    if (i === undefined) continue;
    const s = Date.parse(e.start);
    const end = e.end && e.end > e.start ? Date.parse(e.end) : s + 60 * 60000; // 끝 시각이 없으면 1시간
    if (Number.isNaN(s) || Number.isNaN(end)) continue;
    for (let j = firstSlotEndingAfter(starts, slotMs, s); j < n && starts[j] < end; j++) busy[i][j] = 1;
  }
  const slotOf = new Map(starts.map((ms, j) => [kstIso(ms), j]));
  const marked = members.map(() => new Map());
  for (const mk of marks) {
    const i = index.get(mk.user_id);
    const j = slotOf.get(mk.slot);
    if (i !== undefined && j !== undefined && (mk.state === 'free' || mk.state === 'busy')) marked[i].set(j, mk.state);
  }
  const known = members.map((m, i) => Boolean(m.has_calendar) || marked[i].size > 0);
  const stateOf = (i, j) => marked[i].get(j) || (members[i].has_calendar && !busy[i][j] ? 'free' : 'busy');
  const free = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    let mask = 0;
    for (let i = 0; i < members.length; i++) if (known[i] && stateOf(i, j) === 'free') mask |= 1 << i;
    free[j] = mask >>> 0;
  }
  return { free, known, marked, stateOf };
}

/** 후보: 모임 길이(칸 수 length)만큼 같은 날 이어진 칸에서 처음부터 끝까지 되는 사람이 많은 순, 겹치지 않게 3개 */
export function bestTimes({ starts, slotMs, free, length, members, count = 3 }) {
  const windows = [];
  for (let j = 0; j + length <= starts.length; j++) {
    const last = j + length - 1;
    if (starts[last] - starts[j] !== (length - 1) * slotMs) continue; // 날이 바뀌면 이어진 칸이 아님
    let mask = 0xffffffff;
    for (let k = j; k <= last; k++) mask &= free[k];
    const n = popcount(mask);
    if (n > 0) windows.push({ j, n, mask: mask >>> 0 });
  }
  windows.sort((x, y) => y.n - x.n || x.j - y.j);
  const picked = [];
  for (const w of windows) {
    if (picked.length >= count) break;
    if (picked.some((p) => w.j < p.j + length && p.j < w.j + length)) continue;
    picked.push(w);
  }
  return picked
    .sort((x, y) => x.j - y.j)
    .map((w) => ({
      start: kstIso(starts[w.j]),
      end: kstIso(starts[w.j + length - 1] + slotMs),
      free: w.n,
      who: members.filter((m, i) => (w.mask >>> i) & 1).map((m) => m.id),
    }));
}

async function saveMarks(request, env, user, meetId) {
  const meet = await meetFor(env, meetId, user.id);
  if (!meet) return fail(404, '없는 모임 시간표예요');
  const body = await readJson(request, 256 * 1024);
  if (!body || !Array.isArray(body.marks) || body.marks.length > 2000) return fail(400, '칠할 칸을 marks 목록으로 보내 주세요');
  const valid = new Set(slotStarts(meet).map((ms) => kstIso(ms)));
  const set = [];
  const clear = [];
  for (const mk of body.marks) {
    if (!mk || !valid.has(mk.start)) return fail(400, '모임 시간표에 없는 칸이 있어요');
    if (mk.state === 'free' || mk.state === 'busy') set.push({ slot: mk.start, state: mk.state });
    else if (mk.state == null) clear.push(mk.start);
    else return fail(400, "칸 상태는 'free'·'busy'·null 가운데 하나예요");
  }
  const statements = [];
  if (set.length) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO meet_marks (meet_id, user_id, slot, state)
         SELECT ?1, ?2, j.value ->> 'slot', j.value ->> 'state' FROM json_each(?3) AS j WHERE true
         ON CONFLICT (meet_id, user_id, slot) DO UPDATE SET state = excluded.state WHERE meet_marks.state IS NOT excluded.state`,
      ).bind(meetId, user.id, JSON.stringify(set)),
    );
  }
  if (clear.length) {
    statements.push(
      env.DB.prepare('DELETE FROM meet_marks WHERE meet_id = ?1 AND user_id = ?2 AND slot IN (SELECT value FROM json_each(?3))').bind(meetId, user.id, JSON.stringify(clear)),
    );
  }
  statements.push(logStatement(env, user.id, 'meet_mark', { set: set.length, clear: clear.length }));
  await env.DB.batch(statements);
  return showMeet(env, user, meetId);
}

async function deleteMeet(env, user, meetId) {
  const meet = await meetFor(env, meetId, user.id);
  if (!meet) return fail(404, '없는 모임 시간표예요');
  const ownerId = meet.owner_id ?? meet.first_member;
  if (meet.created_by !== user.id && ownerId !== user.id) return fail(403, '만든 사람이나 방장만 지울 수 있어요');
  await env.DB.batch([env.DB.prepare('DELETE FROM meets WHERE id = ?').bind(meetId), logStatement(env, user.id, 'meet_delete', null)]);
  return json({ ok: true });
}
