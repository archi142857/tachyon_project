// 받은함 · 아침 브리핑(결정 '받은함 · 아침 브리핑', 9판): 먼저 할 것 · 미룰 것 · 경고 · 밤 정리로 생긴 할 일 · 하루 한 질문.
// 서버 GET /api/briefing(AI 4_night). 예시 모드거나 못 받으면 지금 할 일 순서(rank)로 같은 모양을 만든다.
// 친구 요청은 친구 표(서버)가 열리면 여기에 붙인다.
import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { minutesLabel } from '../tasks.js';
import { hhmm, shortDate } from '../time.js';
import Sheet from './Sheet.jsx';

const ASK = [
  [30, '30분'],
  [60, '1시간'],
  [120, '2시간'],
];
const dueText = (due) => (!due ? '마감 없음' : due.length <= 10 ? `마감 ${shortDate(`${due}T23:59:00+09:00`)}` : `마감 ${shortDate(due)} ${hhmm(due)}`);

export default function InboxSheet({ tasks, warning, onClose, onTask, onSnooze, onChanged }) {
  const [card, setCard] = useState(undefined); // undefined = 받는 중, null = 없음(예시 · 실패)
  const [asked, setAsked] = useState(null); // 답한 질문의 할 일 id

  useEffect(() => {
    let live = true;
    api.getBriefing().then(
      (r) => live && setCard(r?.briefing ?? null),
      () => live && setCard(null),
    );
    return () => {
      live = false;
    };
  }, []);

  if (card === undefined) {
    return (
      <Sheet title="받은함" onClose={onClose} front>
        <p className="hint">오늘 브리핑을 불러오는 중…</p>
      </Sheet>
    );
  }
  const b = card ?? { top3: tasks.slice(0, 3), postpone: tasks.length > 3 ? tasks.at(-1) : null, warning, new_tasks: [], events: [] };
  const byId = (t) => tasks.find((x) => x.id === t.id) ?? t; // 목록에 있으면 화면의 할 일로(바로 다루기 창이 같은 것을 쓰게)
  const first = (b.events ?? []).find((e) => e.start?.length > 10);
  const question = asked == null ? tasks.find((t) => t.minutes == null) : null;

  async function answer(task, minutes) {
    setAsked(task.id);
    await api.updateTask(task.id, { minutes });
    onChanged();
  }

  return (
    <Sheet title="받은함" onClose={onClose} front>
      <h3 className="group-title">아침 브리핑</h3>
      {first && (
        <p className="inbox-line num">
          첫 일정 {hhmm(first.start)} {first.title}
          {first.place ? ` · ${first.place}` : ''}
        </p>
      )}
      {b.warning && (
        <p className="inbox-warn" role="note">
          {b.warning}
        </p>
      )}

      <h3 className="group-title">먼저 할 것</h3>
      {b.top3.length === 0 && <p className="empty">할 일이 없어요</p>}
      <div className="menu-list">
        {b.top3.map((t) => (
          <button key={t.id} type="button" onClick={() => onTask(byId(t))}>
            {t.title}
            <span className="inbox-sub num">
              {dueText(t.due)}
              {t.minutes ? ` · ${minutesLabel(t.minutes)}` : ''}
            </span>
          </button>
        ))}
      </div>

      {b.postpone && (
        <>
          <h3 className="group-title">미뤄도 되는 것</h3>
          <p className="inbox-line">
            ‘{b.postpone.title}’ — 여유가 가장 많아요.{' '}
            <button type="button" className="btn-text" onClick={() => onSnooze(byId(b.postpone))}>
              내일로 미루기
            </button>
          </p>
        </>
      )}

      {b.new_tasks?.length > 0 && (
        <>
          <h3 className="group-title">밤 정리로 생긴 할 일</h3>
          <ul className="inbox-new">
            {b.new_tasks.map((t) => (
              <li key={t.id}>
                <b>{t.title}</b>
                {t.memo && <span className="inbox-sub">메모 ‘{t.memo}’에서</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {question && (
        <>
          <h3 className="group-title">하루 한 질문</h3>
          <p className="inbox-line">‘{question.title}’ 얼마나 걸릴까요? 답하면 빈 시간에 맞춰 넣어 봐요.</p>
          <span className="seg" role="group" aria-label="걸리는 시간">
            {ASK.map(([m, label]) => (
              <button key={m} type="button" aria-pressed={false} onClick={() => answer(question, m)}>
                {label}
              </button>
            ))}
          </span>
        </>
      )}
      {asked != null && <p className="hint">고마워요. 할 일 자리를 다시 셌어요.</p>}
    </Sheet>
  );
}
