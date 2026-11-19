// lib/twins.js 시험 (담당: 서버 세션). 과목 · 일정은 모두 지어낸 예시다.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTwins, sameTitle } from '../lib/twins.js';

let n = 0;
const ev = (title, start, end, source, more = {}) => ({ id: ++n, title, start, end, place: null, source, important: 0, remind: null, ...more });
const T = (hm, d = '2026-11-16') => `${d}T${hm}:00+09:00`;

test('sameTitle: 띄어쓰기 · 기호 · 품기 · 비슷한 말', () => {
  assert.ok(sameTitle('예시 공학 및 소프트웨어 시스템', '예시 공학 및 소프트 웨어 시스템'));
  assert.ok(sameTitle('예배', 'CCC 예배'));
  assert.ok(sameTitle('예시수학 2 중간고사2', '예시수학 2 중간 2'));
  assert.ok(!sameTitle('성경 읽기 (아침)', '아침 모임'));
  assert.ok(!sameTitle('합주 · A팀', '합주 · B밴드'));
  assert.ok(!sameTitle('', '예배'));
});

test('mergeTwins: 여러 캘린더가 따로 가져온 같은 일정을 하나로', () => {
  const list = [
    ev('예시수학 2 중간고사2', '2026-11-16', '2026-11-17', 'notice'),
    ev('예시수학 2', T('09:30'), T('10:45'), 'etl', { place: '예시동 101호' }),
    ev('예시수학 2 중간 2', T('09:30'), T('10:45'), 'device'),
    ev('예시 공학 및 소프트웨어 시스템', T('13:00'), T('15:50'), 'etl', { place: '예시동 202호' }),
    ev('예시 공학 및 소프트 웨어 시스템', T('13:00'), T('16:00'), 'device', { important: 1 }),
    ev('예시과목 휴강', '2026-11-16', '2026-11-17', 'notice'),
    ev('예시과목 휴강', '2026-11-16', '2026-11-17', 'notice'),
    ev('CCC 예배', T('17:30'), T('22:00'), 'memo', { place: '예시동 B101' }),
    ev('예배', T('17:45'), T('22:00'), 'device'),
    ev('초청 예배', T('19:00'), T('19:30'), 'device'), // 시작이 30분 넘게 달라 따로
    ev('성경 읽기 (아침)', T('08:00'), T('08:15'), 'device'),
    ev('아침 모임', T('08:00'), T('08:30'), 'device'), // 제목이 달라 따로
    ev('예시과목 시험 기간', '2026-11-16', '2026-11-19', 'notice'), // 여러 날 종일은 그날 수업에 안 붙인다
    ev('예시과목', T('11:00'), T('12:15'), 'etl'),
  ];
  const out = mergeTwins(list);
  const by = (t) => out.filter((e) => e.title === t);

  assert.equal(by('예시수학 2 중간고사2').length, 1);
  assert.deepEqual(by('예시수학 2 중간고사2')[0], { ...list[1], title: '예시수학 2 중간고사2' }); // 시각 · 장소는 eTL 수업
  assert.deepEqual(
    out.find((e) => e.id === list[3].id),
    { ...list[3], important: 1 }, // 띄어쓰기만 다른 폰 캘린더 것은 사라지고, 별표는 남는다
  );
  assert.deepEqual(by('예시과목 휴강').map((e) => [e.start, e.source]), [[T('11:00'), 'etl']]); // 공지 둘 + 그날 수업 → 수업 시각의 '휴강' 하나
  assert.deepEqual(by('CCC 예배')[0], list[7]);
  assert.equal(by('예배').length, 0);
  for (const t of ['초청 예배', '성경 읽기 (아침)', '아침 모임', '예시과목 시험 기간']) assert.equal(by(t).length, 1, t);
  assert.equal(out.length, 8);
  assert.deepEqual(
    out.map((e) => e.start),
    [...out.map((e) => e.start)].sort(),
  );
});

test('mergeTwins: 끝 · 장소가 빈 것은 합친 다른 것에서 채운다', () => {
  const notice = ev('예시과목 중간고사', T('09:00', '2026-10-27'), null, 'notice');
  const phone = ev('예시과목', T('09:00', '2026-10-27'), T('12:00', '2026-10-27'), 'device', { place: '예시동 3층' });
  assert.deepEqual(mergeTwins([notice, phone]), [{ ...notice, end: phone.end, place: '예시동 3층' }]);
  const one = [ev('혼자', T('10:00'), null, 'memo')];
  assert.deepEqual(mergeTwins(one), one);
});
