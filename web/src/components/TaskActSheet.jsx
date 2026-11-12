// 할 일을 누르면 뜨는 정면 창(9판 '할 일 바로 다루기', 사람 11-13 결정 + 피드백 5 '추천/고르기 명확하게').
// 추천 자리(점선, 앱이 골라 둔 것)가 있으면 '이 시간에 넣기'로 정한다(실선). 집중 N분 · 맨 앞으로 · 내일로 미루기 · 고치기.
import { hm } from '../slots.js';
import { deadlineLabel } from '../time.js';
import { snoozeCount } from '../taskLocal.js';
import Sheet from './Sheet.jsx';

export default function TaskActSheet({ task, slot, fixed, now, focusMin, onClose, onPlace, onFocus, onPin, onSnooze, onEdit, onDone }) {
  const snoozed = snoozeCount(task.id);
  return (
    <Sheet title={task.title} onClose={onClose} front>
      <p className="hint num">
        {deadlineLabel(task.due, now)}
        {task.minutes ? ` · 약 ${task.minutes >= 60 ? `${Math.round(task.minutes / 6) / 10}시간` : `${task.minutes}분`}` : ' · 걸리는 시간 모름'}
      </p>
      {fixed && (
        <p className="act-slot fixed num">
          정함 {hm(fixed.from)}–{hm(fixed.to)} · 달력에 넣었어요
        </p>
      )}
      {!fixed && slot && (
        <>
          <p className="act-slot num">
            <span className="tag suggest">추천</span> 오늘 {hm(slot[0])}–{hm(slot[1])} 어때요?
          </p>
          <div className="suggest-actions">
            <button type="button" className="btn" onClick={() => onPlace(slot)}>
              이 시간에 넣기
            </button>
          </div>
        </>
      )}
      <div className="suggest-actions" style={{ marginTop: 8 }}>
        <button type="button" className="btn-line" onClick={onFocus}>
          지금 집중 {focusMin}분
        </button>
      </div>
      {snoozed >= 3 && <p className="hint">세 번 미뤘어요. 안 해도 되는 일이면 ‘고치기’에서 지워도 돼요.</p>}
      <div className="act-row">
        <button type="button" className="btn-text" onClick={onPin}>
          맨 앞으로
        </button>
        <button type="button" className="btn-text" onClick={onSnooze}>
          내일로 미루기
        </button>
        <button type="button" className="btn-text" onClick={onEdit}>
          고치기
        </button>
        <button type="button" className="btn-text" onClick={onDone}>
          끝냄
        </button>
      </div>
    </Sheet>
  );
}
