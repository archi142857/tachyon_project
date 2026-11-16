// 리마인드 켜기(11-16 사람 "모든 일정에 넣지는 말고 하고 싶은 일정에만 · 할 일이나 일정 모두 · 메모 팝업에서 바로 할지 말지").
// 기본은 꺼짐. 켜면 시작(할 일은 마감) 몇 분 전 — value = 분(null = 안 함, 서버 events·tasks.remind).
// 알림은 안드로이드 앱이 폰에서 띄운다(native.js planReminders ← 서버 GET /api/reminders). 브라우저만 쓰면 안 온다.
import { canMorning } from '../native.js';

const CHOICES = [0, 10, 30, 60, 180, 1440];
const ahead = (m) => (m === 1440 ? '하루 전' : m >= 60 ? `${m / 60}시간 전` : `${m}분 전`);

export default function RemindRow({ value, onChange, task = false, allDay = false, noDue = false }) {
  const what = task ? '마감' : '시작';
  if (noDue) return <p className="hint popup-move">리마인드는 마감을 정하면 켤 수 있어요.</p>;
  const on = value != null;
  return (
    <div className="hint popup-move remind-row">
      <label className="remind-on">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? (task ? 60 : 30) : null)} />
        <span>리마인드</span>
      </label>
      {on && (
        <select className="input remind-when" aria-label="언제 알릴까요" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {CHOICES.map((m) => (
            <option key={m} value={m}>
              {m ? `${what} ${ahead(m)}` : `${what} 시각에`}
            </option>
          ))}
        </select>
      )}
      {on && allDay && <small>종일 일정은 그날 아침 9시 기준이에요.</small>}
      {on && !canMorning() && <small>알림은 Tachyon 앱이 깔린 폰에서 와요.</small>}
    </div>
  );
}
