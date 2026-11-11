// 모임 시간표(when2meet 모양, 서버 10_together.js): 날짜 열 × 시간 줄. 칸 진하기 = 되는 사람 / 아는 사람.
// 내가 되는 칸은 굵은 테두리. '칠하기'에서는 누르거나 끌어서 내 칸을 바꾼다(첫 칸이 되는 칸이면 '안 됨'으로, 아니면 '됨'으로).
// 남의 칸에는 빈/바쁨 수만 있다 — 일정 이름은 서버도 안 주고 화면도 짐작하지 않는다.
import { useMemo, useRef, useState } from 'react';
import { shortDate } from '../time.js';

export default function MeetGrid({ slots, known, paint, picked, now = new Date(), onPaint, onPick }) {
  const dates = useMemo(() => [...new Set(slots.map((s) => s.start.slice(0, 10)))], [slots]);
  const times = useMemo(() => [...new Set(slots.map((s) => s.start.slice(11, 16)))].sort(), [slots]);
  const byStart = useMemo(() => new Map(slots.map((s) => [s.start, s])), [slots]);
  const [pending, setPending] = useState(null); // 끄는 동안 칠한 칸: Map(start → 'free' | 'busy')
  const drag = useRef(null);

  const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-start]')?.dataset.start;

  const nowMs = new Date(now).getTime();
  const isPast = (s) => Date.parse(s.start) < nowMs; // 지난 칸은 옅게, 칠하지 않는다

  function down(e, s) {
    if (!paint || isPast(s)) return;
    e.preventDefault();
    const mode = s.me === 'free' ? 'busy' : 'free';
    drag.current = { mode, map: new Map([[s.start, mode]]) };
    setPending(new Map(drag.current.map));
  }
  function move(e) {
    if (!drag.current) return;
    const start = cellAt(e.clientX, e.clientY);
    if (start && !drag.current.map.has(start) && Date.parse(start) >= nowMs) {
      drag.current.map.set(start, drag.current.mode);
      setPending(new Map(drag.current.map));
    }
  }
  function up() {
    if (!drag.current) return;
    const marks = [...drag.current.map].map(([start, state]) => ({ start, state }));
    drag.current = null;
    onPaint(marks);
    setPending(null);
  }
  // 칠하기에서 마우스·손가락은 누르기·끌기(down/up)가 이미 칠했다. 키보드(Enter·Space, detail 0)만 여기서 바꾼다
  function click(e, s) {
    if (!paint) onPick(s.start);
    else if (e.detail === 0 && !isPast(s)) onPaint([{ start: s.start, state: s.me === 'free' ? 'busy' : 'free' }]);
  }

  return (
    <div
      className={`meet-grid${paint ? ' painting' : ''}`}
      style={{ gridTemplateColumns: `44px repeat(${dates.length}, minmax(44px, 1fr))`, '--rows': times.length }}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
      role="group"
      aria-label="모임 시간표"
    >
      <span className="mg-corner" aria-hidden="true" />
      {dates.map((d) => (
        <span key={d} className="mg-date num" aria-hidden="true">
          {shortDate(`${d}T00:00:00+09:00`)}
        </span>
      ))}
      {times.map((t) => (
        <div key={t} className="mg-row">
          <span className="mg-time num" aria-hidden="true">
            {t.endsWith(':00') ? t : ''}
          </span>
          {dates.map((d) => {
            const s = byStart.get(`${d}T${t}:00+09:00`);
            if (!s) return <span key={d} className="mg-cell off" aria-hidden="true" />;
            const mine = pending?.has(s.start) ? pending.get(s.start) === 'free' : s.me === 'free';
            const share = known ? s.free / known : 0;
            return (
              <button
                key={d}
                type="button"
                data-start={s.start}
                className={`mg-cell${mine ? ' mine' : ''}${s.mark ? ' marked' : ''}${picked === s.start ? ' picked' : ''}${isPast(s) ? ' past' : ''}`}
                style={{ '--a': share.toFixed(2) }}
                onPointerDown={(e) => down(e, s)}
                onClick={(e) => click(e, s)}
              >
                <span className="mg-fill" aria-hidden="true" />
                <span className="sr-only">
                  {shortDate(s.start)} {t}, {s.free}/{known}명 됨, 나 {mine ? '됨' : '안 됨'}
                  {paint ? ' — 누르면 바꿈' : ''}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
