// 잠깐 떴다 사라지는 알림 막대. 되돌릴 수 있는 일은 확인 창 대신 여기서 [되돌리기]를 준다.
// 아래 창(<dialog>)이 열려 있으면 그 창 안에 그린다: 열린 창은 맨 위 층이라 밖에 그리면 가려지고 눌리지도 않는다.
// layer는 열린 창이 바뀔 때마다 달라지는 값(창이 닫히면 다시 화면 쪽으로 옮긴다).
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Snackbar({ text, actionLabel, onAction, onDone, ms = 5000, layer = '' }) {
  const [host, setHost] = useState(null);

  useLayoutEffect(() => {
    setHost(document.querySelector('dialog[open]') || document.body);
  }, [text, layer]);

  useEffect(() => {
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [text, onDone, ms]);

  if (!host) return null;
  return createPortal(
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
    </div>,
    host,
  );
}
