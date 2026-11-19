// 아래 긴 메모 칸. Enter로 보낸다(한글 조합 중 Enter는 글자 확정만 하고 보내지 않는다).
// 모든 테마: 입력 + 오른쪽 보내기. 왼쪽의 '메모 N ▴' 단추와 띠 + 빨간 점 장식은 11-19 사람 "왜 있는지 모르겠음 지워줘"로 뺐다
// (메모 쪽은 옆 메뉴 · 폰 탭의 '메모'로 간다).
// 보내기 단추 모양만 테마 몫: 입자는 흰 '남기기 →'(nine.css), 나머지는 화살표 그림.
// seed = { text } — 달력의 '+ 일정' · '+ 할 일'이 날짜를 미리 적어 두고 칸에 초점을 준다(일정은 메모 → 팝업 → 저장으로만 생긴다).
// onFloat = 데스크탑 작은 메모 창 열기/닫기(MemoFloat.jsx, 크롬 · 엣지 PC만 — 없으면 단추도 없음), floating = 열려 있는지.
import { useEffect, useRef, useState } from 'react';
import { useParticles } from '../themeName.js';
import Icon from './Icon.jsx';

export default function Composer({ onSend, disabled, seed, onFloat = null, floating = false }) {
  const nine = useParticles();
  const [text, setText] = useState('');
  const input = useRef(null);
  useEffect(() => {
    if (!seed) return;
    setText(seed.text);
    input.current?.focus();
  }, [seed]);

  const send = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
  };

  return (
    <div className="composer">
      <form
        aria-label="메모 쓰기"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="memo-input" className="sr-only">
          메모
        </label>
        <input
          id="memo-input"
          ref={input}
          value={text}
          maxLength={500}
          autoComplete="off"
          enterKeyHint="send"
          placeholder="적기만 하세요 (예: 내일 3시 팀플)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            send();
          }}
        />
        {onFloat && (
          <button type="button" className="float-btn" aria-pressed={floating} title={floating ? '작은 메모 창 닫기' : '다른 창 위에 늘 떠 있는 작은 메모 창'} onClick={onFloat}>
            <Icon name="float" size={18} />
            <span>{floating ? '창 닫기' : '작은 창'}</span>
          </button>
        )}
        <button type="submit" className="send" aria-label="메모 보내기" disabled={!text.trim() || disabled}>
          {nine ? '남기기' : <Icon name="send" />}
        </button>
      </form>
    </div>
  );
}
