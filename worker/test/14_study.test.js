// 14_study.js 시험: 공부방 튜터(범위 → 읽기 → 지도 → 문제 → 다음 개념). 과목·자료·토큰·주소는 모두 지어낸 예시다(가짜 eTL · 저장소 · Claude만 씀).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeCtx, addTestUser } from './helpers/server.js';
import { STUDY_TOOLS, StudyError, mapText, parsePages, pagesText } from '../14_study.js';
import { seal } from '../lib/secret.js';

const NOW = Date.parse('2026-11-19T01:00:00Z'); // 한국 11/19(목) 10:00
const TOKEN = `10260~${'EXAMPLEtoken'.repeat(6)}`;
const STORE = 'https://storage.example.invalid';
const realFetch = globalThis.fetch;
const realNow = Date.now;

// 가짜 eTL: 과목 201(예시 물리학)의 파일 탭 501 · 502 · 503(pptx), 모듈에만 있는 504(이름에 확장자 없음 → 열어 보면 hwp)
let files;
const modules = [
  { name: '1주차', items: [{ type: 'File', content_id: '501', title: '1주차 운동.pdf' }] },
  { name: '2주차', items: [{ type: 'File', content_id: '502', title: '2주차 에너지.pdf' }, { type: 'Page', title: '읽을거리' }, { type: 'File', content_id: '504', title: '2주차 보충' }] },
];
const META = {
  501: { display_name: '1주차 운동.pdf', 'content-type': 'application/pdf' },
  502: { display_name: '2주차 에너지.pdf', 'content-type': 'application/pdf' },
  504: { display_name: '2주차 보충.hwp', 'content-type': 'application/x-hwp' },
};
// 가짜 eTL 과목 202(예시 수학): 파일 탭 · 페이지 탭 · 모듈(파일 · 페이지 · 링크 · 외부 도구 · 과제)
let files202;
let modules202;
const pages202 = [{ url: 'week1-notes', title: '1주차 노트', html_url: 'https://myetl.snu.ac.kr/courses/202/pages/week1-notes', created_at: '2026-09-01T09:00:00+09:00', updated_at: '2026-09-01T09:00:00+09:00', published: true }];
const BODY = `<h2>집합</h2><p>${'가'.repeat(2000)}</p><p>합집합 <img class="equation_image" data-equation-content="A \\cup B" alt="LaTeX: A \\cup B"></p><ul><li>교집합</li></ul><p>${'나'.repeat(2000)}</p><iframe src="https://video.example.invalid/embed/1"></iframe>`;
Object.assign(META, {
  601: { display_name: '1강 집합.pdf', 'content-type': 'application/pdf' },
  602: { display_name: '2강 함수.pdf', 'content-type': 'application/pdf' },
  611: { display_name: '1강 집합.pdf', 'content-type': 'application/pdf' },
});
const aiReplies = [];
const aiBodies = [];
const downloads = [];

const j = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

async function fakeFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const u = new URL(url);
  if (u.origin === 'https://api.anthropic.com') {
    aiBodies.push(JSON.parse(init.body));
    const input = aiReplies.shift();
    return j({ model: 'claude-haiku-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'answer', input }], usage: { input_tokens: 9000, output_tokens: 1200 } });
  }
  if (u.origin === STORE) return new Response('%PDF-예시', { status: 200 });
  assert.equal(u.origin, 'https://myetl.snu.ac.kr');
  const auth = (init.headers && init.headers.authorization) || '';
  if (u.pathname.startsWith('/files/')) {
    // 내려받기 주소(검증값) → 저장소로 넘김. 토큰은 여기 안 간다
    assert.equal(auth, '', '내려받기 주소에는 토큰을 보내지 않는다');
    downloads.push(url);
    const id = u.pathname.split('/')[2];
    return new Response(null, { status: 302, headers: { location: `${STORE}/${id}?sig=EXAMPLE` } });
  }
  assert.equal(auth, `Bearer ${TOKEN}`);
  const p = u.pathname;
  if (p === '/api/v1/courses') return j([{ id: '201', name: '예시 물리학', term: { name: '2026년 2학기' } }, { id: '202', name: '예시 수학', term: { name: '2026년 2학기' } }]);
  if (p === '/api/v1/courses/201/files') return j(files);
  if (p === '/api/v1/courses/201/modules') return j(modules);
  if (p === '/api/v1/courses/202/files') return j(files202);
  if (p === '/api/v1/courses/202/modules') return j(modules202);
  if (p === '/api/v1/courses/202/pages') return j(pages202);
  if (p === '/api/v1/courses/202/pages/week1-notes') return j({ ...pages202[0], body: BODY });
  const m = /^\/api\/v1\/files\/(\d+)$/.exec(p);
  if (m && META[m[1]]) return j({ id: m[1], ...META[m[1]], url: `https://myetl.snu.ac.kr/files/${m[1]}/download?download_frd=1&verifier=EXAMPLEverifier` });
  return new Response('{}', { status: 404 });
}

test.before(() => {
  Date.now = () => NOW;
  globalThis.fetch = fakeFetch;
});
test.after(() => {
  Date.now = realNow;
  globalThis.fetch = realFetch;
});

const page = (n, text = `${n}쪽 예시 내용`) => ({ page: n, label: '', text });

test('쪽 번호 글 ↔ 목록', () => {
  assert.deepEqual(parsePages('1-3, 5,7~8'), [1, 2, 3, 5, 7, 8]);
  assert.equal(parsePages('2-1'), null);
  assert.equal(parsePages('4', 3), null);
  assert.equal(parsePages('a'), null);
  assert.equal(pagesText([5, 1, 2, 3, 8]), '1-3,5,8');
});

test('공부방: 범위를 먼저 묻고 → 모든 쪽을 읽고 → 지도 → 문제로 빈틈을 채운다', async () => {
  files = [
    { id: '501', display_name: '1주차 운동.pdf', 'content-type': 'application/pdf', created_at: '2026-09-01T10:00:00+09:00' },
    { id: '502', display_name: '2주차 에너지.pdf', 'content-type': 'application/pdf', created_at: '2026-09-08T10:00:00+09:00' },
    { id: '503', display_name: '3주차 발표.pptx', 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', created_at: '2026-09-15T10:00:00+09:00' },
  ];
  const env = makeEnv({ ANTHROPIC_API_KEY: 'test-key' });
  const user = await addTestUser(env);
  const ctx = makeCtx();
  const call = (name, args = {}) => STUDY_TOOLS.find((t) => t.name === name).run(args, { env, ctx, user });
  const fails = async (name, args, re) => {
    await assert.rejects(call(name, args), (err) => err instanceof StudyError && re.test(err.message));
  };
  await env.DB.prepare('INSERT INTO etl (user_id, token, term) VALUES (?, ?, ?)').bind(user.id, await seal(env, TOKEN), '2026년 2학기').run();
  await env.DB.prepare("INSERT INTO events (user_id, title, start, source) VALUES (?, '예시 물리학 중간고사', '2026-12-01T10:00:00+09:00', 'etl')").bind(user.id).run();

  // 1. 처음: 과목마다 방이 이미 보이고, 튜토리얼과 규칙이 같이 간다
  const rooms = await call('study_rooms');
  assert.equal(rooms.first_time, true);
  assert.match(rooms.tutorial, /튜터/);
  assert.match(rooms.playbook, /하나도 빼지 않는다/);
  assert.deepEqual(rooms.rooms.map((r) => [r.course, r.opened]), [['예시 물리학', false], ['예시 수학', false]]);

  // 2. 방 열기 → 범위 단계. 자료는 주차(모듈) 순서, 모듈에 없는 자료는 뒤에
  const room = await call('study_room', { course: '물리' });
  assert.equal(room.phase, 'scope');
  assert.deepEqual(room.files.map((f) => [f.id, f.state]), [['501', 'undecided'], ['502', 'undecided'], ['504', 'undecided'], ['503', 'undecided']]);
  assert.equal(room.files[2].module, '2주차');
  assert.deepEqual(room.exam_hints.events, [{ title: '예시 물리학 중간고사', date: '2026-12-01' }]);
  assert.match(room.todo, /시험 범위를 먼저/);
  assert.equal((await call('study_rooms')).first_time, undefined);

  // 3. 범위: 시험을 먼저, 없는 번호는 아무것도 안 바꾼다, 미정이 남으면 아직 scope
  await fails('study_set_scope', { course: '물리', include: ['501'] }, /어떤 시험인지/);
  await fails('study_set_scope', { course: '물리', exam: '중간고사', include: ['501', '999'] }, /없는 번호: 999/);
  let scope = await call('study_set_scope', { course: '물리', exam: '중간고사', exam_date: '2026-12-01', note: '1~2주차', include: ['501', '502'], exclude: ['503'] });
  assert.equal(scope.phase, 'scope');
  assert.equal(scope.d_day, 'D-12');
  assert.deepEqual(scope.undecided, ['504 2주차 보충']);
  scope = await call('study_set_scope', { course: '물리', others: 'in' });
  assert.equal(scope.phase, 'read');
  await fails('study_read', { course: '물리', file: '503' }, /범위 밖/);

  // 4. 읽기: 쪽 수를 모르면 1쪽부터. 모델이 준 범위 밖 쪽(9)은 버린다. 파일은 저장소 주소로만 Claude에 간다
  aiReplies.push({ total_pages: 3, pages: [page(1), page(2), page(3), page(9)] });
  const r1 = await call('study_read', { course: '물리', file: '501' });
  assert.deepEqual(r1.pages.map((p) => p.page), [1, 2, 3]);
  assert.equal(r1.total_pages, 3);
  assert.equal(r1.unread, '');
  assert.equal(r1.missing, undefined);
  const doc = aiBodies[0].messages[0].content[0];
  assert.deepEqual(doc, { type: 'document', source: { type: 'url', url: `${STORE}/501?sig=EXAMPLE` } });
  assert.match(aiBodies[0].messages[0].content[1].text, /1~12쪽/);
  assert.ok(!JSON.stringify(aiBodies).includes('verifier'), '검증값 붙은 eTL 주소는 Claude에 안 간다');

  // 5. 지도: 빠진 쪽이 있으면 저장 안 함
  const map501 = { course: '물리', file: '501', sections: [{ title: '운동', pages: '2-3', concepts: [{ name: '속도', pages: '2' }, { name: '가속도', pages: '3' }] }] };
  await fails('study_save_map', map501, /빠진 쪽: 1/);
  const saved = await call('study_save_map', { ...map501, skip: [{ pages: '1', why: '표지' }] });
  assert.equal(saved.concepts, 2);
  assert.equal(saved.phase, 'read');
  await fails('study_save_map', { course: '물리', file: '502', sections: map501.sections }, /아직 안 읽은 자료/);

  // 6. 모델이 쪽을 빠뜨리면 읽은 것으로 치지 않고, 다음 읽기가 그 쪽부터
  aiReplies.push({ total_pages: 2, pages: [page(1)] });
  const r2 = await call('study_read', { course: '물리', file: '502' });
  assert.equal(r2.missing, '2');
  assert.equal(r2.unread, '2');
  await fails('study_save_map', { course: '물리', file: '502', sections: [{ title: '에너지', pages: '1-2', concepts: [{ name: '일', pages: '1-2' }] }] }, /아직 안 읽은 쪽: 2/);
  aiReplies.push({ total_pages: 2, pages: [page(2)] });
  const r3 = await call('study_read', { course: '물리', file: '502' });
  assert.match(aiBodies[2].messages[0].content[1].text, /^2쪽/);
  assert.equal(r3.read, '1-2');
  await call('study_save_map', { course: '물리', file: '502', sections: [{ title: '에너지', pages: '1-2', concepts: [{ name: '일', pages: '1' }, { name: '운동에너지', pages: '2' }] }] });

  // 7. 못 읽는 형식(모듈에만 있어 몰랐는데 열어 보니 hwp) → 사용자가 채팅에 올리면 AI가 읽고 by_client
  await fails('study_read', { course: '물리', file: '504' }, /못 읽는 형식/);
  assert.equal(aiBodies.length, 3, 'hwp는 Claude에 보내지 않는다');
  const again = await call('study_room', { course: '물리' });
  assert.equal(again.files.find((f) => f.id === '504').state, 'unreadable', '다시 열어도 알아낸 형식을 기억한다');
  assert.equal(again.phase, 'read');
  await fails('study_save_map', { course: '물리', file: '504', by_client: true, sections: [{ title: '보충', pages: '1', concepts: [{ name: '연습문제', pages: '1' }] }] }, /total_pages/);
  const last = await call('study_save_map', { course: '물리', file: '504', by_client: true, total_pages: 1, sections: [{ title: '보충', pages: '1', concepts: [{ name: '연습문제', pages: '1' }] }] });
  assert.equal(last.phase, 'tutor');

  // 8. 문제 순서: 절마다 진단 → 약한 절의 안 본 개념 → 3문제 뒤 빈틈 다시 → … → 다 ✓면 done
  const order = [];
  let next = last.next;
  const answers = { 속도: ['wrong', 'ok'], 일: ['ok'], 연습문제: ['part', 'ok'], 가속도: ['ok'], 운동에너지: ['ok'] };
  let out;
  while (next) {
    order.push(`${next.name}:${next.why}`);
    const result = answers[next.name].shift();
    out = await call('study_record', { course: '물리', results: [{ id: next.id, result, question: `${next.name} 예시 문제`, note: result === 'ok' ? undefined : '예시: 단위를 빠뜨림' }] });
    next = out.next;
    assert.ok(order.length < 20);
  }
  assert.deepEqual(order, ['속도:diagnose', '일:diagnose', '연습문제:diagnose', '가속도:new', '속도:gap', '운동에너지:new', '연습문제:gap']);
  assert.equal(out.phase, 'done');
  assert.equal(out.stats.percent, 100);

  // 9. 지도: 오답 노트는 ✓로 닫히고, 창(MCP Apps)과 글 지도가 같은 결과를 보인다
  const map = await STUDY_TOOLS.find((t) => t.name === 'study_map').run({ course: '물리' }, { env, ctx, user });
  assert.deepEqual(map.wrong_open, []);
  assert.equal(map.files[0].sections[0].done, '2/2');
  assert.match(map.map_text, /확인 5\/5 \(100%\)/);
  assert.match(map.map_text, /– 범위 밖: 4\. 3주차 발표\.pptx/);
  assert.equal(map.map_text, mapText(map));

  // 10. 다시 지도를 내도(절 이름이 바뀌어도) 같은 이름의 개념은 결과를 잇는다
  const remap = await call('study_save_map', { course: '물리', file: '501', sections: [{ title: '1차원 운동', pages: '1-3', concepts: [{ name: '속도', pages: '1-2' }, { name: '가속도', pages: '3' }] }] });
  assert.equal(remap.stats.ok, 5);

  // 11. 사용자가 '범위 아님'이라고 한 절은 빠지고 문제도 안 받는다
  const ex = await call('study_set_scope', { course: '물리', exclude: ['502.1'] });
  assert.equal(ex.stats.concepts, 3);
  await fails('study_record', { course: '물리', results: [{ id: '502.1.1', result: 'ok' }] }, /범위 안 개념이 아니에요/);

  // 12. 교수님이 새 자료를 올리면 다시 범위부터 묻는다
  files.push({ id: '505', display_name: '4주차 회전.pdf', 'content-type': 'application/pdf', created_at: '2026-11-18T10:00:00+09:00' });
  const fresh = await call('study_room', { course: '물리' });
  assert.equal(fresh.phase, 'scope');
  assert.equal(fresh.files.find((f) => f.id === '505').state, 'undecided');

  // 13. 하루 읽기 한도 · 기록에 서명 주소 없음
  await ctx.settle();
  const logs = (await env.DB.prepare("SELECT action, detail FROM log WHERE user_id = ? AND action LIKE 'study%'").bind(user.id).all()).results;
  assert.equal(logs.filter((l) => l.action === 'study_read').length, 3);
  assert.ok(!JSON.stringify(logs).includes('sig='));
  env.STUDY_READS_PER_DAY = '3';
  await fails('study_read', { course: '물리', file: '501', pages: '2' }, /한도\(3번\)/);
  assert.ok(downloads.every((d) => d.includes('/files/') && !d.includes('authorization')));
});

test('공부방: eTL 페이지 · 링크도 자료, 고친 판은 범위와 결과를 잇고 다시 읽는다', async () => {
  const pdf = (id, name, created, modified = created) => ({ id, display_name: name, 'content-type': 'application/pdf', created_at: created, modified_at: modified });
  files202 = [pdf('601', '1강 집합.pdf', '2026-09-01T10:00:00+09:00'), pdf('602', '2강 함수.pdf', '2026-09-08T10:00:00+09:00'), pdf('603', '3강 부록.pdf', '2026-09-15T10:00:00+09:00')];
  modules202 = [
    {
      name: '1주차',
      items: [
        { id: 9101, type: 'File', content_id: '601', title: '1강 집합.pdf' },
        { id: 9102, type: 'Page', page_url: 'week1-notes', title: '1주차 노트', html_url: 'https://myetl.snu.ac.kr/courses/202/modules/items/9102' },
        { id: 9103, type: 'ExternalUrl', title: '참고 영상', external_url: 'https://video.example.invalid/watch/1' },
        { id: 9104, type: 'Assignment', content_id: '77', title: '과제 1' },
      ],
    },
    {
      name: '2주차',
      items: [
        { id: 9201, type: 'File', content_id: '602', title: '2강 함수.pdf' },
        { id: 9202, type: 'ExternalTool', title: '녹화 강의', html_url: 'https://myetl.snu.ac.kr/courses/202/modules/items/9202' },
      ],
    },
  ];
  const env = makeEnv({ ANTHROPIC_API_KEY: 'test-key' });
  const user = await addTestUser(env);
  const ctx = makeCtx();
  const call = (name, args = {}) => STUDY_TOOLS.find((t) => t.name === name).run(args, { env, ctx, user });
  const fails = async (name, args, re) => {
    await assert.rejects(call(name, args), (err) => err instanceof StudyError && re.test(err.message));
  };
  await env.DB.prepare('INSERT INTO etl (user_id, token, term) VALUES (?, ?, ?)').bind(user.id, await seal(env, TOKEN), '2026년 2학기').run();
  const course = '수학';

  // 1. 자료 = 파일 + eTL 페이지 + 링크 + 외부 도구(과제는 아님), 주차 순. 처음 열 때는 바뀐 것 알림이 없다
  const room = await call('study_room', { course });
  assert.deepEqual(room.files.map((f) => [f.id, f.type]), [['601', 'pdf'], ['page-week1-notes', 'page'], ['link-9103', 'link'], ['602', 'pdf'], ['tool-9202', 'tool'], ['603', 'pdf']]);
  assert.equal(room.files[2].url, 'https://video.example.invalid/watch/1');
  assert.equal(room.etl_changes, undefined);
  await call('study_set_scope', { course, exam: '기말고사', include: ['601', 'page-week1-notes', 'link-9103', '602'], exclude: ['603', 'tool-9202'] });

  // 2. eTL 페이지: Claude 없이 본문을 글로(수식 → LaTeX, 목록, 삽입 영상 주소), 3000자쯤씩 쪽으로
  const before = aiBodies.length;
  const pg = await call('study_read', { course, file: 'page-week1-notes' });
  assert.equal(aiBodies.length, before, '페이지는 Claude를 부르지 않는다');
  assert.equal(pg.total_pages, 2);
  assert.match(pg.pages[0].text, /^집합\n가+\n합집합 \$A \\cup B\$\n- 교집합$/);
  assert.match(pg.pages[1].text, /\[삽입: https:\/\/video\.example\.invalid\/embed\/1\]$/);
  await call('study_save_map', { course, file: 'page-week1-notes', sections: [{ title: '집합 연산', pages: '1-2', concepts: [{ name: '합집합', pages: '1' }, { name: '교집합', pages: '1-2' }] }] });

  // 3. 링크는 못 읽음 → AI 앱이 읽거나 사용자가 올린 내용으로 by_client
  await fails('study_read', { course, file: 'link-9103' }, /링크라 Tachyon이 못 읽어요\(https:\/\/video\.example\.invalid\/watch\/1\)/);
  await call('study_save_map', { course, file: 'link-9103', by_client: true, total_pages: 1, sections: [{ title: '영상', pages: '1', concepts: [{ name: '벤 다이어그램', pages: '1' }] }] });

  // 4. PDF 두 개를 읽고 지도 → 문제
  aiReplies.push({ total_pages: 2, pages: [page(1), page(2)] });
  await call('study_read', { course, file: '601' });
  await call('study_save_map', { course, file: '601', sections: [{ title: '집합', pages: '1-2', concepts: [{ name: '집합의 정의', pages: '1' }, { name: '부분집합', pages: '2' }] }] });
  aiReplies.push({ total_pages: 1, pages: [page(1)] });
  await call('study_read', { course, file: '602' });
  await call('study_save_map', { course, file: '602', sections: [{ title: '함수', pages: '1', concepts: [{ name: '함수의 정의', pages: '1' }] }] });
  await call('study_record', { course, results: [{ id: '601.1.1', result: 'wrong', question: '예시 문제' }, { id: '601.1.2', result: 'ok' }, { id: '602.1.1', result: 'ok' }] });

  // 5. 교수님이 고침: 601을 같은 이름으로 덮어 올림(새 번호 611), 범위 밖이던 603을 '(수정)'으로 다시, 602를 내리고 이름에 숫자만 붙은 606을 새로
  files202 = [pdf('611', '1강 집합.pdf', '2026-11-19T09:00:00+09:00'), pdf('606', '2강 함수2.pdf', '2026-11-18T10:00:00+09:00'), pdf('613', '3강 부록(수정).pdf', '2026-11-19T10:00:00+09:00')];
  modules202[0].items[0].content_id = '611';
  modules202[1].items.shift();
  const after = await call('study_room', { course });
  assert.deepEqual(after.etl_changes, { new: ['606 2강 함수2.pdf'], revised: ['611 1강 집합.pdf', '613 3강 부록(수정).pdf'], gone: ['602 2강 함수.pdf'] });
  const f = (id) => after.files.find((it) => it.id === id);
  assert.equal(f('601'), undefined, '예전 판은 고친 판으로 넘어가 사라진다');
  assert.deepEqual([f('611').state, f('611').revised_from], ['unread', '1강 집합.pdf'], '범위 안이던 것은 안으로 잇고 다시 읽는다');
  assert.deepEqual([f('613').state, f('613').revised_from], ['undecided', '3강 부록.pdf'], '범위 밖이던 것의 고친 판은 다시 묻는다');
  assert.equal(f('606').state, 'undecided', '숫자만 다른 이름은 다른 자료');
  assert.deepEqual([f('602').gone, f('602').state], [true, 'mapped'], '내려간 자료는 진도째 남는다');
  assert.equal(after.phase, 'scope');
  assert.equal(after.stats.concepts, 4);
  assert.match(after.map_text, /1강 집합\.pdf \(고친 판\) — 아직 안 읽음/);
  assert.match(after.map_text, /1주차 노트 \[eTL 페이지\]/);

  // 6. 고친 판을 다시 읽고 지도를 내면 같은 이름 개념의 결과(✗ · ✓)와 오답 노트가 이어진다
  await call('study_set_scope', { course, include: ['606'], exclude: ['613'] });
  aiReplies.push({ total_pages: 3, pages: [page(1), page(2), page(3)] });
  await call('study_read', { course, file: '611' });
  const remap = await call('study_save_map', { course, file: '611', sections: [{ title: '집합', pages: '1-3', concepts: [{ name: '집합의 정의', pages: '1' }, { name: '부분집합', pages: '2' }, { name: '공집합', pages: '3' }] }] });
  assert.equal(remap.stats.ok, 2);
  const map = await call('study_map', { course });
  assert.deepEqual(map.files.find((it) => it.id === '611').sections[0].concepts.map((c) => c.s), ['wrong', 'ok', null]);
  assert.equal(map.files.find((it) => it.id === '611').revised_from, undefined);
  assert.deepEqual(map.wrong_open.map((w) => w.name), ['집합의 정의']);

  // 7. 같은 번호의 내용이 바뀌면(eTL 수정 시각) 그 자료만 다시 읽는다. 이미 알린 내려간 자료는 또 알리지 않는다
  files202[0].modified_at = '2026-11-20T09:00:00+09:00';
  const edited = await call('study_room', { course });
  assert.deepEqual(edited.etl_changes, { new: [], revised: ['611 1강 집합.pdf'], gone: [] });
  assert.equal(edited.files.find((it) => it.id === '611').state, 'unread');
  assert.equal((await call('study_room', { course })).etl_changes, undefined);
});
