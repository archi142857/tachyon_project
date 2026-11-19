// AI 에이전트 연결(11-19 사람 "타키온이 정리해둔 항목들을 클로드, gpt, gemini가 읽고 답변"): 주소 하나를 AI 앱에 넣으면
// 그 앱이 Tachyon 허락 화면을 띄우고, 허락하면 일정·빈 시간·할 일·eTL·브리핑을 읽고 일정·할 일을 넣는다(worker/13_mcp.js).
// 원터치(11-20 사람 "이것도 원터치로"): 앱마다 단추 하나.
//   Claude = 주소를 미리 채운 '사용자 지정 커넥터 추가' 창 링크(공식, claude.com/docs/connectors/building/directory-vs-custom 11-20 확인)
//   ChatGPT = 미리 채우는 링크가 없어 주소를 복사해 두고 설정을 연다 · Claude Code · Gemini CLI = 주소가 든 명령을 통째로 복사
// 연결된 앱은 여기서 끊는다(끊으면 그 앱의 토큰이 바로 안 먹는다).
import { useEffect, useState } from 'react';
import { getAiLinks, unlinkAi } from '../api.js';
import Sheet from './Sheet.jsx';

export const claudeLink = (mcp) => `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Tachyon&connectorUrl=${encodeURIComponent(mcp)}`;
export const aiCommands = (mcp) => ({
  claude: `claude mcp add --transport http --scope user tachyon ${mcp}`,
  gemini: `gemini mcp add --transport http -s user tachyon ${mcp}`,
});
const CHATGPT = 'https://chatgpt.com/#settings';
const linkButton = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' };

export default function AiSheet({ onClose }) {
  const [st, setSt] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () =>
    getAiLinks()
      .then(setSt)
      .catch((err) => setNote({ at: 'top', text: err.message || '불러오지 못했어요' }));
  useEffect(() => {
    load();
  }, []);

  // at = 알림을 띄울 줄(claude · chatgpt · code · gemini · url)
  async function copy(text, at, done) {
    try {
      await navigator.clipboard.writeText(text);
      setNote({ at, text: done });
    } catch {
      setNote({ at, text: '복사하지 못했어요. 길게 눌러 복사해 주세요:', code: text });
    }
  }
  const said = (at) =>
    note?.at === at && (
      <p className="hint" role="status" style={{ color: 'var(--accent-text)' }}>
        {note.text}
        {note.code && <code style={{ display: 'block', userSelect: 'all', overflowWrap: 'anywhere', color: 'var(--text)' }}>{note.code}</code>}
      </p>
    );

  async function unlink(link) {
    setBusy(link.id);
    try {
      await unlinkAi(link.id);
      setNote({ at: 'links', text: `${link.client} 연결을 끊었어요` });
      await load();
    } catch (err) {
      setNote({ at: 'links', text: err.message || '끊지 못했어요. 다시 해 주세요' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet title="AI 에이전트 연결" onClose={onClose}>
      <div className="form-grid">
        <p className="hint" style={{ fontSize: 15, lineHeight: '22px', color: 'var(--text)' }}>
          Claude · ChatGPT · Gemini가 내 일정 · 빈 시간 · 할 일 · eTL 공지와 강의자료 · 오늘 브리핑을 읽고, 일정 · 할 일을 넣을 수 있어요. 과목마다 공부방도 열려서 그 AI가 시험 범위의 eTL 자료로 문제를 내며 빈틈을 채워 줘요. 예: “이번 주에 2시간 빈 때 찾아서 스터디 넣어 줘” · “공부방 열어 줘”
        </p>
        {said('top')}
        {st?.ready === false && <p className="hint">AI 앱 연결은 아직 준비 중이에요. 곧 열려요.</p>}
        <div className="ai-pick">
          <div>
            <b>Claude</b>
            <a className="btn" style={linkButton} href={st ? claudeLink(st.mcp) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!st}>
              Claude에 연결
            </a>
            <p className="hint">주소가 채워진 커넥터 추가 창이 열려요 → 추가 → 연결 → Tachyon ‘허락’. 한 번 하면 데스크톱 · 폰 앱에서도 써요(무료 요금제는 커넥터 1개까지, Team · Enterprise는 관리자가 추가).</p>
          </div>
          <div>
            <b>ChatGPT</b>
            <a className="btn-line" style={linkButton} href={CHATGPT} target="_blank" rel="noopener noreferrer" onClick={() => st && copy(st.mcp, 'chatgpt', '주소를 복사했어요. 열린 ChatGPT 설정에서 붙여 넣어 주세요')}>
              주소 복사하고 열기
            </a>
            <p className="hint">주소를 복사하고 설정을 열어요 → 앱 › 고급 설정 › 개발자 모드 → 앱 만들기 → 붙여 넣기, 인증은 OAuth(ChatGPT는 주소를 채워 주는 링크가 없어요). 학교 ChatGPT Edu는 관리자가 개발자 모드를 켜야 보여요.</p>
            {said('chatgpt')}
          </div>
          <div>
            <b>Claude Code</b>
            <button type="button" className="btn-line" disabled={!st} onClick={() => copy(aiCommands(st.mcp).claude, 'code', '명령을 복사했어요. 터미널에 붙여 넣고, Claude Code에서 /mcp → tachyon으로 로그인해요')}>
              명령 복사
            </button>
            <p className="hint">터미널에 붙여 넣고, Claude Code에서 /mcp로 로그인해요.</p>
            {said('code')}
          </div>
          <div>
            <b>Gemini CLI</b>
            <button type="button" className="btn-line" disabled={!st} onClick={() => copy(aiCommands(st.mcp).gemini, 'gemini', '명령을 복사했어요. 터미널에 붙여 넣고, Gemini CLI에서 /mcp auth tachyon')}>
              명령 복사
            </button>
            <p className="hint">터미널에 붙여 넣고, Gemini CLI에서 /mcp auth tachyon 해요.</p>
            {said('gemini')}
          </div>
        </div>
        <div className="field">
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            다른 앱은 이 주소를 넣어요{st?.example ? ' (예시)' : ''}
            <button type="button" className="btn-text" style={{ height: 36 }} disabled={!st} onClick={() => copy(st.mcp, 'url', '주소를 복사했어요')}>
              주소 복사
            </button>
          </span>
          <input className="input" readOnly aria-label="연결 주소" value={st?.mcp || ''} onFocus={(e) => e.target.select()} />
        </div>
        {said('url')}
        <p className="hint">연결하면 Tachyon 허락 화면이 떠요. 허락하면 AI 앱이 부를 때마다 그 내용이 그 앱의 대화로 가요. 고치기 · 지우기는 못 해요.</p>
        {said('links')}
        {st?.links?.length > 0 && (
          <>
            <p className="hint" style={{ color: 'var(--text)', fontWeight: 700, marginTop: 8 }}>연결된 앱</p>
            <div className="menu-list">
              {st.links.map((link) => (
                <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {link.client}
                    <span className="hint" style={{ display: 'block' }}>
                      {link.host} · {link.created_at.slice(5, 10).replace('-', '/')} 연결{link.used_at ? ` · ${link.used_at.slice(5, 10).replace('-', '/')}에 씀` : ''}
                    </span>
                  </span>
                  <button type="button" className="btn-text" disabled={busy === link.id} onClick={() => unlink(link)}>
                    끊기
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
