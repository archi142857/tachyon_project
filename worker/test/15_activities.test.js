// 15_activities.js 시험 (담당: 컨셉). 게시판 쪽은 서울대 페이지와 같은 틀(2026-11-19 확인)에 지어낸 글을 넣은 것이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { PER_STEP, datesIn, detailText, endOf, parseEventList, parseNoticeList, prune, step, toItem } from '../15_activities.js';
import { makeEnv, makeCtx } from './helpers/server.js';

const NOW = Date.parse('2026-11-19T04:00:00Z'); // 한국 11/19(목) 13:00

// R2 흉내: get → { json() } | null, put
function fakeR2() {
  const store = new Map();
  return { store, get: async (k) => (store.has(k) ? { json: async () => JSON.parse(store.get(k)) } : null), put: async (k, v) => void store.set(k, v) };
}

const eventItem = (idx, title, point, sub = title) => `
        <a href="/snunow/events?md=v&bbsidx=${idx}" class="item">

          <span class="thumb" style="background:url(/webdata/x.png) center center / cover no-repeat;"><span class="blind">${title}</span></span>
          <!-- 타이틀 -->
          <span class="texts">
            <span class="title">${title}</span>
            <span class="sub pointline"><span class="point">${point}</span>${sub}</span>
          </span>
        </a>`;
const eventPage = (items) => `<html><body><div class="board-imgline">${items.join('')}
      </div><div class="pager"><a class="pg current" href="/snunow/events?page=1">1</a></div></body></html>`;
const noticeRow = (idx, title, date) => `
          <tr>
            <td class="col-title new file">
              <a href="/snunow/notice/genernal?md=v&bbsidx=${idx}">
                <span class="clip"><span class="txt">${title}</span></span>
                <span class="icon-new">새글</span>
              </a>
            </td>
            <td class="col-date">${date}</td>
          </tr>`;
const noticePage = (rows) => `<table><tbody>${rows.join('')}</tbody></table>`;
const detailPage = (title, body) => `<div class="view"><header class="header"><h3 class="title">${title}</h3><p class="date">2026.11.17. ~ 2026.11.30.</p></header>
      <div class="content-wrap"><div class="share"><a href="#"><span class="blind">공유</span></a></div>
        <div class="content">${body}</div>
        <!-- 첨부자료 -->
        <div class="download"><a href="/x"><span class="filename">공고문.pdf</span></a></div></div>
      <footer class="footer"><a href="/snunow/events?md=v&bbsidx=1" class="btn prev">이전 글</a></footer></div>`;

test('목록 읽기: SNU 캘린더(제목 · 기간 · 설명) · 일반공지(제목 · 올린 날) · 본문(첨부 앞까지)', () => {
  const events = parseEventList(
    eventPage([
      eventItem(900, '예시 멘토 모집 공고 &amp; 안내', '2026.11.17.(화) ~ 2026.11.30.(월)'),
      eventItem(899, '예시 연주회', '2026.11.28.(토)', '예시홀에서 열리는 정기 연주회'),
    ]),
  );
  assert.deepEqual(events, [
    { idx: '900', title: '예시 멘토 모집 공고 & 안내', from: '2026-11-17', to: '2026-11-30', desc: null },
    { idx: '899', title: '예시 연주회', from: '2026-11-28', to: '2026-11-28', desc: '예시홀에서 열리는 정기 연주회' },
  ]);
  assert.deepEqual(parseNoticeList(noticePage([noticeRow(801, '예시 장학생 모집 안내', '2026. 11. 18.')])), [{ idx: '801', title: '예시 장학생 모집 안내', posted: '2026-11-18' }]);
  const text = detailText(detailPage('제목', '<p>1. 지원 자격</p><ul><li>학부 <b>2학년</b> 이상</li></ul><p>2. 접수: 11. 30.(월)까지</p>'));
  assert.equal(text, '1. 지원 자격\n학부 2학년 이상\n2. 접수: 11. 30.(월)까지');
  assert.ok(!text.includes('공고문.pdf') && !text.includes('이전 글'));
  assert.equal(detailText('<html>본문 칸 없음</html>'), '');
  assert.deepEqual(datesIn('2026.1.5.(월) ~ 2026. 1. 9.'), ['2026-01-05', '2026-01-09']);
});

test('AI 답 → 카드 칸: 모르는 칸(?)은 null, 모양이 틀린 날짜 · 시각 · 종류는 버림', () => {
  const post = { id: 'e900', src: 'SNU 캘린더', url: 'https://www.snu.ac.kr/snunow/events?md=v&bbsidx=900', title: '예시 멘토 모집', from: '2026-11-17', to: '2026-11-30', posted: null, desc: null };
  const item = toItem(post, { id: 'e900', kind: '모집·프로그램', tags: ['멘토', ' ', '생활관', '?'], summary: '신입생과 함께 사는 학부생 멘토 모집', apply_until: '2026-11-30T13:00', date: '?', time: '25시', end_time: '?', end_date: '?', place: '?', level: '학부', years: [4, 2, 3, 2, 9], colleges: [], who: '학부 2학년 이상' }, NOW);
  assert.deepEqual(
    { kind: item.kind, tags: item.tags, apply_until: item.apply_until, date: item.date, time: item.time, place: item.place, level: item.level, years: item.years, who: item.who },
    { kind: '모집·프로그램', tags: ['멘토', '생활관'], apply_until: '2026-11-30T13:00', date: null, time: null, place: null, level: '학부', years: [2, 3, 4], who: '학부 2학년 이상' },
  );
  const bare = toItem({ ...post, desc: '목록 설명' }, null, NOW); // AI 없이(키 없음 · 세 번 실패)
  assert.deepEqual([bare.kind, bare.summary, bare.apply_until, bare.tags], [null, '목록 설명', null, []]);
  assert.equal(toItem(post, { kind: '모르는 종류', apply_until: '11월 30일' }, NOW).kind, null);
  assert.equal(toItem(post, { kind: '장학', apply_until: '11월 30일' }, NOW).apply_until, null);
});

test('끝나는 날 · 고르기: 어제까지 끝난 것은 빼고, 마감 가까운 순(모르면 뒤로)', () => {
  const base = { src: 'SNU 캘린더', title: 't', from: null, to: null, posted: null, apply_until: null, date: null, end_date: null, seen: '2026-11-19T13:00:00+09:00' };
  const a = { ...base, id: 'e1', apply_until: '2026-11-25T18:00' };
  const b = { ...base, id: 'e2', date: '2026-11-21', apply_until: '2026-11-20' };
  const c = { ...base, id: 'e3', to: '2026-11-17' }; // 끝남
  const d = { ...base, id: 'n4', posted: '2026-11-01' }; // 날짜 모름 → 올린 날 + 30일 = 12-01
  const e = { ...base, id: 'n5', posted: '2026-09-01' }; // 10-01에 끝난 셈
  assert.equal(endOf(b), '2026-11-21');
  assert.equal(endOf(d), '2026-12-01');
  assert.deepEqual(prune([a, b, c, d, e], NOW).map((i) => i.id), ['e2', 'e1', 'n4']);
});

test('한 걸음: 처음엔 몇 쪽 읽어 새 글을 큐에, 앞 6개는 본문 + AI 한 번 → 활동. 다음 걸음은 남은 큐부터, 본 글은 다시 안 읽음', async () => {
  const env = makeEnv({ PHOTOS: fakeR2(), ANTHROPIC_API_KEY: 'test-key' });
  const events = Array.from({ length: 8 }, (_, i) => eventItem(900 - i, `예시 행사 ${i}`, '2026.11.20.(금) ~ 2026.11.30.(월)'));
  events.push(eventItem(800, '이미 끝난 예시 행사', '2026.11.01.(일) ~ 2026.11.10.(화)'));
  const asked = [];
  const pages = [];
  const doFetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://api.anthropic.com')) {
      const body = JSON.parse(init.body);
      const text = body.messages[0].content.map ? body.messages[0].content.map((c) => c.text || '').join('') : body.messages[0].content;
      const ids = [...String(text).matchAll(/글 id: (\S+)/g)].map((m) => m[1]);
      asked.push(ids);
      const items = ids.map((id) => ({ id, kind: '특강·세미나', tags: ['예시'], summary: `${id} 요약`, apply_until: '2026-11-28', date: '?', time: '?', end_time: '?', end_date: '?', place: '?', level: '전체', years: [], colleges: [], who: '?' }));
      return Response.json({ id: 'msg', model: 'claude-haiku-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'answer', input: { items } }], usage: { input_tokens: 100, output_tokens: 50 } });
    }
    pages.push(u.replace('https://www.snu.ac.kr', ''));
    if (u.includes('/snunow/events?page=1')) return new Response(eventPage(events));
    if (u.includes('/snunow/events?page=')) return new Response(eventPage([]));
    if (u.includes('/notice/genernal?page=1')) return new Response(noticePage([noticeRow(801, '예시 장학생 모집', '2026. 11. 18.')]));
    if (u.includes('/notice/genernal?page=')) return new Response(noticePage([]));
    if (u.includes('md=v')) return new Response(detailPage('예시', '<p>예시 본문입니다.</p>'));
    return new Response('없음', { status: 404 });
  };

  let state = await step(env, NOW, doFetch);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].length, PER_STEP);
  assert.deepEqual(asked[0], ['e900', 'e899', 'e898', 'e897', 'e896', 'e895']);
  assert.equal(state.items.length, PER_STEP);
  assert.deepEqual(state.queue.map((q) => q.id), ['e894', 'e893', 'n801']); // 끝난 e800은 큐에 안 넣음
  assert.ok(state.seen.includes('e800'));
  assert.equal(state.lock_until, 0);
  assert.ok(pages.includes('/snunow/events?page=2'), '처음엔 다음 쪽도'); // 새 글이 있던 쪽 다음은 읽는다
  assert.equal(state.items[0].summary.endsWith('요약'), true);

  pages.length = 0;
  state = await step(env, NOW + 60_000, doFetch);
  assert.deepEqual(asked[1], ['e894', 'e893', 'n801']);
  assert.equal(state.queue.length, 0);
  assert.equal(state.items.length, 9);
  assert.equal(pages.filter((p) => p.includes('page=')).length, 2, '두 번째부터는 첫 쪽만(새 글이 없으면 거기서 멈춤)');
  assert.equal(pages.filter((p) => p.includes('md=v')).length, 3, '본문은 큐에 남은 글만');
});

test('AI가 답을 못 하면 큐에 남겨 다시, 세 번째엔 AI 칸 없이 넣는다. 자물쇠가 걸려 있으면 아무것도 안 함', async () => {
  const env = makeEnv({ PHOTOS: fakeR2(), ANTHROPIC_API_KEY: 'test-key' });
  let ai = 0;
  const doFetch = async (url) => {
    const u = String(url);
    if (u.startsWith('https://api.anthropic.com')) {
      ai += 1;
      return new Response('{"type":"error","error":{"type":"overloaded_error","message":"예시"}}', { status: 529 });
    }
    if (u.includes('/snunow/events?page=1')) return new Response(eventPage([eventItem(700, '예시 공모전', '2026.11.20.(금) ~ 2026.12.10.(목)')]));
    if (u.includes('md=v')) return new Response(detailPage('예시', '<p>본문</p>'));
    return new Response(eventPage([]));
  };
  let state = await step(env, NOW, doFetch);
  assert.deepEqual([state.items.length, state.queue[0].tries], [0, 1]);
  state = await step(env, NOW + 1, doFetch);
  assert.equal(state.queue[0].tries, 2);
  state = await step(env, NOW + 2, doFetch);
  assert.deepEqual([state.items.length, state.items[0].kind, state.queue.length], [1, null, 0]);
  assert.ok(ai >= 3);

  const locked = JSON.parse(env.PHOTOS.store.get('activities/list.json'));
  locked.lock_until = NOW + 30_000;
  env.PHOTOS.store.set('activities/list.json', JSON.stringify(locked));
  const before = ai;
  await step(env, NOW + 3, doFetch);
  assert.equal(ai, before);
});

test('GET /api/activities: 로그인 없이 읽힘, 안내(행정)는 빼고, 오래됐으면 뒤에서 한 걸음 · 방금 받았으면 그대로', async () => {
  const env = makeEnv({ PHOTOS: fakeR2() });
  const item = (id, kind, apply_until) => ({ id, src: 'SNU 캘린더', url: `https://www.snu.ac.kr/x?${id}`, title: id, from: null, to: null, posted: null, kind, tags: [], summary: null, apply_until, date: null, time: null, end_time: null, end_date: null, place: null, level: null, years: [], colleges: [], who: null, seen: '2099-01-01T00:00:00+09:00' });
  env.PHOTOS.store.set('activities/list.json', JSON.stringify({ v: 1, updated_at: new Date(Date.now() - 60_000).toISOString(), lock_until: 0, items: [item('e2', '장학', '2099-12-01'), item('n1', '안내', '2099-12-01')], queue: [], seen: [] }));
  const ctx = makeCtx();
  const res = await worker.fetch(new Request('https://tachyon.example.invalid/api/activities'), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const data = await res.json();
  assert.deepEqual(data.items.map((i) => i.id), ['e2']);
  assert.ok(data.kinds.includes('장학') && !data.kinds.includes('안내'));
  assert.equal(data.refreshing, false);

  const old = JSON.parse(env.PHOTOS.store.get('activities/list.json'));
  old.updated_at = '2026-01-01T00:00:00+09:00';
  env.PHOTOS.store.set('activities/list.json', JSON.stringify(old));
  const ctx2 = makeCtx();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 503 }); // 게시판이 안 열려도 오류 없이 끝
  try {
    const again = await (await worker.fetch(new Request('https://tachyon.example.invalid/api/activities'), env, ctx2)).json();
    assert.equal(again.refreshing, true);
    await ctx2.settle();
  } finally {
    globalThis.fetch = realFetch;
  }
  const after = JSON.parse(env.PHOTOS.store.get('activities/list.json'));
  assert.notEqual(after.updated_at, '2026-01-01T00:00:00+09:00');

  const post = await worker.fetch(new Request('https://tachyon.example.invalid/api/activities', { method: 'POST' }), env, makeCtx());
  assert.equal(post.status, 405);
  const none = await worker.fetch(new Request('https://tachyon.example.invalid/api/activities'), makeEnv(), makeCtx());
  assert.equal(none.status, 503);
});
