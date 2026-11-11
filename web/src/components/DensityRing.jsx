// 날마다 밀도 고리(11-11 사람 요청): 한 바퀴 = 그날 깨어 있는 시간(7시~24시, density.js AWAKE).
// 남색 = 일정, 노란 형광 = 할 일(마감 전 날들에 고르게 나눈 몫), 주황 = 빠듯(하루 편한 몫을 넘겨 빈 시간까지), 빈 곳 = 빈 시간, 붉은 테 = 빈 시간보다 넘침.
// 글자(시간)는 옆에서 따로 보인다. 그림은 화면 읽기에서 빼고, 부르는 쪽이 aria-label로 한 줄을 준다.
import { AWAKE } from '../density.js';

const R = 12;
const C = 2 * Math.PI * R;

export default function DensityRing({ day, size = 28 }) {
  if (!day) return <span className="dring-empty" style={{ width: size, height: size }} aria-hidden="true" />;
  const e = Math.min(1, day.eventMin / AWAKE);
  const t = Math.min(1 - e, (day.taskMin + day.over) / AWAKE);
  const x = Math.min(t, (day.extraMin || 0) / AWAKE); // 빠듯: 하루 편한 몫(서버 daily_min)을 넘겨 빈 시간까지 넣은 몫 — 할 일 몫의 끝쪽
  const over = day.over > 0 || day.eventMin + day.taskMin > AWAKE;
  return (
    <svg className={`dring${over ? ' over' : ''}${day.past ? ' past' : ''}`} viewBox="-16 -16 32 32" width={size} height={size} aria-hidden="true">
      <circle className="track" r={R} />
      {e > 0 && <circle className="ev" r={R} strokeDasharray={`${(e * C).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90)" />}
      {t > 0 && (
        <circle className="task" r={R} strokeDasharray={`${(t * C).toFixed(2)} ${C.toFixed(2)}`} strokeDashoffset={(-e * C).toFixed(2)} transform="rotate(-90)" />
      )}
      {x > 0 && (
        <circle className="extra" r={R} strokeDasharray={`${(x * C).toFixed(2)} ${C.toFixed(2)}`} strokeDashoffset={(-(e + t - x) * C).toFixed(2)} transform="rotate(-90)" />
      )}
    </svg>
  );
}
