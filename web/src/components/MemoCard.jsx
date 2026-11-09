// 메모(왼쪽 아래, 나와의 채팅처럼 쌓인다). 팝업으로 일정에 넣은 메모(event_id) 아래에는 한 줄을 붙인다.
import { useEffect, useRef } from 'react';
import { dayLabel, hhmm } from '../time.js';

export default function MemoCard({ memos, now, activeId, waiting }) {
  const logRef = useRef(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [memos.length, waiting, activeId]);

  let lastDay = null;
  return (
    <section className="card memo" aria-label="메모">
      <h2 className="card-title">메모</h2>
      <div className="memo-log" ref={logRef} aria-live="polite">
        {memos.length === 0 && <p className="empty">아래 칸에 적으면 여기에 쌓여요</p>}
        {memos.map((memo) => {
          const day = dayLabel(memo.created_at, now);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={memo.id} style={{ display: 'contents' }}>
              {showDay && <p className="memo-day">{day}</p>}
              <div className="bubble-row">
                <time className="num" dateTime={memo.created_at}>
                  {hhmm(memo.created_at)}
                </time>
                <span className={memo.id === activeId ? 'bubble on' : 'bubble'}>{memo.text}</span>
              </div>
              {memo.event_id && <p className="memo-saved">달력에 넣었어요</p>}
            </div>
          );
        })}
        {waiting && <p className="memo-wait">살펴보는 중…</p>}
      </div>
    </section>
  );
}
