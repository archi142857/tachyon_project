// 넓은 화면 '오늘' 쪽 위젯 칸(11-13 사람 "위젯 느낌으로 보고 끌어서 위치를 옮길 수 있도록 … 레이아웃도 기본으로 몇 개", 디자인 넷째 묶음 ②).
// 평소에는 지금 카드 그대로다. '배치 바꾸기'(editing)일 때만 카드마다 손잡이(.widget-grip)가 생긴다. 옮기는 길은 셋:
//  1. 손잡이를 끌어 다른 칸에 놓기(마우스 · 손가락) — 놓을 칸에 '여기에 놓기'
//  2. 손잡이를 눌러 집고(끌지 않고) 다른 칸의 '여기에 놓기'를 누르기 — 끌기가 어려운 사람(WCAG 2.5.7)
//  3. 손잡이에 초점을 두고 ← · → 로 앞 · 뒤 칸과 바꾸기(키보드)
// 놓으면 두 위젯이 자리를 바꾸고 FLIP으로 200ms 미끄러진다(동작 줄이기면 바로).
// children(widget): widget(id) → { slot, lifted, grip } — 카드에 data-slot · data-widget을 달고 grip을 카드 안에 넣는다.
// wide가 아니면(폰) 칸 · 배치를 달지 않아 지금 탭 그대로다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SLOTS, WIDGET_NAME, slotsOf } from '../todayLayout.js';

const OBJECT = { day: '오늘 일정을', ring: '하루 고리를', tasks: '할 일을', memo: '메모를' };
const objectOf = (w) => OBJECT[w] || WIDGET_NAME[w];
const cardsIn = (grid) => [...grid.querySelectorAll(':scope > .card[data-widget]')];

export default function WidgetGrid({ wide, layout, order, editing, onSwap, children }) {
  const gridRef = useRef(null);
  const [picked, setPicked] = useState(null); // { id, by: 'drag' | 'tap' }
  const [over, setOver] = useState(null); // 끄는 동안 놓을 칸의 위젯
  const [say, setSay] = useState(''); // 화면 읽기에 알릴 말
  const drag = useRef(null); // { id, el, x, y, rects, moved }
  const flipFrom = useRef(null);
  const on = wide && editing;
  const slots = slotsOf(order);

  useEffect(() => {
    if (!on) {
      setPicked(null);
      setOver(null);
    }
  }, [on]);

  // 두 위젯 자리 바꾸기. 바꾸기 전 자리를 적어 두었다가 그린 뒤 미끄러뜨린다
  function swap(id, other) {
    const i = order.indexOf(id);
    const j = order.indexOf(other);
    if (i < 0 || j < 0 || i === j) return;
    flipFrom.current = new Map(cardsIn(gridRef.current).map((el) => [el.dataset.widget, el.getBoundingClientRect()]));
    onSwap(i, j);
    setSay(`${objectOf(id)} ${j + 1}번째 칸으로, ${objectOf(other)} ${i + 1}번째 칸으로 옮겼어요`);
  }

  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!from || !gridRef.current || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (const el of cardsIn(gridRef.current)) {
      const a = from.get(el.dataset.widget);
      const b = el.getBoundingClientRect();
      if (!a || (Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1)) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
      el.getBoundingClientRect(); // 옛 자리를 먼저 그리게
      el.style.transition = 'transform 200ms var(--ease-out)';
      el.style.transform = '';
      el.addEventListener('transitionend', () => (el.style.transition = ''), { once: true });
    }
  }, [order]);

  const hitAt = (d, x, y) => d.rects.find(([, r]) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)?.[0] ?? null;

  function down(e, id) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget.closest('.card');
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rects = cardsIn(gridRef.current)
      .filter((c) => c !== el)
      .map((c) => [c.dataset.widget, c.getBoundingClientRect()]);
    drag.current = { id, el, x: e.clientX, y: e.clientY, rects, moved: false };
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) {
      d.moved = true;
      setPicked({ id: d.id, by: 'drag' });
    }
    d.el.style.transform = `translate(${dx}px, ${dy}px)`;
    setOver(hitAt(d, e.clientX, e.clientY));
  }
  function up(e, cancel = false) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    e.stopPropagation();
    if (!d.moved) {
      if (!cancel) setPicked((p) => (p?.id === d.id ? null : { id: d.id, by: 'tap' })); // 끌지 않고 눌렀으면 집기 · 내려놓기
      return;
    }
    const target = cancel ? null : hitAt(d, e.clientX, e.clientY);
    setPicked(null);
    setOver(null);
    if (target) {
      swap(d.id, target); // 끈 자리(transform 포함)에서 새 칸으로 미끄러진다
      d.el.style.transform = '';
    } else {
      d.el.style.transition = 'transform 200ms var(--ease-out)';
      d.el.style.transform = '';
      d.el.addEventListener('transitionend', () => (d.el.style.transition = ''), { once: true });
    }
  }
  function key(e, id) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (step) {
      e.preventDefault();
      const j = order.indexOf(id) + step;
      if (j >= 0 && j < order.length) swap(id, order[j]);
      else setSay(step < 0 ? '맨 앞 칸이에요' : '맨 뒤 칸이에요');
    } else if (e.key === 'Escape' && picked) {
      e.preventDefault();
      e.stopPropagation();
      setPicked(null);
    }
  }

  const widget = (id) => {
    if (!wide) return {};
    const name = WIDGET_NAME[id];
    return {
      slot: slots[id],
      lifted: picked?.id === id,
      grip: on ? (
        <button
          type="button"
          className="widget-grip"
          aria-label={`${name} 옮기기`}
          aria-describedby="widget-grip-how"
          aria-pressed={picked?.id === id}
          title="끌어서 다른 칸에 놓기 · 눌러서 집기 · ←→로 칸 바꾸기"
          onPointerDown={(e) => down(e, id)}
          onPointerMove={move}
          onPointerUp={(e) => up(e)}
          onPointerCancel={(e) => up(e, true)}
          onClick={(e) => {
            e.stopPropagation();
            if (e.detail === 0) setPicked((p) => (p?.id === id ? null : { id, by: 'tap' })); // 키보드 Enter · Space
          }}
          onKeyDown={(e) => key(e, id)}
        />
      ) : null,
    };
  };

  return (
    <div
      ref={gridRef}
      className={on ? 'today-grid editing' : 'today-grid'}
      data-layout={wide ? layout : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && picked) {
          e.stopPropagation();
          setPicked(null);
        }
      }}
    >
      {children(widget)}
      {/* 끄는 동안: 놓을 칸 하나에 그림만. 눌러서 집었으면: 다른 칸마다 누르는 '여기에 놓기' */}
      {on && picked?.by === 'drag' && over && (
        <div className="drop-zone" style={{ gridArea: slots[over] }} aria-hidden="true">
          여기에 놓기
        </div>
      )}
      {on &&
        picked?.by === 'tap' &&
        order
          .filter((w) => w !== picked.id)
          .map((w) => (
            <button key={w} type="button" className="drop-zone tap" style={{ gridArea: slots[w] }} onClick={() => (swap(picked.id, w), setPicked(null))}>
              여기에 놓기<span className="sr-only">: {WIDGET_NAME[w]} 자리</span>
            </button>
          ))}
      {on && (
        <p id="widget-grip-how" className="sr-only">
          끌어서 다른 칸에 놓거나, 눌러서 집은 뒤 다른 칸의 ‘여기에 놓기’를 누르거나, ←·→ 키로 앞뒤 칸과 바꿔요. 칸은 {SLOTS.length}개예요.
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {say}
      </p>
    </div>
  );
}
