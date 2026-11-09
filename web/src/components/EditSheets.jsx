// 눌러서 고치기: 일정(이름·시간·장소·중요)과 할 일(이름·마감·걸리는 시간).
// eTL·구글·애플에서 온 것은 그 캘린더가 원본이라 이름·시간·장소·마감은 그쪽에서 고친다(서버도 막는다).
// 그래도 여기서 바꿀 수 있는 것: 일정의 '중요', 할 일의 걸리는 시간.
import { useState } from 'react';
import { fromFeed } from '../api.js';
import { dateInput, isoFromInputs, timeInput } from '../time.js';
import EventForm, { eventToForm, formToEvent } from './EventForm.jsx';
import Sheet from './Sheet.jsx';

const FEED_NAME = { etl: 'eTL', google: '구글 캘린더', apple: '애플 캘린더' };

function ImportantToggle({ value, onChange }) {
  return (
    <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? 1 : 0)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
      <span>중요한 일정으로 표시</span>
    </label>
  );
}

export function EventEditSheet({ event, onSave, onClose }) {
  const locked = fromFeed(event);
  const [form, setForm] = useState(() => eventToForm(event));
  const [important, setImportant] = useState(event.important ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const ready = locked || (form.title.trim() && form.date);

  async function save() {
    setBusy(true);
    await onSave(locked ? { important } : { ...formToEvent(form), important });
    setBusy(false);
  }

  return (
    <Sheet title={locked ? '일정' : '일정 고치기'} onClose={onClose}>
      {locked ? (
        <div className="form-grid">
          <p style={{ fontSize: 16, lineHeight: '24px' }}>
            {event.title}
            {event.place ? ` · ${event.place}` : ''}
          </p>
          <p className="hint">{FEED_NAME[event.source]}에서 온 일정이라 이름·시간·장소는 그 캘린더에서 고쳐 주세요.</p>
        </div>
      ) : (
        <EventForm form={form} onChange={setForm} idPrefix="edit-event" />
      )}
      <ImportantToggle value={important} onChange={setImportant} />
      <button type="button" className="btn" disabled={busy || !ready} onClick={save}>
        저장
      </button>
    </Sheet>
  );
}

export function TaskEditSheet({ task, onSave, onClose }) {
  const locked = fromFeed(task);
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.due ? dateInput(task.due) : '');
  const [time, setTime] = useState(task.due ? timeInput(task.due) : '23:59');
  const [minutes, setMinutes] = useState(task.minutes ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const fields = { minutes: minutes === '' ? null : Number(minutes) };
    if (!locked) Object.assign(fields, { title: title.trim(), due: isoFromInputs(date, time) });
    await onSave(fields);
    setBusy(false);
  }

  return (
    <Sheet title="할 일 고치기" onClose={onClose}>
      <div className="form-grid">
        <label className="field">
          <span>이름</span>
          <input className="input" value={title} disabled={locked} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </label>
        <div className="form-row" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
          <label className="field">
            <span>마감 날짜</span>
            <input type="date" className="input" value={date} disabled={locked} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>시각</span>
            <input type="time" className="input" value={time} disabled={locked} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        {locked && <p className="hint">{FEED_NAME[task.source]}에서 온 할 일이라 이름·마감은 그쪽에서 고쳐 주세요.</p>}
        <label className="field">
          <span>걸리는 시간(분)</span>
          <input type="number" inputMode="numeric" min="5" max="1440" step="5" className="input" value={minutes} placeholder="?" onChange={(e) => setMinutes(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn" disabled={busy || (!locked && !title.trim())} onClick={save}>
        저장
      </button>
    </Sheet>
  );
}
