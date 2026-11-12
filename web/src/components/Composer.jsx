// 아래 긴 메모 칸. Enter로 보낸다(한글 조합 중 Enter는 글자 확정만 하고 보내지 않는다).
// seed = { text } — 달력의 '+ 일정' · '+ 할 일'이 날짜를 미리 적어 두고 칸에 초점을 준다(일정은 메모 → 팝업 → 저장으로만 생긴다).
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export default function Composer({ onSend, disabled, seed }) {
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
        <button type="submit" className="send" aria-label="메모 보내기" disabled={!text.trim() || disabled}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
