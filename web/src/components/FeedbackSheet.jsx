// 의견 보내기: 종류(버그 / 불편 / 추가) + 한 줄. 화면 이름·시각·기기는 저절로 붙어 GitHub 이슈가 된다(서버 6_feedback).
import { useState } from 'react';
import { sendFeedback } from '../api.js';
import Sheet from './Sheet.jsx';

const KINDS = [
  { key: 'bug', label: '버그' },
  { key: 'pain', label: '불편' },
  { key: 'idea', label: '추가' },
];

export default function FeedbackSheet({ screen, onClose, onSent }) {
  const [kind, setKind] = useState('bug');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sendFeedback({ kind, text: text.trim(), screen });
      onSent(res?.example ? '예시 모드라 보내지 않았어요' : '보냈어요. 고마워요');
      onClose();
    } catch (err) {
      // 4xx(하루 한도 등)는 서버 문장 그대로, 서버 오류·연결 끊김은 한 줄 안내
      setError(err.status && err.status < 500 && err.message ? err.message : '보내지 못했어요. 잠시 뒤에 다시 해 주세요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="의견 보내기" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="segmented" role="group" aria-label="종류">
          {KINDS.map((k) => (
            <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
              {k.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>한 줄로</span>
          <input className="input" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} autoFocus />
        </label>
        <p className="hint">보낸 글은 GitHub 이슈로 남고, 저장소를 공개하면 누구나 봐요. 이름·학번·이메일 같은 개인 정보는 쓰지 마세요.</p>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn" disabled={busy || !text.trim()}>
          보내기
        </button>
      </form>
    </Sheet>
  );
}
