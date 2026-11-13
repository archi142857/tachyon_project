// 일정 고치기 칸: 이름 · 날짜 · 시작 · 끝 · 장소. 팝업의 '고치기'와 달력 칸 누르기에서 같이 쓴다.
// 시작 시각을 비우면 종일 일정, 끝을 비우면 1시간(11-13 사람, 서버 규칙과 같다). 시작을 고르면 빈 끝 칸에 +1시간을 미리 채운다.
import { dateInput, endOrHour, isoFromInputs, plusHourText, timeInput } from '../time.js';

const known = (v) => (v == null || v === '?' ? '' : v);

// 서버의 팝업 { title, date, time, end_time, place }('?' = 모름) → 입력칸 값
export function popupToForm(p) {
  return { title: known(p.title), date: known(p.date), start: known(p.time), end: known(p.end_time), place: known(p.place) };
}

// 입력칸 값 → 팝업 저장 모양. 빈칸은 다시 '?'. 시작이 있고 끝이 비면 +1시간(자정을 넘으면 '?' — 서버가 +1시간으로 넣는다)
export function formToPopup(form) {
  const or = (v) => (v && v.trim() ? v.trim() : '?');
  const end = or(form.end) === '?' && form.start ? plusHourText(form.start.trim()) || '?' : or(form.end);
  return { title: or(form.title), date: or(form.date), time: or(form.start), end_time: end, place: or(form.place) };
}

// 달력의 일정 → 입력칸 값(종일 일정은 시각 칸이 빈다)
export function eventToForm(ev) {
  return {
    title: ev.title || '',
    date: dateInput(ev.start),
    start: ev.all_day ? '' : timeInput(ev.start),
    end: ev.all_day || !ev.end ? '' : timeInput(ev.end),
    place: ev.place || '',
  };
}

// 입력칸 값 → 일정 고치기 모양. 시작이 비면 날짜만(종일). 끝이 비었거나 시작보다 이르면 시작 + 1시간(자정을 넘어도 된다).
export function formToEvent(form) {
  const start = isoFromInputs(form.date, form.start) || form.date;
  const end = !form.start ? null : form.end && form.end > form.start ? isoFromInputs(form.date, form.end) : endOrHour(start, null);
  return { title: form.title.trim(), start, end, place: form.place.trim() || null };
}

export default function EventForm({ form, onChange, idPrefix, autoFocus = false }) {
  const set = (key) => (e) => onChange({ ...form, [key]: e.target.value });
  // 시작을 고르면 끝이 비었거나 시작보다 이를 때 +1시간을 미리 채운다(자정을 넘으면 비워 둔다 — 저장할 때 +1시간)
  const setStart = (e) => {
    const start = e.target.value;
    const end = start && (!form.end || form.end <= start) ? plusHourText(start) || '' : form.end;
    onChange({ ...form, start, end });
  };
  return (
    <div className="form-grid">
      <label className="field" htmlFor={`${idPrefix}-title`}>
        <span>이름</span>
        <input id={`${idPrefix}-title`} className="input" value={form.title} onChange={set('title')} autoComplete="off" data-autofocus={autoFocus || undefined} />
      </label>
      <div className="form-row">
        <label className="field">
          <span>날짜</span>
          <input type="date" className="input" value={form.date} onChange={set('date')} />
        </label>
        <label className="field">
          <span>시작</span>
          <input type="time" className="input" value={form.start} onChange={setStart} />
        </label>
        <label className="field">
          <span>끝</span>
          <input type="time" className="input" value={form.end} onChange={set('end')} />
        </label>
      </div>
      <label className="field">
        <span>장소</span>
        <input className="input" value={form.place} onChange={set('place')} autoComplete="off" />
      </label>
      <p className="hint">시작을 비우면 하루 종일, 끝을 비우면 1시간으로 넣어요.</p>
    </div>
  );
}
