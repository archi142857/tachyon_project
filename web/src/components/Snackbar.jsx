// 잠깐 떴다 사라지는 알림 막대. 되돌릴 수 있는 일은 확인 창 대신 여기서 [되돌리기]를 준다.
import { useEffect } from 'react';

export default function Snackbar({ text, actionLabel, onAction, onDone, ms = 5000 }) {
  useEffect(() => {
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [text, onDone, ms]);

  return (
    <div className="snackbar" role="status">
      <span>{text}</span>
      {actionLabel && (
        <button
          type="button"
          onClick={() => {
            onAction();
            onDone();
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
