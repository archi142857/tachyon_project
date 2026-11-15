// 메모 '월요일 오전에 국축연 전화해보기'(사람 11-15 16:49 "추천 시간대가 오전이 아닌 것 같은데"):
// 팝업 추천은 그날 그때(서버 popup.plan)의 빈 시간, 이름표는 '내일 오전'처럼
import { describe, expect, it } from 'vitest';
import { planText } from './components/MemoPopup.jsx';
import { planLabel } from './tasks.js';
import { dayStart, fromKst, toKstIso } from './time.js';

const now = fromKst(2026, 11, 15, 16, 49); // 일요일 16:49
const plan = { events: [], tasks: [], today: dayStart(now).toISOString(), now };

describe('하기로 한 날·때', () => {
  it('이름표: 오늘 · 내일 · 모레, 그 뒤는 날짜', () => {
    expect(planLabel({ date: '2026-11-16', said: '오전' }, now)).toBe('내일 오전');
    expect(planLabel({ date: '2026-11-15', said: '저녁' }, now)).toBe('오늘 저녁');
    expect(planLabel({ date: '2026-11-17' }, now)).toBe('모레');
    expect(planLabel({ date: '2026-11-18', said: '오후' }, now)).toBe('11/18(수) 오후');
  });

  it('팝업 추천은 그날 그때: 오늘 16:50이 아니라 내일 오전', () => {
    const when = { date: '2026-11-16', from: 540, to: 720, said: '오전' };
    expect(planText([{ title: '국축연 전화해보기', minutes: 15 }], plan, when)).toEqual(['예상 15분 · 추천 내일 9:00–9:15']);
    // 그날 오전에 일정이 있으면 비켜서(9:00–10:30 수업 → 10:40)
    const busy = { ...plan, events: [{ id: 1, title: '수업', start: toKstIso(fromKst(2026, 11, 16, 9)), end: toKstIso(fromKst(2026, 11, 16, 10, 30)) }] };
    expect(planText([{ title: '국축연 전화해보기', minutes: 15 }], busy, when)).toEqual(['예상 15분 · 추천 내일 10:40–10:55']);
    // 때가 없는 할 일은 예전처럼 오늘 지금 뒤
    expect(planText([{ title: '보고서', minutes: 15 }], plan, undefined)).toEqual(['예상 15분 · 추천 16:50–17:05']);
  });
});
