// 일정 고치기 칸: 이름 · 날짜 · 시작 · 끝 · 장소. 팝업의 '고치기'와 달력 칸 누르기에서 같이 쓴다.
// 시작 시각을 비우면 종일 일정, 끝을 비우면 끝 모름(서버 규칙과 같다).
import { dateInput, isoFromInputs, timeInput } from '../time.js';

const known = (v) => (v == null || v === '?' ? '' : v);

// 서버의 팝업 { title, date, time, end_time, place }('?' = 모름) → 입력칸 값
export function popupToForm(p) {
  return { title: known(p.title), date: known(p.date), start: known(p.time), end: known(p.end_time), place: known(p.place) };
}

// 입력칸 값 → 팝업 저장 모양. 빈칸은 다시 '?'
export function formToPopup(form) {
  const or = (v) => (v && v.trim() ? v.trim() : '?');
  return { title: or(form.title), date: or(form.date), time: or(form.start), end_time: or(form.end), place: or(form.place) };
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

// 입력칸 값 → 일정 고치기 모양. 시작이 비면 날짜만(종일), 끝이 시작보다 이르면 없앤다.
export function formToEvent(form) {
  const start = isoFromInputs(form.date, form.start) || form.date;
  const end = form.start && form.end && form.end > form.start ? isoFromInputs(form.date, form.end) : null;
  return { title: form.title.trim(), start, end, place: form.place.trim() || null };
}

export default function EventForm({ form, onChange, idPrefix }) {
  const set = (key) => (e) => onChange({ ...form, [key]: e.target.value });
  return (
    <div className="form-grid">
      <label className="field" htmlFor={`${idPrefix}-title`}>
        <span>이름</span>
        <input id={`${idPrefix}-title`} className="input" value={form.title} onChange={set('title')} autoComplete="off" />
      </label>
      <div className="form-row">
        <label className="field">
          <span>날짜</span>
          <input type="date" className="input" value={form.date} onChange={set('date')} />
        </label>
        <label className="field">
          <span>시작</span>
          <input type="time" className="input" value={form.start} onChange={set('start')} />
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
      <p className="hint">시작을 비우면 하루 종일 일정으로 넣어요.</p>
    </div>
  );
}
