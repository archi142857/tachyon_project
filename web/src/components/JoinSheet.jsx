// 초대 링크(…/?join=<code>)를 열고 로그인하면 뜨는 창: 미리 보기 → '받기'(서버 10_together.js).
// 404 = 없는 링크, 410 = 기한 지난 링크, 400 = 내가 만든 링크 등 — 서버 문장을 그대로 보인다.
import { useEffect, useState } from 'react';
import * as api from '../api.js';
import Sheet from './Sheet.jsx';

export default function JoinSheet({ code, onClose, onJoined }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.previewJoin(code).then(setInfo, (err) => setError(err.status === 410 ? '기한이 지난 초대 링크예요. 새 링크를 받아 주세요' : err.status === 404 ? '없는 초대 링크예요' : err.message || '초대 링크를 열지 못했어요'));
  }, [code]);

  async function accept() {
    setBusy(true);
    try {
      const res = await api.acceptJoin(code);
      onJoined(res.kind === 'group' ? `그룹 ‘${res.group.name}’에 들어왔어요` : `${res.friend.name}님과 친구가 됐어요`);
    } catch (err) {
      setError(err.message || '받지 못했어요. 다시 해 주세요');
      setBusy(false);
    }
  }

  const what = info && (info.kind === 'group' ? `그룹 ‘${info.group?.name}’(${info.group?.members}명)에 초대했어요` : '친구 추가를 보냈어요');
  return (
    <Sheet title="초대 받기" onClose={onClose}>
      <div className="form-grid">
        {!info && !error && <p className="hint">초대 링크를 살펴보는 중…</p>}
        {info && (
          <p style={{ fontSize: 16, lineHeight: '24px' }}>
            {info.from?.name || '누군가'}님이 {what}
          </p>
        )}
        {info?.mine && <p className="hint">내가 만든 링크예요. 다른 사람에게 보내 주세요.</p>}
        <p className="hint">받으면 서로 '같이' 쪽에서 보이고, 모임 시간표에는 내 일정이 이름 없이 '바쁨'으로만 보여요.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn-text quiet" onClick={onClose}>
          닫기
        </button>
        <button type="button" className="btn" disabled={!info || info.mine || busy} onClick={accept}>
          받기
        </button>
      </div>
    </Sheet>
  );
}
