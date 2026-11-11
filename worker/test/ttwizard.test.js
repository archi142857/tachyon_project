// TT Wizard 시간표 링크 시험(컨셉 세션, 11-11). 시간표·사람은 모두 지어낸 예시다.
// 강좌 하나만 진짜 편람(data/offerings/2026-2.json)에 있는 번호를 쓴다(살펴보기·넣기 길을 끝까지 보려고).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';
import { handle } from '../9_etl.js';
import { LINK_BASE, codeOf, linkClasses, linkOf, placeOf, readCode, toLinkItems, weeklyRows } from '../ttwizard.js';

const b64url = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jcode = (data) => `j${b64url(new TextEncoder().encode(JSON.stringify(data)))}`;
async function zcode(data) {
  const stream = new Blob([new TextEncoder().encode(JSON.stringify(data))]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return `z${b64url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
}

// 지어낸 편람 두 강좌: [교과목번호, 과목명, 학과, 학점, 구분, [[강좌번호, 상태, 수업들]]]
const BOOK = {
  courses: [
    ['X0000.000100', '예시 미적분학', '수리과학부', 3, '교양', [['001', '', [[0, 600, 675, '26', '101'], [2, 600, 675, '26', '101']]], ['002', '', [[1, 540, 615, '26', '102']]]]],
    ['X0000.000200', '예시 일반화학', '화학부', 3, '교양', [['001', '', [[3, 780, 855, '500', 'L301']]]]],
  ],
};

test('붙여 넣은 글에서 시간표 글을 찾는다', () => {
  assert.equal(codeOf('https://archi142857.github.io/tt-wizard/#t=jAbc_-1'), 'jAbc_-1');
  assert.equal(codeOf('https://tachyon.example/#ttw=zQq'), 'zQq');
  assert.equal(codeOf('  jAbc  '), 'jAbc');
  assert.equal(codeOf('그냥 글'), null);
  assert.equal(codeOf(''), null);
});

test('j·z 글을 읽고, 새 판·깨진 글은 거른다', async () => {
  const data = [1, '2026-2', '내 시간표', [['X0000.000100', '001', 3, '예시 미적분학']]];
  assert.deepEqual((await readCode(jcode(data))).link, { sem: '2026-2', title: '내 시간표', items: data[3] });
  assert.deepEqual((await readCode(await zcode(data))).link.items, data[3]);
  assert.equal((await readCode(jcode([2, '2026-2', '', []]))).problem, 'newer');
  assert.equal((await readCode(jcode({ a: 1 }))).problem, 'broken');
  assert.equal((await readCode('z!!')).problem, 'broken');
  assert.equal((await readCode(jcode([1, '이상한 학기', '', []]))).problem, 'broken');
});

test('항목 → 수업: 편람에서 채우고, 바꾼 수업·직접 넣은 일정·편람에 없는 강좌도', () => {
  const link = {
    sem: '2026-2',
    title: '',
    items: [
      ['X0000.000100', '001', 0, '예시 미적분학'],
      ['X0000.000200', '001', 1, '예시 일반화학', [[4, 900, 975, '500', 'L302']]], // 바꾼 수업
      { custom: 'c1', title: '동아리 모임', meetings: [[5, 1080, 1200, '', '']] },
      ['Y9999.000000', '001', 2, '편람에 없는 과목'],
      { custom: 'c2', title: '이상한 칸', meetings: [[9, 0, 10, '', ''], [1, 50, 40, '', '']] },
    ],
  };
  const classes = linkClasses(link, BOOK);
  assert.equal(classes.length, 5);
  assert.deepEqual(classes[0], { title: '예시 미적분학', course: 'X0000.000100', no: '001', meetings: [[0, 600, 675, '26', '101'], [2, 600, 675, '26', '101']], found: true, custom: false });
  assert.deepEqual(classes[1].meetings, [[4, 900, 975, '500', 'L302']]);
  assert.equal(classes[2].custom, true);
  assert.deepEqual(classes[3], { title: '편람에 없는 과목', course: 'Y9999.000000', no: '001', meetings: [], found: false, custom: false });
  assert.deepEqual(classes[4].meetings, []); // 요일·시각이 이상한 칸은 버린다
  const rows = weeklyRows(classes);
  assert.deepEqual(rows[0], { title: '예시 미적분학', day: '월', start: '10:00', end: '11:15', place: '26동 101호' });
  assert.equal(rows.find((r) => r.title === '동아리 모임').day, '토');
  assert.equal(placeOf('301', '강당'), '301동 강당');
  assert.equal(placeOf('', ''), null);
});

test('Tachyon 수업 → TT Wizard 링크: 이름·시각이 맞으면 강좌, 아니면 직접 넣은 일정', async () => {
  const items = toLinkItems(
    [
      { title: '예시 미적분학', meetings: [[2, 600, 675, '26', '101'], [0, 600, 675, '26', '101']] },
      { title: '예시 일반화학', meetings: [[3, 780, 900, '500', '']] }, // 끝 시각이 달라 못 찾음
    ],
    BOOK,
  );
  assert.deepEqual(items[0], ['X0000.000100', '001', null, '예시 미적분학']);
  assert.deepEqual(items[1], { custom: 'c1', title: '예시 일반화학', meetings: [[3, 780, 900, '500', '']] });
  const link = linkOf('2026-2', 'Tachyon에서', items);
  assert.ok(link.startsWith(`${LINK_BASE}#t=j`));
  assert.deepEqual((await readCode(codeOf(link))).link.items, items);
});

test('POST /api/etl/ttwizard: 살펴보기 → 넣기(시간표 줄, 앞으로의 eTL 수업은 지움)', async (t) => {
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-11-11T03:00:00Z'); // 한국 11-11(수) 12:00
  t.after(() => (Date.now = realNow));
  const env = makeEnv();
  const user = await addTestUser(env);
  // 전에 eTL로 넣은 앞으로의 수업 하나(지워져야 한다)
  await env.DB.prepare("INSERT INTO events (user_id, title, start, \"end\", source, ext_id) VALUES (?, '옛 수업', '2026-11-12T09:00:00+09:00', '2026-11-12T10:00:00+09:00', 'etl', 'api-class-1-2026-11-12-0900')")
    .bind(user.id)
    .run();
  // 진짜 편람의 강좌 하나(목 14:00–16:50) + 직접 넣은 일정
  const code = jcode([1, '2026-2', '예시', [['M3502.019800', '001', 0, '(공유)AI 기반 창업 방법론'], { custom: 'c1', title: '예시 스터디', meetings: [[0, 1140, 1260, '301', '']] }]]);
  const post = (body) => new Request('https://tachyon.example/api/etl/ttwizard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const bad = await handle(post({ link: '아무 글' }), env, makeCtx(), user);
  assert.equal(bad.status, 400);
  const other = await handle(post({ link: jcode([1, '2027-1', '', [['M3502.019800', '001']]]) }), env, makeCtx(), user);
  assert.equal(other.status, 400);
  assert.match((await other.json()).error, /2027-1/);

  const preview = await (await handle(post({ link: `https://archi142857.github.io/tt-wizard/#t=${code}` }), env, makeCtx(), user)).json();
  assert.equal(preview.ok, true);
  assert.equal(preview.classes.length, 2);
  assert.equal(preview.classes[0].found, true);
  assert.deepEqual(preview.classes[0].times, [{ day: '목', start: 840, end: 1010, place: null }]);
  assert.equal(preview.replaces, 1);
  assert.equal(preview.until, '2026-12-14');

  const saved = await (await handle(post({ link: code, save: true }), env, makeCtx(), user)).json();
  assert.equal(saved.ok, true);
  assert.equal(saved.saved, 10); // 목 5번(11/12~12/10) + 월 5번(11/16~12/14)
  const { results } = await env.DB.prepare('SELECT title, start, "end", place, source FROM events WHERE user_id = ? ORDER BY start').bind(user.id).all();
  assert.ok(results.every((r) => r.source === 'timetable'));
  assert.equal(results[0].title, '(공유)AI 기반 창업 방법론');
  assert.equal(results[0].start, '2026-11-12T14:00:00+09:00');
  assert.equal(results[0].end, '2026-11-12T16:50:00+09:00');
  assert.ok(results.some((r) => r.title === '예시 스터디' && r.place === '301동'));

  // 내보내기: 넣은 수업 → TT Wizard 링크(강좌는 편람과 맞아서 배열로)
  const out = await (await handle(new Request('https://tachyon.example/api/etl/ttwizard'), env, makeCtx(), user)).json();
  assert.equal(out.ok, true);
  const items = (await readCode(codeOf(out.link))).link.items;
  assert.deepEqual(items.find(Array.isArray), ['M3502.019800', '001', null, '(공유)AI 기반 창업 방법론']);
  assert.ok(items.some((x) => !Array.isArray(x) && x.title === '예시 스터디'));
});
