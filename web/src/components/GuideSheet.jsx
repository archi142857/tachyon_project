// 처음 길잡이 4장(사람 피드백 9 '튜토리얼 다시 넣기', 8 '앱 사용 목적'). 문구 docs/tachyon/앱_소개_문구.md, 모양 디자인 ⑧, 그림 docs/tachyon/디자인/길잡이/.
// 처음 대시보드를 열 때 한 번(이 기기), 메뉴 '길잡이 다시 보기'로 다시. 옆으로 밀면 카드가 손가락을 따라오다 넘어간다(11-14 피드백 '스와이프').
import { useRef, useState } from 'react';
import pic1 from '../assets/guide/guide1.svg';
import pic2 from '../assets/guide/guide2.svg';
import pic3 from '../assets/guide/guide3.svg';
import pic4 from '../assets/guide/guide4.svg';
import Sheet from './Sheet.jsx';

const SEEN = 'tachyon_guide_seen';
export const guideSeen = () => {
  try {
    return localStorage.getItem(SEEN) === '1';
  } catch {
    return true; // 저장이 막힌 브라우저에서 매번 뜨지 않게
  }
};

const CARDS = [
  [pic1, '적기만 하세요', ["아래 칸에 아무렇게나 적으면 돼요. 예: '내일 3시 팀플 2동', '과제 3장까지 금요일'.", '일정이면 달력에, 할 일이면 할 일에 넣을지 바로 물어봐요.']],
  [pic2, '수업·과제를 한곳에', ['eTL·구글 캘린더·TT Wizard 시간표를 이으면 수업·과제·마감이 알아서 들어와요.', '메뉴에서 언제든 이을 수 있어요(하지 않아도 돼요).']],
  [pic3, '하루 고리로 한눈에', ['동그라미 하나가 오늘 24시간이에요.', '수업 · 내 일정 · 할 일을 넣어 본 자리 · 빨간 표시가 지금.', '빈 시간에 할 일을 넣어 봐 줘요. 마음에 들면 넣고, 아니면 다른 자리로.']],
  [pic4, '같이 쓰면 더 쉬워요', ['친구·그룹을 만들면 다 같이 되는 시간을 찾아 줘요. 남에게는 빈/바쁨만 보여요.']],
];

export default function GuideSheet({ onClose }) {
  const [i, setI] = useState(0);
  const x0 = useRef(null);
  const [pic, title, lines] = CARDS[i];
  const last = i === CARDS.length - 1;
  const close = () => {
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      // 못 적으면 다음에 한 번 더 뜬다
    }
    onClose();
  };
  const go = (d) => setI((n) => Math.min(CARDS.length - 1, Math.max(0, n + d)));
  const [dx, setDx] = useState(0); // 미는 중인 거리(px). 더 갈 카드가 없는 쪽은 1/3만 따라온다
  const move = (e) => {
    if (x0.current === null) return;
    const d = e.clientX - x0.current;
    setDx((d > 0 && i === 0) || (d < 0 && last) ? d / 3 : d);
  };
  const end = () => {
    if (x0.current === null) return;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    x0.current = null;
    setDx(0);
  };

  return (
    <Sheet title={`길잡이 ${i + 1}/${CARDS.length}`} onClose={close} front className="guide">
      <div
        className={`guide-swipe${dx ? ' moving' : ''}`}
        style={{ transform: `translateX(${dx}px)`, opacity: 1 - Math.min(0.5, Math.abs(dx) / 400) }}
        onPointerDown={(e) => {
          x0.current = e.clientX;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <img className="guide-pic" src={pic} alt={title} draggable={false} />
        <h2>{title}</h2>
        <ul>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <div className="guide-dots" aria-hidden="true">
        {CARDS.map((c, n) => (
          <i key={c[1]} className={n === i ? 'on' : undefined} />
        ))}
      </div>
      <div className="guide-actions">
        <button type="button" className="btn-text quiet" onClick={close}>
          건너뛰기
        </button>
        <button type="button" className="btn" onClick={last ? close : () => go(1)}>
          {last ? '시작하기' : '다음'}
        </button>
      </div>
    </Sheet>
  );
}
