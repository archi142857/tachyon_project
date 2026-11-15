// 일정 고치기 칸: 이름 · 시작(날짜·시각) · 끝(날짜·시각) · 장소. 팝업의 '고치기'와 달력 칸 누르기에서 같이 쓴다.
// 시작 시각을 비우면 종일 일정, 끝 시각을 비우면 1시간(11-13 사람, 서버 규칙과 같다). 시작을 고르면 빈 끝 칸에 +1시간을 미리 채운다.
// 끝 날짜는 따로 있다(사람 11-15 16:55 "일정이 시작하고 끝나는 시간의 날짜가 다를 수도 있음"): 밤을 넘는 일정·여러 날 종일 일정.
// 시작 날짜를 옮기면 끝 날짜도 같은 날 수만큼 따라가고, 같은 날인데 끝 시각이 시작보다 이르면 끝 날짜를 다음 날로 넘긴다.
import { addDays, dateInput, dayStartKst, endOrHour, isoFromInputs, plusHourText, timeInput } from '../time.js';

const known = (v) => (v == null || v === '?' ? '' : v);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
// 'YYYY-MM-DD' + n일, 두 날 사이 날 수(한국 날짜 그대로)
export const ymdPlus = (ymd, n) => dateInput(addDays(dayStartKst(ymd), n));
const dayGap = (a, b) => Math.round((dayStartKst(b) - dayStartKst(a)) / 86400000);

// 서버의 팝업 { title, date, time, end_time, end_date?, place }('?' = 모름) → 입력칸 값
export function popupToForm(p) {
  const date = known(p.date);
  const endDate = YMD.test(known(p.end_date)) ? p.end_date : date;
  return { title: known(p.title), date, start: known(p.time), endDate, end: known(p.end_time), place: known(p.place) };
}

// 입력칸 값 → 팝업 저장 모양. 빈칸은 다시 '?'. 시작이 있고 끝이 비면 +1시간(자정을 넘으면 '?' — 서버가 +1시간으로 넣는다).
// 끝 날짜가 시작 날짜와 다를 때만 end_date를 보낸다(서버 3_memo_popup.js toStartEnd)
export function formToPopup(form) {
  const or = (v) => (v && v.trim() ? v.trim() : '?');
  const end = or(form.end) === '?' && form.start ? plusHourText(form.start.trim()) || '?' : or(form.end);
  const other = form.endDate && form.date && form.endDate > form.date ? { end_date: form.endDate } : {};
  return { title: or(form.title), date: or(form.date), time: or(form.start), end_time: end, ...other, place: or(form.place) };
}

// 달력의 일정 → 입력칸 값. 종일 일정은 시각 칸이 비고, 끝 날짜는 마지막 날(ICS 끝 = 다음 날 0시에서 하루 뺌)
export function eventToForm(ev) {
  const date = dateInput(ev.start);
  if (ev.all_day) {
    const last = ev.end && Date.parse(ev.end) > Date.parse(ev.start) ? dateInput(new Date(Date.parse(ev.end) - 1)) : date;
    return { title: ev.title || '', date, start: '', endDate: last, end: '', place: ev.place || '' };
  }
  return {
    title: ev.title || '',
    date,
    start: timeInput(ev.start),
    endDate: ev.end ? dateInput(ev.end) : date,
    end: ev.end ? timeInput(ev.end) : '',
    place: ev.place || '',
  };
}

// 입력칸 값 → 일정 고치기 모양. 시작 시각이 비면 날짜만(종일, 끝 날짜가 뒤면 그날까지 = 다음 날 0시).
// 끝이 비었거나 시작보다 이르면 시작 + 1시간(자정을 넘어도 된다).
export function formToEvent(form) {
  const endDay = form.endDate && form.endDate >= form.date ? form.endDate : form.date;
  if (!form.start) return { title: form.title.trim(), start: form.date, end: endDay > form.date ? ymdPlus(endDay, 1) : null, place: form.place.trim() || null };
  const start = isoFromInputs(form.date, form.start);
  const asked = form.end ? isoFromInputs(endDay, form.end) : null;
  const end = asked && asked > start ? asked : endOrHour(start, null);
  return { title: form.title.trim(), start, end, place: form.place.trim() || null };
}

export default function EventForm({ form, onChange, idPrefix, autoFocus = false }) {
  const set = (key) => (e) => onChange({ ...form, [key]: e.target.value });
  const endDate = form.endDate || form.date;
  const sameDay = !form.date || endDate === form.date;
  // 시작 날짜를 옮기면 끝 날짜도 같은 날 수만큼(밤을 넘는 일정이 그대로 밤을 넘게)
  const setDate = (e) => {
    const date = e.target.value;
    const gap = form.date && endDate && YMD.test(form.date) && YMD.test(endDate) ? Math.max(0, dayGap(form.date, endDate)) : 0;
    onChange({ ...form, date, endDate: YMD.test(date) ? ymdPlus(date, gap) : endDate });
  };
  // 시작을 고르면 끝이 비었거나(같은 날) 시작보다 이를 때 +1시간을 미리 채운다. 자정을 넘으면 끝 날짜를 다음 날로
  const setStart = (e) => {
    const start = e.target.value;
    if (!start || (form.end && !(sameDay && form.end <= start))) return onChange({ ...form, start });
    const end = plusHourText(start, true) || '';
    const next = end && end < start && YMD.test(form.date);
    onChange({ ...form, start, end, endDate: next ? ymdPlus(form.date, 1) : endDate });
  };
  // 같은 날인데 끝 시각이 시작보다 이르면 밤을 넘는 일정으로 본다 → 끝 날짜를 다음 날로
  const setEnd = (e) => {
    const end = e.target.value;
    const next = end && form.start && sameDay && end <= form.start && YMD.test(form.date);
    onChange({ ...form, end, endDate: next ? ymdPlus(form.date, 1) : endDate });
  };
  return (
    <div className="form-grid">
      <label className="field" htmlFor={`${idPrefix}-title`}>
        <span>이름</span>
        <input id={`${idPrefix}-title`} className="input" value={form.title} onChange={set('title')} autoComplete="off" data-autofocus={autoFocus || undefined} />
      </label>
      <div className="form-row two">
        <label className="field">
          <span>시작 날짜</span>
          <input type="date" className="input" value={form.date} onChange={setDate} />
        </label>
        <label className="field">
          <span>시작 시각</span>
          <input type="time" className="input" value={form.start} onChange={setStart} />
        </label>
      </div>
      <div className="form-row two">
        <label className="field">
          <span>끝 날짜</span>
          <input type="date" className="input" value={endDate} min={form.date || undefined} onChange={set('endDate')} />
        </label>
        <label className="field">
          <span>끝 시각</span>
          <input type="time" className="input" value={form.end} onChange={setEnd} />
        </label>
      </div>
      <label className="field">
        <span>장소</span>
        <input className="input" value={form.place} onChange={set('place')} autoComplete="off" />
      </label>
      <p className="hint">시작 시각을 비우면 하루 종일, 끝 시각을 비우면 1시간으로 넣어요. 밤을 넘기는 일정은 끝 날짜를 바꿔요.</p>
    </div>
  );
}
