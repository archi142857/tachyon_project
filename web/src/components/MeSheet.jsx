// 나(마이페이지) — 사람 11-13 결정 '나 · 메뉴': "마이페이지랑 메뉴(설정)은 구분해서 만들기".
// 나 = 앱이 나에 대해 아는 것(시작 질문 셋 · 집중한 시간) + 끝낸 일 · 학과. 메뉴 = 연결 · 테마 · 로그아웃 같은 설정.
// start = 처음 길잡이 뒤 한 번 묻는 '시작 질문 셋'(9판) 모양: 질문만, 단추 '시작하기'.
import { useState } from 'react';
import { FIRSTS, FOCUSES, TEXTS, WAKES, applyText, readPrefs, savePrefs } from '../prefs.js';
import { setWake } from '../slots.js';
import { dateKey } from '../density.js';
import { focusWeek } from '../taskLocal.js';
import Sheet from './Sheet.jsx';

function Pick({ label, items, value, onChange }) {
  return (
    <div className="field">
      <span>{label}</span>
      <span className="seg" role="group" aria-label={label}>
        {items.map(([k, text]) => (
          <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}

export default function MeSheet({ start = false, onClose, onDoneList, onSetup }) {
  const [p, setP] = useState(readPrefs);
  const change = (k, v) => {
    const next = { ...p, [k]: v };
    setP(next);
    savePrefs(next);
    if (k === 'wake') setWake(v);
    if (k === 'text') applyText(v);
  };
  const week = focusWeek(dateKey(new Date()));
  const finish = () => {
    savePrefs(readPrefs()); // 고르지 않고 '시작하기'만 눌러도 답한 것으로(다시 묻지 않게). 고른 값은 change가 이미 적었다
    onClose();
  };

  return (
    <Sheet title={start ? '시작 질문 셋' : '나'} onClose={finish} front>
      {start && <p className="hint">답하면 하루 고리와 할 일 자리를 나에게 맞춰요. 나중에 ‘나’에서 바꿀 수 있어요.</p>}
      {!start && <h3 className="group-title">앱이 나에 대해 아는 것</h3>}
      <Pick label="몇 시에 일어나요?" items={WAKES.map((h) => [h, `${h}시`])} value={p.wake} onChange={(v) => change('wake', v)} />
      <Pick label="한 번에 몇 분 집중해요?" items={FOCUSES.map((m) => [m, `${m}분`])} value={p.focus} onChange={(v) => change('focus', v)} />
      <Pick label="앱을 열면 어디부터 볼까요?" items={FIRSTS} value={p.first} onChange={(v) => change('first', v)} />
      <Pick label="글자 크기" items={TEXTS} value={p.text} onChange={(v) => change('text', v)} />
      {!start && (
        <>
          <p className="hint num">이번 주 집중한 시간: {week ? `${week}분` : '아직 없어요'} (할 일을 눌러 ‘집중’을 시작하면 쌓여요)</p>
          <div className="menu-list">
            <button type="button" onClick={onDoneList}>
              끝낸 일
            </button>
            <button type="button" onClick={onSetup}>
              학과 · 학번 · 캘린더 연결
            </button>
          </div>
        </>
      )}
      {start && (
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={finish}>
            시작하기
          </button>
        </div>
      )}
    </Sheet>
  );
}
