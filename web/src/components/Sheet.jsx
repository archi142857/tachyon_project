// 아래에서 올라오는 창(넓은 화면은 가운데). 브라우저의 <dialog>를 써서 Esc·포커스 가두기를 그대로 받는다.
import { useEffect, useRef } from 'react';

export default function Sheet({ title, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => dialog.open && dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
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
