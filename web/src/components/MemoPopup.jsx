// 메모 즉시 팝업: '이대로 저장할까요?' → 저장 / 고치기 / 취소.
// 서버가 준 popup { title, date, time, end_time, place }의 모르는 칸('?')은 그대로 '?'로 보인다(앱 프롬프트 규칙).
// 이름이나 날짜를 모르면 '저장' 대신 고치기 칸부터 연다(서버는 이름·날짜가 없으면 받지 않는다).
import { useState } from 'react';
import { WEEKDAYS, dayStartKst, kst } from '../time.js';
import EventForm, { formToPopup, popupToForm } from './EventForm.jsx';

function timeText(p) {
  if (p.date === '?' || !p.date) return '?';
  const [, m, d] = p.date.split('-').map(Number);
  const wd = WEEKDAYS[kst(dayStartKst(p.date)).wd];
  return `${m}월 ${d}일 (${wd}) ${p.time === '?' ? '?' : p.time} ~ ${p.end_time === '?' || !p.end_time ? '?' : p.end_time}`;
}

const show = (v) => (v && v !== '?' ? v : <span className="unknown">?</span>);

export default function MemoPopup({ popup, busy, onSave, onCancel }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => popupToForm(popup));
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
        </>
      )}
      <div className="popup-actions">
        <button
          type="button"
          className="btn"
          disabled={busy || (editing && !formReady)}
          onClick={() => {
            if (editing) onSave(formToPopup(form));
            else if (canSaveAsIs) onSave(fields(popup));
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
