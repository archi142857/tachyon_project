// 눌러서 고치기: 일정(이름·시간·장소·중요)과 할 일(이름·마감·걸리는 시간), 그리고 지우기.
// eTL·구글·애플·폰 캘린더에서 온 일정도 여기서 고친다: Tachyon 안에서만 바뀌고(서버가 고친 사본을 넣고 원본을 가린다, 7_items.js)
// 그 캘린더는 그대로다. 고친 것을 지우면 원래 일정이 다시 보인다. 캘린더에서 온 일정 자체를 지우는 것은 그 캘린더에서 한다.
// 캘린더에서 온 할 일은 이름·마감을 그쪽에서 고친다(서버도 막는다). 여기서 바꿀 수 있는 것: 걸리는 시간·'수업·자료 뒤'.
// 지우기는 한 번 더 눌러야 지운다.
import { useState } from 'react';
import { fromFeed } from '../api.js';
import { isAllDay } from '../layout.js';
import { dateInput, dayLabel, isoFromInputs, popupTime, timeInput } from '../time.js';
import EventForm, { eventToForm, formToEvent } from './EventForm.jsx';
import RouteInfo from './RouteInfo.jsx';
import Sheet from './Sheet.jsx';

const FEED_NAME = { etl: 'eTL', google: '구글 캘린더', apple: '애플 캘린더', naver: '네이버 캘린더', device: '폰 캘린더' };

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

// leg·campus·events: 수업 사이 동선(campus.js dayLegs), 캠퍼스 표, 그 주 일정(하루 동선 지도). 없으면 장소 '지도' 단추만
export function EventEditSheet({ event, leg, campus, events, onSave, onDelete, onClose }) {
  const feed = fromFeed(event);
  const [form, setForm] = useState(() => eventToForm(event));
  // 캘린더에서 온 일정은 칸을 실제로 바꿨을 때만 이름·시간·장소를 보낸다('중요'만 누르면 사본을 만들지 않게)
  const dirty = JSON.stringify(form) !== JSON.stringify(eventToForm(event));
  const [important, setImportant] = useState(event.important ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const ready = form.title.trim() && form.date;

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
    <Sheet title="일정 고치기" onClose={onClose} front>
      <EventForm form={form} onChange={setForm} idPrefix="edit-event" />
      {feed && (
        <p className="hint">
          {FEED_NAME[event.source]}에서 온 일정이에요. 여기서 고치면 Tachyon에서만 바뀌고 {FEED_NAME[event.source]}는 그대로예요. 지우기는 {FEED_NAME[event.source]}에서 해 주세요.
        </p>
      )}
      {!!event.edited && <p className="hint">캘린더에서 온 일정을 여기서 고친 거예요. 지우면 원래 일정이 다시 보여요.</p>}
      <RouteInfo event={event} leg={leg} campus={campus} events={events} />
      <ImportantToggle value={important} onChange={setImportant} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="sheet-actions">
        {!feed && onDelete && <DeleteButton busy={busy} onDelete={() => run(onDelete)} />}
        <button type="button" className="btn" disabled={busy || !ready} onClick={() => run(() => onSave(feed && !dirty ? { important } : { ...formToEvent(form), important }))}>
          저장
        </button>
      </div>
    </Sheet>
  );
}

// 일정을 누르면 먼저 보는 창: 언제 · 어디 · 어디서 왔나 · 동선. '고치기'를 누르면 고치는 창으로(11-13 사람 "달력에서 일정을 클릭하면 정보가 나오도록")
const SOURCE_NAME = { ...FEED_NAME, timetable: '시간표', memo: '메모' };
export function EventInfoSheet({ event, leg, campus, events, onEdit, onClose }) {
  const when = isAllDay(event) ? `${dayLabel(event.start)} · 하루 종일` : popupTime(event.start, event.end);
  return (
    <Sheet title="일정 정보" onClose={onClose} front>
      <p className="info-title">{event.title}</p>
      <dl className="info-list">
        <dt>언제</dt>
        <dd className="num">{when}</dd>
        <dt>어디</dt>
        <dd>{event.place || '장소 없음'}</dd>
        <dt>온 곳</dt>
        <dd>
          {SOURCE_NAME[event.source] ?? '직접 넣음'}
          {event.important ? ' · 중요' : ''}
        </dd>
      </dl>
      <RouteInfo event={event} leg={leg} campus={campus} events={events} />
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onEdit}>
          고치기
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
    <Sheet title="할 일 고치기" onClose={onClose} front>
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
