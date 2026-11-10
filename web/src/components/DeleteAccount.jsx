// 계정 지우기: 메뉴의 '계정 지우기' 창과 설정 화면 맨 아래에 같은 것이 들어간다.
// 되돌릴 수 없으니 두 번 눌러야 지운다. 지운 뒤에는 로그인 화면으로(onDeleted).
import { useState } from 'react';
import { deleteAccount } from '../api.js';

export default function DeleteAccount({ example, heading = false, onDeleted }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    if (!sure) {
      setSure(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await deleteAccount();
      onDeleted(res?.example);
    } catch (err) {
      setError(err.message || '지우지 못했어요. 잠시 뒤에 다시 해 주세요');
      setBusy(false);
    }
  }

  return (
    <div className="form-grid">
      {heading && <h2 id="delete-account">계정 지우기</h2>}
      <p className="hint">Tachyon에 있는 내 캘린더 주소·eTL 연결·일정·할 일·메모·브리핑·기록·시간표 사진을 바로 모두 지우고 로그아웃해요. 되돌릴 수 없어요.</p>
      {example && <p className="hint">예시에서는 아무것도 지우지 않고 예시만 끝나요.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn-text danger" style={{ justifySelf: 'start' }} disabled={busy} onClick={run}>
        {busy ? '지우는 중…' : sure ? '한 번 더 누르면 모두 지워요' : '계정 지우기'}
      </button>
    </div>
  );
}
