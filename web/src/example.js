// 예시 자료: 모두 지어낸 것이다(실제 사람·수업·일정이 아니다).
// 서버 없이 화면을 볼 때('예시로 둘러보기', 주소 끝 ?example)만 쓰고, 화면 위에 '예시 자료'를 띄운다.
// 모양은 서버와 같다: 시각은 '…T15:00:00+09:00', 종일 일정은 날짜만, 팝업의 모르는 칸은 '?'.
import { fromKst, kst, plusHourText, toKstIso, weekStart } from './time.js';

const two = (n) => String(n).padStart(2, '0');
const ymd = (p) => `${p.y}-${two(p.m)}-${two(p.d)}`;

export function makeExample(now = new Date()) {
  const mon = kst(weekStart(now));
  const at = (day, h, min = 0) => toKstIso(fromKst(mon.y, mon.m, mon.d + day, h, min));
  const todayWd = kst(now).wd; // 0 = 월
  const demoDay = todayWd <= 4 ? todayWd : 7; // 동선 예시를 둘 날: 평일이면 오늘, 주말이면 다음 월요일
  const ago = (minutes) => toKstIso(new Date(new Date(now).getTime() - minutes * 60000));
  let n = 0;
  const id = () => ++n;
  const ev = (day, [h1, m1], [h2, m2], title, place, source, important = 0) => ({
    id: id(),
    title,
    start: at(day, h1, m1),
    end: at(day, h2, m2),
    place,
    source,
    important,
  });

  const events = [
    ev(0, [10, 0], [11, 15], '미적분학', '26동', 'timetable'),
    ev(0, [13, 0], [14, 15], '일반화학', '500동', 'timetable'),
    ev(1, [9, 30], [10, 45], '유기화학', '500동', 'timetable'),
    ev(1, [13, 0], [14, 50], '생명과학 실험', '500동', 'timetable'),
    ev(2, [10, 0], [11, 15], '미적분학', '26동', 'timetable'),
    ev(2, [13, 0], [14, 15], '일반화학', '500동', 'timetable'),
    ev(3, [9, 30], [10, 45], '유기화학', '500동', 'timetable'),
    ev(3, [19, 0], [20, 0], '조별 과제 회의', '온라인', 'ics'),
    ev(4, [10, 0], [11, 15], '영어 글쓰기', '2동', 'timetable'),
    ev(4, [15, 0], [16, 0], '일반화학 퀴즈', '500동', 'timetable', 1),
    ev(5, [11, 0], [15, 0], '알바', null, 'memo'),
    ev(6, [18, 0], [20, 0], '가족 저녁', null, 'ics'),
    ev(9, [10, 0], [11, 15], '미적분학', '26동', 'timetable'),
    ev(11, [14, 0], [16, 0], '동아리 정기 모임', '학생회관', 'ics'),
    // 수업 사이 동선(TT Wizard 걷는 시간)을 보이는 오후 세 수업 — 주간 달력이 오늘부터라 오늘(주말이면 다음 월요일)에 둔다.
    // 500동 → 43-1동은 걷기 7분·쉬는 시간 15분으로 괜찮고, 43-1동 → 301동은 걷기 17분인데 쉬는 시간 15분 → '2분 지각'
    ev(demoDay, [16, 30], [17, 20], '공학수학 실습', '500동', 'timetable'),
    ev(demoDay, [17, 35], [18, 25], '물리학', '43-1동', 'timetable'),
    ev(demoDay, [18, 40], [19, 30], '공학수학', '301동 118호', 'timetable'),
  ];
  const alba = events.find((e) => e.title === '알바');

  return {
    user: { id: 0, email: 'example@example.com', name: '예시 사용자', dept: null, year: null, setup_done: false },
    feeds: [{ kind: 'etl', set: false }, { kind: 'google', set: false }, { kind: 'apple', set: false }],
    events,
    tasks: [
      { id: id(), title: '유기화학 문제풀이 3장', due: at(2, 23, 59), minutes: 120, ready: 1, done: 0, source: 'etl' },
      { id: id(), title: '생명과학 실험 보고서', due: at(3, 18, 0), minutes: 180, ready: 0, done: 0, source: 'etl' },
      { id: id(), title: '영어 에세이 초안', due: at(4, 23, 59), minutes: 120, ready: 1, done: 0, source: 'etl' },
      { id: id(), title: '토론 글 올리기', due: at(6, 23, 59), minutes: 30, ready: 1, done: 0, source: 'etl' },
      { id: id(), title: '미적분학 과제 5', due: at(9, 23, 59), minutes: 90, ready: 1, done: 0, source: 'etl' },
    ],
    memos: [
      { id: id(), text: '토요일 알바 11시–3시', created_at: ago(20 * 60), handled: 1, event_id: alba.id },
      { id: id(), text: '과제 3장까지 풀기', created_at: ago(6 * 60), handled: 0, event_id: null },
      { id: id(), text: '동아리 회비 걷기 물어보기', created_at: ago(3 * 60), handled: 0, event_id: null },
    ],
    // eTL 연결(9_etl) 예시: 강의자료·공지 목록. 주소는 모양만 eTL(로그인해야 열림)
    etl: {
      status: { connected: true, last_ok_at: ago(25), last_error: null, dead: false, counts: { notice: 3, file: 3 } },
      notices: [
        { id: id(), course: '일반화학', title: '[중간고사 안내] 시험 시간·장소', url: 'https://myetl.snu.ac.kr/courses/0/discussion_topics/1', posted_at: ago(2 * 24 * 60), tag: 'exam' },
        { id: id(), course: '유기화학', title: '다음 주 목요일 휴강·보강 안내', url: 'https://myetl.snu.ac.kr/courses/0/discussion_topics/2', posted_at: ago(4 * 24 * 60), tag: 'cancel' },
        { id: id(), course: '미적분학', title: '과제 5 올렸습니다', url: 'https://myetl.snu.ac.kr/courses/0/discussion_topics/3', posted_at: ago(5 * 24 * 60), tag: 'none' },
      ],
      files: [
        { id: id(), course: '일반화학', title: '10주차 강의자료.pdf', url: 'https://myetl.snu.ac.kr/courses/0/files/1', posted_at: ago(26 * 60), tag: null },
        { id: id(), course: '유기화학', title: '중간고사 범위 정리.pdf', url: 'https://myetl.snu.ac.kr/courses/0/files/2', posted_at: ago(3 * 24 * 60), tag: null },
        { id: id(), course: '미적분학', title: '연습문제 5장.pdf', url: 'https://myetl.snu.ac.kr/courses/0/files/3', posted_at: ago(6 * 24 * 60), tag: null },
      ],
    },
  };
}

// 예시 모드에서만 쓰는 '일정·할 일처럼 보이나' 흉내. 진짜 판단은 서버(worker/3_memo_popup.js, 정규식 + Claude)가 한다.
// 서버와 같은 모양: 일정 { title, date, time, end_time, place, by }, 할 일 { kind: 'task', title, date, time, by }(마감 모르면 '?').
// 둘 다 아니면 null. 할 일 끝말은 서버 TODO_END와 같다(11-10 사람 "할 일만 딱 적으면 메모가 안 생김").
const WD = '월화수목금토일';

// 할 일 팝업: 서버처럼 쉼표로 여러 할 일을 나눈다(also). ponytail: 예시에서는 걸리는 시간을 모두 30분으로 어림한다(진짜는 서버 AI가 어림)
function taskPopup(title, date, time) {
  const [first, ...rest] = title.split(/\s*[,，、]\s*/).filter((x) => x.length >= 2);
  const also = rest.map((t) => ({ title: t, minutes: 30 }));
  return { kind: 'task', title: first || '?', date, time, minutes: 30, ...(also.length ? { also } : {}), by: 'rule' };
}

export function examplePopup(text, now = new Date()) {
  let rest = ` ${text} `;
  const today = kst(now);
  let offset = null;
  let m = rest.match(/\s(오늘|내일|모레)\s?/);
  if (m) {
    offset = { 오늘: 0, 내일: 1, 모레: 2 }[m[1]];
    rest = rest.replace(m[0], ' ');
  } else if ((m = rest.match(/\s(다음\s?주\s?)?([월화수목금토일])요일\s?/))) {
    let diff = WD.indexOf(m[2]) - today.wd;
    if (m[1]) diff += 7;
    else if (diff < 0) diff += 7;
    offset = diff;
    rest = rest.replace(m[0], ' ');
  }

  let time = '?';
  if ((m = rest.match(/(오전|오후)?\s?(\d{1,2})\s?시\s?(반|(\d{1,2})\s?분)?/))) {
    let hour = Number(m[2]);
    const minute = m[3] === '반' ? 30 : Number(m[4] || 0);
    if (m[1] === '오후' && hour < 12) hour += 12;
    else if (!m[1] && hour >= 1 && hour <= 7) hour += 12; // '3시 스터디'는 보통 오후 3시
    time = `${two(hour)}:${two(minute)}`;
    rest = rest.replace(m[0], ' ');
  } else if ((m = rest.match(/(\d{1,2}):(\d{2})/))) {
    time = `${two(Number(m[1]))}:${m[2]}`;
    rest = rest.replace(m[0], ' ');
  }
  if (offset === null && time === '?') return looksLikeTodo(text) ? taskPopup(tidyTask(text), '?', '?') : null;
  const due = ymd(kst(fromKst(today.y, today.m, today.d + (offset ?? 0))));
  if (/까지|마감|제출/.test(rest)) return taskPopup(tidyTask(rest), due, time);

  let place = '?';
  if ((m = rest.match(/\d{1,3}(-\d)?동(\s?\d{2,4}호)?/))) {
    place = m[0];
    rest = rest.replace(m[0], ' ');
  }
  // 서버(AI b5fe7db)처럼 적지 않았는데 채운 칸을 guessed로: 날짜를 안 쓰면 오늘, 끝을 안 쓰면 시작 + 1시간
  const end = time === '?' ? '?' : plusHourText(time) || '?';
  const guessed = [offset === null && 'date', end !== '?' && 'end_time'].filter(Boolean);
  return {
    title: rest.replace(/\s+/g, ' ').trim() || '?',
    date: due,
    time,
    end_time: end,
    place,
    by: 'rule',
    ...(guessed.length ? { guessed } : {}),
  };
}

const PAST = /(었|았|였|했)(다|음|어)/;
const TODO_END = /(?:기|할\s*것|할것|해야\s*(?:함|됨|돼|해|지|할\s*듯)?|하자|제출|신청|예약|연락|전화|구매|결제|준비|정리|확인|복습|예습|공부|등록|납부|반납|수정|출력|인쇄)$/;
const looksLikeTodo = (text) => !PAST.test(text) && TODO_END.test(text.trim().replace(/[\s.!~,;:]+$/, ''));
// 할 일 이름: 앞뒤 빈칸과 맨 앞 '까지'만 뗀다(쓴 말 그대로)
const tidyTask = (text) => text.replace(/\s+/g, ' ').trim().replace(/^까지\s*/, '');

// 지금 정리 예시(11-13): 서버(AI) 대신 규칙으로 — 아직 안 다룬 메모는 할 일 같으면 할 일, 아니면 '그냥 메모'. 걸리는 시간 모르는 할 일은 1시간 어림
export function exampleTidy(ex, now = new Date()) {
  const memos = ex.memos
    .filter((m) => !m.handled && !m.event_id && !m.task_id)
    .slice(0, 40)
    .map((m) => {
      const p = examplePopup(m.text, now);
      const task = p?.kind === 'task' || (!p && looksLikeTodo(m.text));
      if (!task) return { id: m.id, text: m.text, task: false, answered: true };
      const due = p && p.date !== '?' ? (p.time && p.time !== '?' ? `${p.date}T${p.time}:00+09:00` : p.date) : null;
      return { id: m.id, text: m.text, task: true, title: p ? p.title : tidyTask(m.text), due, minutes: p?.minutes ?? 60, ready: 'now', answered: true };
    });
  const tasks = ex.tasks.filter((t) => !t.done && t.minutes == null).slice(0, 40).map((t) => ({ id: t.id, title: t.title, due: t.due, minutes: 60, ready: 'now' }));
  const n = memos.filter((m) => m.task).length;
  const parts = [n && `할 일 ${n}개`, memos.length - n && `그냥 메모 ${memos.length - n}개`].filter(Boolean).join(' · ');
  const summary = memos.length || tasks.length ? [memos.length && `메모 ${memos.length}개 → ${parts}`, tasks.length && `걸리는 시간 ${tasks.length}개 어림`].filter(Boolean).join(' · ') : '정리할 메모가 없어요';
  return { plan: { memos, tasks }, summary, example: true };
}

export function applyExampleTidy(ex, plan) {
  let made = 0;
  for (const [i, m] of (plan.memos ?? []).entries()) {
    const memo = ex.memos.find((x) => x.id === m.id);
    if (!memo || memo.handled) continue;
    memo.handled = 1;
    if (!m.task) continue;
    const id = Date.now() + i;
    const due = m.due && m.due.length === 10 ? `${m.due}T23:59:00+09:00` : m.due || null;
    ex.tasks.push({ id, title: m.title, due, minutes: m.minutes ?? null, ready: m.ready === 'after' ? 0 : 1, done: 0, source: 'memo' });
    memo.task_id = id;
    made += 1;
  }
  let timed = 0;
  for (const t of plan.tasks ?? []) {
    const task = ex.tasks.find((x) => x.id === t.id);
    if (task && task.minutes == null && t.minutes) (task.minutes = t.minutes), (timed += 1);
  }
  const summary = [made && `할 일 ${made}개를 넣었어요`, timed && `걸리는 시간 ${timed}개를 채웠어요`].filter(Boolean).join(' · ') || '정리했어요';
  return { ok: true, applied: { memos: (plan.memos ?? []).length, tasks: made, minutes: timed }, summary };
}
