// 아래 긴 메모 칸. Enter로 보낸다(한글 조합 중 Enter는 글자 확정만 하고 보내지 않는다).
import { useState } from 'react';
import Icon from './Icon.jsx';

export default function Composer({ onSend, disabled }) {
  const [text, setText] = useState('');

  const send = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
  };

  return (
    <div className="composer">
      <form
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
          value={text}
          maxLength={500}
          autoComplete="off"
          enterKeyHint="send"
          placeholder="메모하기"
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
