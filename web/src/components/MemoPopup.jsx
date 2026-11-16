// 메모 즉시 팝업: '이대로 저장할까요?' → 저장 / 고치기 / 취소.
// 할 일 메모(popup.kind = 'task', 11-10 사람 "할 일만 딱 적으면 메모가 안 생김")는 '할 일로 넣을까요?' — 이름·마감만(TaskPopup).
//   11-12 사람: 한 메모의 여러 할 일(popup.also)은 줄마다 따로 넣고, 할 일마다 예상 시간(popup.minutes)과 오늘 추천 시간을 보인다.
//   추천 시간 = 오늘 할 일 목록 뒤에 이어서 빈 시간에 넣어 본 자리(slots.js, 오늘 화면과 같은 계산). plan이 없으면 안 보인다.
//   popup.plan = 메모에 쓴 하기로 한 날·때({ date, from?, to?, said? }, 서버 taskPlan, 11-15) → 그날 그때의 빈 시간으로 추천. 저장하면 이 기기에 적어 둔다(taskLocal planTask).
// 서버가 준 popup { title, date, time, end_time, place }의 모르는 칸('?')은 그대로 '?'로 보인다(앱 프롬프트 규칙).
// 이름이나 날짜를 모르면 '저장' 대신 고치기 칸부터 연다(서버는 이름·날짜가 없으면 받지 않는다).
// popup.from = 시각·장소를 가져온 내 일정 이름(알려 준다), popup.free = 빈 시간을 고른 시간대 말(알려 준다, popup.usual이면 메모가 아니라 AI가 고른 '보통 하는 때' — 11-15), popup.change = 옮길 일정(저장하면 그 일정은 달력에서 빠진다. 끌 수 있다).
// popup.repeat = 매주 되풀이 메모({ until: 학기 끝 }). 켜 둔 채 저장하면 그날까지 주마다 넣는다. 끌 수 있다.
// popup.prep = 일정 전에 끝낼 할 일([{ title, minutes }], 11-14 '여행 전 항공권·숙박은 여행까지 할 일'). 켜 둔 채 저장하면 마감 = 일정 시작인 할 일로. 끌 수 있다.
// popup.together = 주 달력의 다 같이 빈 시간 띠에서 잡은 모임이면 그 그룹 이름(11-13). 내 달력에만 넣는다고 알려 준다.
// 리마인드(11-16 사람 "팝업에서 바로 리마인드 할지 말지"): 일정·할 일 모두 맨 아래 '리마인드' — 기본 꺼짐, 켜면 저장 때 remind(몇 분 전)를 같이 보낸다(RemindRow).
// popup.guessed = 사람이 안 썼는데 서버가 채운 칸 이름(AI b5fe7db: date · time · end_time · place) → 그 칸만 추천처럼 점선(사람 피드백 5, 모양은 디자인이 정하면 맞춘다).
import { useState } from 'react';
import { useLift } from '../lift.js';
import { dayEvents, daySlots, hm } from '../slots.js';
import { minutesLabel, planLabel } from '../tasks.js';
import { WEEKDAYS, dayStartKst, daysUntil, isDateOnly, kst, minuteOfDay, plusHourText, timeInput } from '../time.js';
import EventForm, { formToPopup, popupToForm } from './EventForm.jsx';
import RemindRow from './RemindRow.jsx';

function timeText(p) {
  if (p.date === '?' || !p.date) return '?';
  const [, m, d] = p.date.split('-').map(Number);
  const wd = WEEKDAYS[kst(dayStartKst(p.date)).wd];
  if (p.time === '?' || !p.time) return `${m}월 ${d}일 (${wd}) ?`;
  // 끝을 모르면 1시간(11-13, 저장할 때도 서버가 +1시간). 끝 날짜가 다르면 그 날짜도(11-15 밤을 넘는 일정)
  const end = p.end_time === '?' || !p.end_time ? plusHourText(p.time, true) || '?' : p.end_time;
  if (!p.end_date || p.end_date <= p.date) return `${m}월 ${d}일 (${wd}) ${p.time} ~ ${end}`;
  const [, em, ed] = p.end_date.split('-').map(Number);
  return `${m}월 ${d}일 (${wd}) ${p.time} ~ ${em}월 ${ed}일 (${WEEKDAYS[kst(dayStartKst(p.end_date)).wd]}) ${end}`;
}

// 옮길 일정의 옛 날짜: "11월 11일 (수) 09:30"
function whenText(start) {
  const date = start.slice(0, 10);
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[kst(dayStartKst(date)).wd]})${isDateOnly(start) ? '' : ` ${timeInput(start)}`}`;
}

const show = (v) => (v && v !== '?' ? v : <span className="unknown">?</span>);

// 할 일 마감 글: '11월 13일 (금) 23:59까지' · 시각을 모르면 '11월 13일 (금)까지' · 없으면 '없음'
function dueText(p) {
  if (!p.date || p.date === '?') return '없음';
  const [, m, d] = p.date.split('-').map(Number);
  const wd = WEEKDAYS[kst(dayStartKst(p.date)).wd];
  return `${m}월 ${d}일 (${wd})${p.time && p.time !== '?' ? ` ${p.time}` : ''}까지`;
}

// 할 일마다 '예상 1시간 · 추천 14:00–15:00'. 오늘 화면처럼 열린 할 일 6개 뒤에 이어서 넣어 본다.
// 메모에 하기로 한 날·때를 썼으면(popup.plan = when, 11-15 사람 "월요일 오전에 … 추천 시간대가 오전이 아닌 것 같은데")
// 그날의 일정을 비켜 그때(when.from~to)에서 먼저: '추천 내일 9:00–9:15'. 그날이 오늘이 아니면 열린 할 일은 앞에 두지 않는다
export function planText(items, plan, when) {
  const day = when ? dayStartKst(when.date) : plan?.today;
  const today = !when || (plan && daysUntil(day, plan.now) === 0);
  const shown = plan && today ? plan.tasks.slice(0, 6) : [];
  const window = when && when.from != null ? [when.from, when.to] : undefined;
  const slots = plan ? daySlots([...shown, ...items.map((t) => ({ minutes: t.minutes, ready: 1, window }))], dayEvents(plan.events, day), today ? minuteOfDay(plan.now) : 0).slice(shown.length) : [];
  const name = when && !today ? `${planLabel({ date: when.date }, plan?.now)} ` : '';
  return items.map((t, i) => {
    const time = t.minutes ? `예상 ${minutesLabel(t.minutes).replace('약 ', '')}` : '예상 시간 ?';
    if (!plan || !t.minutes) return when ? `${time} · ${planLabel(when, plan?.now)}에` : time;
    return `${time} · ${slots[i] ? `추천 ${name}${hm(slots[i][0])}–${hm(slots[i][1])}` : when ? `${planLabel(when, plan.now)}엔 빈 시간이 없어요` : '오늘은 빈 시간이 없어요'}`;
  });
}

function TaskPopup({ popup, plan, busy, onSave, onCancel }) {
  const [editing, setEditing] = useState(popup.title === '?');
  const [lifted, onFocus] = useLift(); // 폰: 글자판 뜨는 칸에 초점이 가면 위로(날짜 · 시각 칸은 그대로, lift.js)
  const [form, setForm] = useState(() => ({
    titles: [popup.title === '?' ? '' : popup.title, ...(popup.also ?? []).map((t) => t.title)],
    date: popup.date === '?' ? '' : popup.date,
    time: popup.time === '?' ? '' : popup.time,
  }));
  const [remind, setRemind] = useState(null);
  const items = [{ title: popup.title, minutes: popup.minutes ?? null }, ...(popup.also ?? [])];
  const notes = planText(items, plan, popup.plan);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setTitle = (i) => (e) => setForm((f) => ({ ...f, titles: f.titles.map((t, j) => (j === i ? e.target.value : t)) }));
  // 고친 이름은 같은 자리의 예상 시간을 그대로 쓴다. 비운 줄은 넣지 않는다
  const toFields = (f) => {
    const [first, ...also] = f.titles.map((title, i) => ({ title: title.trim(), minutes: items[i]?.minutes ?? null })).filter((t) => t.title);
    return { kind: 'task', title: first?.title || '?', minutes: first?.minutes ?? null, also, date: f.date || '?', time: f.date && f.time ? f.time : '?', remind };
  };
  return (
    <div className={lifted ? 'popup front lifted' : 'popup front'} onFocus={onFocus} role="dialog" aria-modal="true" aria-label="할 일로 넣을까요?">
      <p className="popup-title">{editing ? '고쳐서 할 일로' : items.length > 1 ? `할 일 ${items.length}개로 넣을까요?` : '할 일로 넣을까요?'}</p>
      {editing ? (
        <div className="form-grid">
          {form.titles.map((title, i) => (
            <label key={i} className="field">
              <span>{form.titles.length > 1 ? `이름 ${i + 1}` : '이름'}</span>
              <input className="input" value={title} onChange={setTitle(i)} autoComplete="off" />
            </label>
          ))}
          <label className="field">
            <span>마감 날짜(없으면 비워 두기)</span>
            <input className="input" type="date" value={form.date} onChange={set('date')} />
          </label>
          {form.date && (
            <label className="field">
              <span>마감 시각(없으면 그날 23:59)</span>
              <input className="input" type="time" value={form.time} onChange={set('time')} />
            </label>
          )}
        </div>
      ) : (
        <dl className="popup-rows">
          {items.map((t, i) => (
            <div key={i} className="popup-task">
              <dt>{items.length > 1 ? `할 일 ${i + 1}` : '이름'}</dt>
              <dd>
                {show(t.title)}
                <small className="popup-plan num">{notes[i]}</small>
              </dd>
            </div>
          ))}
          <dt>마감</dt>
          <dd className="num">{dueText(popup)}</dd>
        </dl>
      )}
      <RemindRow value={remind} onChange={setRemind} task noDue={editing ? !form.date : !popup.date || popup.date === '?'} />
      <div className="popup-actions">
        <button
          type="button"
          className="btn"
          autoFocus
          disabled={busy || (editing && !form.titles.some((t) => t.trim()))}
          onClick={() => onSave(editing ? toFields(form) : { kind: 'task', title: popup.title, date: popup.date, time: popup.time, minutes: popup.minutes ?? null, also: popup.also ?? [], remind })}
        >
          넣기
        </button>
        {!editing && (
          <button type="button" className="btn-text" onClick={() => setEditing(true)}>
            고치기
          </button>
        )}
        <button type="button" className="btn-text quiet" disabled={busy} onClick={onCancel}>
          메모로만
        </button>
      </div>
    </div>
  );
}

export default function MemoPopup({ popup, plan, busy, onSave, onCancel }) {
  if (popup.kind === 'task') return <TaskPopup popup={popup} plan={plan} busy={busy} onSave={onSave} onCancel={onCancel} />;
  return <EventPopup popup={popup} busy={busy} onSave={onSave} onCancel={onCancel} />;
}

function EventPopup({ popup, busy, onSave, onCancel }) {
  const [editing, setEditing] = useState(false);
  const [lifted, onFocus] = useLift(); // 폰: 글자판 뜨는 칸에 초점이 가면 위로(날짜 · 시각 칸은 그대로, lift.js)
  const [form, setForm] = useState(() => popupToForm(popup));
  const [move, setMove] = useState(Boolean(popup.change));
  const changeId = move ? popup.change.id : undefined;
  const [weekly, setWeekly] = useState(Boolean(popup.repeat));
  const prep = Array.isArray(popup.prep) ? popup.prep : [];
  const [withPrep, setWithPrep] = useState(prep.length > 0);
  const [remind, setRemind] = useState(null);
  const plus = (f) => ({ ...(withPrep ? { ...f, prep } : f), remind });
  const canSaveAsIs = popup.title !== '?' && popup.date !== '?';
  const formReady = form.title.trim() && form.date;
  const guess = new Set(Array.isArray(popup.guessed) ? popup.guessed : []);
  const fields = ({ title, date, time, end_time, place }) => ({ title, date, time, end_time, place });

  return (
    <div className={lifted ? 'popup front lifted' : 'popup front'} onFocus={onFocus} role="dialog" aria-modal="true" aria-label="일정으로 저장할까요?">
      <p className="popup-title">{editing ? '고쳐서 저장' : '이대로 저장할까요?'}</p>
      {editing ? (
        <EventForm form={form} onChange={setForm} idPrefix="popup" />
      ) : (
        <>
          <dl className="popup-rows">
            <dt>이름</dt>
            <dd>{show(popup.title)}</dd>
            <dt>시간</dt>
            <dd className={guess.has('date') || guess.has('time') || guess.has('end_time') ? 'num guess' : 'num'}>{timeText(popup)}</dd>
            <dt>장소</dt>
            <dd className={guess.has('place') ? 'guess' : undefined}>{show(popup.place)}</dd>
          </dl>
          {guess.size > 0 && !popup.free && !popup.from && <p className="hint" style={{ marginTop: 6 }}>점선 칸은 적지 않아서 채워 본 거예요. 다르면 고치기를 눌러요.</p>}
          {popup.time === '?' && popup.date !== '?' && <p className="hint" style={{ marginTop: 6 }}>시각을 모르면 하루 종일 일정으로 넣어요.</p>}
          {popup.free && <p className="hint" style={{ marginTop: 6 }}>{popup.usual ? `보통 ${popup.free}에 하는 일이라 ${popup.free}의` : `‘${popup.free}’에서`} 비어 있는 시간으로 골랐어요. 바꾸려면 고치기를 눌러요.</p>}
          {popup.together && <p className="hint" style={{ marginTop: 6 }}>‘{popup.together}’ 모두가 비어 있는 시간이에요. 내 달력에 넣어요 — 멤버에게는 따로 알려 주세요.</p>}
          {popup.from && <p className="hint" style={{ marginTop: 6 }}>시간은 내 일정 ‘{popup.from}’에서 가져왔어요.</p>}
        </>
      )}
      {popup.change && (
        <label className="hint popup-move">
          <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} />
          <span>
            ‘{popup.change.title}’({whenText(popup.change.start)})을 이 날짜로 옮겨요. 끄면 새 일정으로 넣어요.
          </span>
        </label>
      )}
      {popup.repeat && (
        <label className="hint popup-move">
          <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
          <span>
            매주 같은 요일·시간으로 {Number(popup.repeat.until.slice(5, 7))}월 {Number(popup.repeat.until.slice(8))}일(학기 끝)까지 넣어요. 끄면 이날 하루만 넣어요.
          </span>
        </label>
      )}
      {prep.length > 0 && (
        <label className="hint popup-move">
          <input type="checkbox" checked={withPrep} onChange={(e) => setWithPrep(e.target.checked)} />
          <span>
            일정 전에 할 일도 넣어요: {prep.map((t) => `‘${t.title}’`).join(', ')}. 일정이 시작할 때까지 할 일 목록에 있어요.
          </span>
        </label>
      )}
      <RemindRow value={remind} onChange={setRemind} allDay={editing ? !form.start : !popup.time || popup.time === '?'} />
      <div className="popup-actions">
        <button
          type="button"
          className="btn"
          autoFocus
          disabled={busy || (editing && !formReady)}
          onClick={() => {
            if (editing) onSave(plus(formToPopup(form)), changeId, weekly);
            else if (canSaveAsIs) onSave(plus(fields(popup)), changeId, weekly);
            else setEditing(true);
          }}
        >
          저장
        </button>
        {!editing && (
          <button type="button" className="btn-text" onClick={() => setEditing(true)}>
            고치기
          </button>
        )}
        <button type="button" className="btn-text quiet" disabled={busy} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
