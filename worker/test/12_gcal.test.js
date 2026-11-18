// 12_gcal.js 시험 (담당: 서버 세션). 구글은 가짜(fetch를 바꿔 끼움)이고 사람·일정은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { makeSessionCookie } from '../lib/auth.js';
import { seal } from '../lib/secret.js';
import { sync, batch, seenKey } from '../12_gcal.js';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';

const ORIGIN = 'https://tachyon.example.invalid';
const NOW = Date.parse('2026-11-18T01:00:00Z'); // 한국 11/18(수) 10:00
const realNow = Date.now;
const realFetch = globalThis.fetch;
test.before(() => {
  Date.now = () => NOW;
});
test.after(() => {
  Date.now = realNow;
  globalThis.fetch = realFetch;
});

// 가짜 구글 캘린더: 기본 캘린더 하나(id → 일정), 토큰·목록·batch·알림 채널
function fakeGoogle() {
  const g = { events: new Map(), calls: [], updated: new Map(), cancelled: new Set() };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const body = typeof init.body === 'string' ? init.body : init.body?.toString();
    g.calls.push(`${init.method || 'GET'} ${url.pathname}`);
    if (url.href.startsWith('https://oauth2.googleapis.com/token')) {
      const p = new URLSearchParams(body);
      if (p.get('grant_type') === 'authorization_code') {
        return Response.json({ access_token: 'at-예시', refresh_token: 'rt-예시-비밀', scope: 'https://www.googleapis.com/auth/calendar.events' });
      }
      return Response.json({ access_token: 'at-예시' });
    }
    if (url.pathname === '/batch/calendar/v3') {
      const boundary = /boundary=(\S+)/.exec(init.headers['content-type'])[1];
      const parts = body.split(`--${boundary}`).slice(1, -1);
      const out = parts.map((part, k) => {
        const [, method, path] = /(POST|PATCH|DELETE) \/calendar\/v3\/calendars\/primary(\S+) HTTP/.exec(part);
        const json = part.includes('{') ? JSON.parse(part.slice(part.indexOf('{'))) : null;
        const id = decodeURIComponent(path.split('/')[2] || json?.id);
        let code = 200;
        if (method === 'POST') {
          if (g.events.has(id)) code = 409;
          else g.events.set(id, { ...json, id, status: 'confirmed' });
        } else if (method === 'PATCH') {
          if (!g.events.has(id)) code = 404;
          else g.events.set(id, { ...g.events.get(id), ...json });
        } else if (!g.events.delete(id)) code = 410;
        else code = 204;
        return `--resp\r\nContent-Type: application/http\r\nContent-ID: <response-op${k}>\r\n\r\nHTTP/1.1 ${code} X\r\nContent-Type: application/json\r\n\r\n{}\r\n`;
      });
      return new Response(`${out.join('')}--resp--`, { headers: { 'content-type': 'multipart/mixed; boundary=resp' } });
    }
    if (url.pathname.endsWith('/events/watch')) return Response.json({ resourceId: 'res-example', expiration: String(NOW + 7 * 86400000) });
    if (url.pathname.endsWith('/channels/stop')) return new Response(null, { status: 204 });
    if (url.pathname === '/calendar/v3/calendars/primary/events') {
      const min = url.searchParams.get('updatedMin');
      const items = [...g.events.values()].filter((e) => !min || (g.updated.get(e.id) || 0) >= Date.parse(min));
      for (const id of g.cancelled) items.push({ id, status: 'cancelled' });
      return Response.json({ items });
    }
    if (url.href.startsWith('https://oauth2.googleapis.com/revoke')) return new Response(null, { status: 200 });
    throw new Error(`가짜 구글이 모르는 주소: ${url.href}`);
  };
  return g;
}

async function setup({ link = true } = {}) {
  const env = makeEnv({ GOOGLE_CLIENT_ID: 'client-예시', GOOGLE_CLIENT_SECRET: 'secret-예시' });
  const a = await addTestUser(env, { sub: 'sub-a', email: 'a@example.invalid' });
  const add = (sql, ...args) => env.DB.prepare(sql).bind(...args).first();
  const event = (title, start, end, source = 'memo', ext = `memo:${title}`) =>
    add('INSERT INTO events (user_id, title, start, "end", source, ext_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', a.id, title, start, end, source, ext);
  if (link) await add('INSERT INTO gcal (user_id, refresh, hook) VALUES (?, ?, ?) RETURNING user_id', a.id, await seal(env, 'rt-예시-비밀'), ORIGIN);
  const cookie = (await makeSessionCookie(env, a.id)).split(';')[0];
  const row = (id) => env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
  const all = (sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
  return { env, a, event, cookie, row, all };
}

function call(env, cookie, path, { method = 'GET', body, headers = {}, ctx = makeCtx() } = {}) {
  const h = { origin: ORIGIN, ...headers };
  if (cookie) h.cookie = cookie;
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' }), env, ctx);
}

test('Tachyon → 구글: 넣기 → 같으면 안 보냄 → 고치기 → 지우기(트리거)', async () => {
  const g = fakeGoogle();
  const { env, a, event, row } = await setup();
  const memo = (await event('예시 합주', '2026-11-20T19:00:00+09:00', '2026-11-20T21:00:00+09:00')).id;
  const day = (await event('예시 축제', '2026-11-25', null)).id;
  await event('예시 폰 일정', '2026-11-21T09:00:00+09:00', null, 'device', 'dev-1'); // 폰 캘린더에서 온 것은 안 보냄
  await event('예시 옛날', '2026-09-01T09:00:00+09:00', null); // 기간(지난 30일) 밖

  await sync(env, a.id, { pull: false });
  const r = await row(memo);
  assert.match(r.gcal_id, /^tc[0-9a-f]{30}$/);
  assert.equal(r.gcal_seen, seenKey(r));
  const sent = g.events.get(r.gcal_id);
  assert.deepEqual([sent.summary, sent.start.dateTime, sent.end.dateTime], ['예시 합주', '2026-11-20T19:00:00+09:00', '2026-11-20T21:00:00+09:00']);
  assert.deepEqual(g.events.get((await row(day)).gcal_id).end, { date: '2026-11-26', dateTime: null }); // 종일 끝 = 다음 날
  assert.equal(g.events.size, 2);

  g.calls.length = 0;
  await sync(env, a.id, { pull: false });
  assert.deepEqual(g.calls, [], '바뀐 게 없으면 토큰도 안 받는다');

  await env.DB.prepare("UPDATE events SET title = '예시 합주(장소 바뀜)', place = '예시 연습실' WHERE id = ?").bind(memo).run();
  await sync(env, a.id, { pull: false });
  assert.equal(g.events.get(r.gcal_id).summary, '예시 합주(장소 바뀜)');
  assert.equal(g.events.get(r.gcal_id).location, '예시 연습실');

  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(memo).run();
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM gcal_gone').first()).n, 1);
  await sync(env, a.id, { pull: false });
  assert.equal(g.events.has(r.gcal_id), false);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM gcal_gone').first()).n, 0);
});

test('구글 → Tachyon: 전체 받기(옛 ICS 구글 일정 정리) → 바뀐 것만 → 구글에서 지움', async () => {
  const g = fakeGoogle();
  const { env, a, event, row, all } = await setup();
  const old = (await event('예시 옛 ICS 수업', '2026-11-19T10:00:00+09:00', '2026-11-19T11:00:00+09:00', 'google', 'uid-1@google.com')).id;
  const mine = (await event('예시 스터디', '2026-11-22T14:00:00+09:00', '2026-11-22T16:00:00+09:00')).id;
  g.events.set('gev1', { id: 'gev1', status: 'confirmed', summary: '예시 구글 회의', location: '예시 회의실', start: { dateTime: '2026-11-19T01:00:00Z' }, end: { dateTime: '2026-11-19T02:00:00Z' } });

  await sync(env, a.id);
  assert.equal(await row(old), null, '옛 ICS로 받은 구글 일정은 API 것으로 바뀐다');
  const [gr] = await all("SELECT * FROM events WHERE source = 'google'");
  assert.deepEqual([gr.title, gr.start, gr.end, gr.place, gr.gcal_id, gr.ext_id], ['예시 구글 회의', '2026-11-19T10:00:00+09:00', '2026-11-19T11:00:00+09:00', '예시 회의실', 'gev1', 'gev1']);
  const tc = (await row(mine)).gcal_id;
  assert.ok(g.events.has(tc));
  assert.equal((await all("SELECT * FROM events WHERE source = 'google'")).length, 1, 'Tachyon이 넣은 tc 일정은 구글 일정으로 다시 안 들어온다');
  const link = await env.DB.prepare('SELECT * FROM gcal').first();
  assert.equal(link.channel_exp, NOW + 7 * 86400000);
  assert.equal(link.resource, 'res-example');

  // 구글에서 Tachyon 일정을 옮기고, 구글 일정 하나를 지움 → 다음 알림
  g.events.set(tc, { ...g.events.get(tc), start: { dateTime: '2026-11-22T06:00:00Z' }, end: { dateTime: '2026-11-22T08:00:00Z' } });
  g.updated.set(tc, NOW);
  g.events.delete('gev1');
  g.cancelled.add('gev1');
  const ctx = makeCtx();
  const res = await call(env, null, '/api/gcal/push', {
    method: 'POST',
    headers: { origin: '', 'x-goog-channel-id': link.channel, 'x-goog-resource-id': 'res-example', 'x-goog-resource-state': 'exists' },
    ctx,
  });
  assert.equal(res.status, 204);
  await ctx.settle();
  assert.equal((await row(mine)).start, '2026-11-22T15:00:00+09:00');
  assert.equal((await all("SELECT * FROM events WHERE source = 'google'")).length, 0);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM gcal_gone').first()).n, 0, '구글에서 지운 것을 다시 지우라고 남기지 않는다');

  // 모르는 채널은 아무것도 안 한다
  const ctx2 = makeCtx();
  await call(env, null, '/api/gcal/push', { method: 'POST', headers: { origin: '', 'x-goog-channel-id': 'nope', 'x-goog-resource-id': 'x' }, ctx: ctx2 });
  assert.equal((await ctx2.settle()).length, 0);
});

test('연동 중: 구글 일정도 고치기·지우기 되고 구글에 바로 간다 · 구독 주소엔 일정이 빠진다', async () => {
  const g = fakeGoogle();
  const { env, a, event, cookie, row } = await setup();
  g.events.set('gev2', { id: 'gev2', status: 'confirmed', summary: '예시 세미나', start: { date: '2026-11-27' }, end: { date: '2026-11-28' } });
  await sync(env, a.id);
  const id = (await env.DB.prepare("SELECT id FROM events WHERE gcal_id = 'gev2'").first()).id;

  const ctx = makeCtx();
  const res = await call(env, cookie, `/api/events/${id}`, { method: 'PATCH', body: { title: '예시 세미나(발표)' }, ctx });
  assert.equal(res.status, 200);
  await ctx.settle();
  assert.equal((await row(id)).source, 'google', '사본을 만들지 않고 그 자리에서');
  assert.equal(g.events.get('gev2').summary, '예시 세미나(발표)');

  const ctx2 = makeCtx();
  assert.equal((await call(env, cookie, `/api/events/${id}`, { method: 'DELETE', ctx: ctx2 })).status, 200);
  await ctx2.settle();
  assert.equal(g.events.has('gev2'), false);

  await event('예시 메모 일정', '2026-11-23T10:00:00+09:00', null);
  const items = await (await call(env, cookie, '/api/calendar/items')).json();
  assert.deepEqual(items.items, []);
});

test('연동 안 하면 예전 그대로: 구글 일정 지우기 409, 상태 linked false', async () => {
  fakeGoogle();
  const { env, event, cookie } = await setup({ link: false });
  const id = (await event('예시 구글', '2026-11-19T10:00:00+09:00', null, 'google', 'uid-2@google.com')).id;
  assert.equal((await call(env, cookie, `/api/events/${id}`, { method: 'DELETE' })).status, 409);
  assert.deepEqual(await (await call(env, cookie, '/api/gcal')).json(), { ok: true, ready: true, linked: false, error: null, pulled_at: null });
  assert.deepEqual(await (await call(env, cookie, '/api/gcal/sync', { method: 'POST' })).json(), { ok: true, linked: false });
});

test('연결: state가 맞아야 하고, refresh 토큰은 잠가 둔다 → 끊으면 Tachyon이 넣은 구글 일정을 지운다', async () => {
  const g = fakeGoogle();
  const { env, a, event, cookie } = await setup({ link: false });
  await event('예시 수업', '2026-11-19T09:00:00+09:00', '2026-11-19T10:15:00+09:00', 'timetable', 'tt-1');

  const start = await call(env, cookie, '/api/gcal/connect');
  assert.equal(start.status, 302);
  const google = new URL(start.headers.get('location'));
  assert.equal(google.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.events');
  assert.equal(google.searchParams.get('access_type'), 'offline');
  const state = google.searchParams.get('state');
  const flow = start.headers.get('set-cookie').split(';')[0];

  const bad = await call(env, `${cookie}; ${flow}`, '/api/gcal/callback?code=c&state=다른값');
  assert.equal(bad.headers.get('location'), `${ORIGIN}/?gcal=state`);

  const ctx = makeCtx();
  const ok = await call(env, `${cookie}; ${flow}`, `/api/gcal/callback?code=c&state=${state}`, { ctx });
  assert.equal(ok.headers.get('location'), `${ORIGIN}/?gcal=ok`);
  await ctx.settle();
  const link = await env.DB.prepare('SELECT * FROM gcal WHERE user_id = ?').bind(a.id).first();
  assert.ok(link && !link.refresh.includes('rt-예시-비밀'), '토큰 원문은 DB에 없다');
  assert.equal(g.events.size, 1);

  const off = await (await call(env, cookie, '/api/gcal', { method: 'DELETE' })).json();
  assert.equal(off.linked, false);
  assert.equal(g.events.size, 0);
  assert.equal(await env.DB.prepare('SELECT * FROM gcal').first(), null);
  assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM events WHERE gcal_id IS NOT NULL').first()).n, 0);
});

test('batch 결과 읽기: 순서가 섞여 와도 Content-ID로, 빠진 것은 다시', async () => {
  globalThis.fetch = async () =>
    new Response(
      '--b\r\nContent-ID: <response-op1>\r\n\r\nHTTP/1.1 404 Not Found\r\n\r\n{}\r\n--b\r\nContent-ID: <response-op0>\r\n\r\nHTTP/1.1 403 Forbidden\r\n\r\n{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}\r\n--b\r\nContent-ID: <response-op3>\r\n\r\nHTTP/1.1 403 Forbidden\r\n\r\n{"error":{"errors":[{"reason":"forbidden"}]}}\r\n--b--',
    );
  const ops = [0, 1, 2, 3].map(() => ({ method: 'DELETE', path: '/events/x' }));
  assert.deepEqual(await batch('t', ops), ['retry', 'gone', 'retry', 'bad']);
});
