// 메모 즉시 팝업: '이대로 저장할까요?' → 저장 / 고치기 / 취소.
// 할 일 메모(popup.kind = 'task', 11-10 사람 "할 일만 딱 적으면 메모가 안 생김")는 '할 일로 넣을까요?' — 이름·마감만(TaskPopup).
// 서버가 준 popup { title, date, time, end_time, place }의 모르는 칸('?')은 그대로 '?'로 보인다(앱 프롬프트 규칙).
// 이름이나 날짜를 모르면 '저장' 대신 고치기 칸부터 연다(서버는 이름·날짜가 없으면 받지 않는다).
// popup.from = 시각·장소를 가져온 내 일정 이름(알려 준다), popup.change = 옮길 일정(저장하면 그 일정은 달력에서 빠진다. 끌 수 있다).
import { useState } from 'react';
import { WEEKDAYS, dayStartKst, isDateOnly, kst, timeInput } from '../time.js';
import EventForm, { formToPopup, popupToForm } from './EventForm.jsx';

function timeText(p) {
  if (p.date === '?' || !p.date) return '?';
  const [, m, d] = p.date.split('-').map(Number);
  const wd = WEEKDAYS[kst(dayStartKst(p.date)).wd];
  return `${m}월 ${d}일 (${wd}) ${p.time === '?' ? '?' : p.time} ~ ${p.end_time === '?' || !p.end_time ? '?' : p.end_time}`;
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

function TaskPopup({ popup, busy, onSave, onCancel }) {
  const [editing, setEditing] = useState(popup.title === '?');
  const [form, setForm] = useState(() => ({
    title: popup.title === '?' ? '' : popup.title,
    date: popup.date === '?' ? '' : popup.date,
    time: popup.time === '?' ? '' : popup.time,
  }));
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toFields = (f) => ({ kind: 'task', title: f.title.trim() || '?', date: f.date || '?', time: f.date && f.time ? f.time : '?' });
  return (
    <div className="popup" role="dialog" aria-label="할 일로 넣을까요?">
      <p className="popup-title">{editing ? '고쳐서 할 일로' : '할 일로 넣을까요?'}</p>
      {editing ? (
        <div className="form-grid">
          <label className="field">
            <span>이름</span>
            <input className="input" value={form.title} onChange={set('title')} autoComplete="off" />
          </label>
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
          <dt>이름</dt>
          <dd>{show(popup.title)}</dd>
          <dt>마감</dt>
          <dd className="num">{dueText(popup)}</dd>
        </dl>
      )}
      <div className="popup-actions">
        <button
          type="button"
          className="btn"
          disabled={busy || (editing && !form.title.trim())}
          onClick={() => onSave(editing ? toFields(form) : { kind: 'task', title: popup.title, date: popup.date, time: popup.time })}
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

export default function MemoPopup({ popup, busy, onSave, onCancel }) {
  if (popup.kind === 'task') return <TaskPopup popup={popup} busy={busy} onSave={onSave} onCancel={onCancel} />;
  return <EventPopup popup={popup} busy={busy} onSave={onSave} onCancel={onCancel} />;
}

function EventPopup({ popup, busy, onSave, onCancel }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => popupToForm(popup));
  const [move, setMove] = useState(Boolean(popup.change));
  const changeId = move ? popup.change.id : undefined;
  const canSaveAsIs = popup.title !== '?' && popup.date !== '?';
  const formReady = form.title.trim() && form.date;
  const fields = ({ title, date, time, end_time, place }) => ({ title, date, time, end_time, place });

  return (
    <div className="popup" role="dialog" aria-label="일정으로 저장할까요?">
      <p className="popup-title">{editing ? '고쳐서 저장' : '이대로 저장할까요?'}</p>
      {editing ? (
        <EventForm form={form} onChange={setForm} idPrefix="popup" />
      ) : (
        <>
          <dl className="popup-rows">
            <dt>이름</dt>
            <dd>{show(popup.title)}</dd>
            <dt>시간</dt>
            <dd className="num">{timeText(popup)}</dd>
            <dt>장소</dt>
            <dd>{show(popup.place)}</dd>
          </dl>
          {popup.time === '?' && popup.date !== '?' && <p className="hint" style={{ marginTop: 6 }}>시각을 모르면 하루 종일 일정으로 넣어요.</p>}
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
      <div className="popup-actions">
        <button
          type="button"
          className="btn"
          disabled={busy || (editing && !formReady)}
          onClick={() => {
            if (editing) onSave(formToPopup(form), changeId);
            else if (canSaveAsIs) onSave(fields(popup), changeId);
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
