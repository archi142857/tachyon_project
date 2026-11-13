// 아래에서 올라오는 창(넓은 화면은 가운데). front = 폰에서도 정면 가운데 + 뒤 흐림(사람 피드백 3 '정면에 뙇', 디자인 ⑤). 브라우저의 <dialog>를 써서 Esc·포커스 가두기를 그대로 받는다.
import { useEffect, useRef } from 'react';
import { useLift } from '../lift.js';

export default function Sheet({ title, onClose, front = false, className = '', children }) {
  const ref = useRef(null);
  const [lifted, onFocus] = useLift(); // 폰: 글자판 뜨는 칸에 초점이 가면 위로(날짜 · 시각 칸은 그대로, lift.js)

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[data-autofocus]')?.focus(); // showModal은 첫 단추(닫기)에 초점을 준다 — 바로 쓸 칸이 있으면 그리로(달력 빈 칸 → 일정 넣기 제목)
    return () => dialog.open && dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`sheet${front ? ' front' : ''}${front && lifted ? ' lifted' : ''}${className ? ` ${className}` : ''}`}
      onFocus={front ? onFocus : undefined}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="sheet-inner">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn-text quiet" onClick={onClose}>
            닫기
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
