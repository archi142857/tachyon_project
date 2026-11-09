// 의견 보내기: 종류(버그 / 불편 / 추가) + 한 줄. 화면 이름·시각·기기는 저절로 붙어 GitHub 이슈가 된다(서버 6_feedback).
import { useState } from 'react';
import { sendFeedback } from '../api.js';
import Sheet from './Sheet.jsx';

const KINDS = [
  { key: 'bug', label: '버그' },
  { key: 'inconvenience', label: '불편' },
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
    } catch {
      setError('보내지 못했어요. 잠시 뒤에 다시 해 주세요');
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
        <p className="hint">올린 글은 팀 GitHub 이슈로 남아요. 이름·학번 같은 개인정보는 적지 마세요.</p>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn" disabled={busy || !text.trim()}>
          보내기
        </button>
      </form>
    </Sheet>
  );
}
