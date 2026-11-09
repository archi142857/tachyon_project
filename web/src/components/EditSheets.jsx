// 눌러서 고치기: 일정(이름·시간·장소·중요)과 할 일(이름·마감·걸리는 시간), 그리고 지우기.
// eTL·구글·애플에서 온 것은 그 캘린더가 원본이라 이름·시간·장소·마감은 그쪽에서 고치고 지운다(서버도 막는다).
// 그래도 여기서 바꿀 수 있는 것: 일정의 '중요', 할 일의 걸리는 시간·'수업·자료 뒤'.
// 지우기는 메모·시간표에서 온 것만, 한 번 더 눌러야 지운다.
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

// 처음 누르면 '한 번 더 누르면 지워요'로 바뀌고, 두 번째에 지운다
function DeleteButton({ busy, onDelete }) {
  const [sure, setSure] = useState(false);
  return (
    <button type="button" className="btn-text danger" disabled={busy} onClick={() => (sure ? onDelete() : setSure(true))}>
      {sure ? '한 번 더 누르면 지워요' : '지우기'}
    </button>
  );
}

export function EventEditSheet({ event, onSave, onDelete, onClose }) {
  const locked = fromFeed(event);
  const [form, setForm] = useState(() => eventToForm(event));
  const [important, setImportant] = useState(event.important ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const ready = locked || (form.title.trim() && form.date);

  const [error, setError] = useState(null);
  async function run(job) {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (err) {
      setError(err.message || '하지 못했어요. 다시 해 주세요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={locked ? '일정' : '일정 고치기'} onClose={onClose}>
      {locked ? (
        <div className="form-grid">
          <p style={{ fontSize: 16, lineHeight: '24px' }}>
            {event.title}
            {event.place ? ` · ${event.place}` : ''}
          </p>
          <p className="hint">{FEED_NAME[event.source]}에서 온 일정이라 이름·시간·장소는 그 캘린더에서 고치거나 지워 주세요.</p>
        </div>
      ) : (
        <EventForm form={form} onChange={setForm} idPrefix="edit-event" />
      )}
      <ImportantToggle value={important} onChange={setImportant} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="sheet-actions">
        {!locked && onDelete && <DeleteButton busy={busy} onDelete={() => run(onDelete)} />}
        <button type="button" className="btn" disabled={busy || !ready} onClick={() => run(() => onSave(locked ? { important } : { ...formToEvent(form), important }))}>
          저장
        </button>
      </div>
    </Sheet>
  );
}

export function TaskEditSheet({ task, onSave, onDelete, onClose }) {
  const locked = fromFeed(task);
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.due ? dateInput(task.due) : '');
  const [time, setTime] = useState(task.due ? timeInput(task.due) : '23:59');
  const [minutes, setMinutes] = useState(task.minutes ?? '');
  const [ready, setReady] = useState(task.ready === 0 ? 0 : 1); // 0 = 수업·자료 뒤에 할 수 있음
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState(null);
  async function run(job) {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (err) {
      setError(err.message || '하지 못했어요. 다시 해 주세요');
    } finally {
      setBusy(false);
    }
  }

  function fields() {
    const out = { minutes: minutes === '' ? null : Number(minutes), ready };
    if (!locked) Object.assign(out, { title: title.trim(), due: isoFromInputs(date, time) });
    return out;
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
        {locked && <p className="hint">{FEED_NAME[task.source]}에서 온 할 일이라 이름·마감은 그쪽에서 고쳐 주세요. 끝냈으면 체크해 주세요.</p>}
        <label className="field">
          <span>걸리는 시간(분)</span>
          <input type="number" inputMode="numeric" min="5" max="1440" step="5" className="input" value={minutes} placeholder="?" onChange={(e) => setMinutes(e.target.value)} />
        </label>
        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" checked={ready === 0} onChange={(e) => setReady(e.target.checked ? 0 : 1)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
          <span>수업·자료가 있어야 시작할 수 있어요</span>
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="sheet-actions">
        {!locked && onDelete && <DeleteButton busy={busy} onDelete={() => run(onDelete)} />}
        <button type="button" className="btn" disabled={busy || (!locked && !title.trim())} onClick={() => run(() => onSave(fields()))}>
          저장
        </button>
      </div>
    </Sheet>
  );
}
