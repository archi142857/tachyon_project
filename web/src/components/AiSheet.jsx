// AI 에이전트 연결(11-19 사람 "타키온이 정리해둔 항목들을 클로드, gpt, gemini가 읽고 답변"): 주소 하나를 AI 앱에 넣으면
// 그 앱이 Tachyon 허락 화면을 띄우고, 허락하면 일정·빈 시간·할 일·eTL·브리핑을 읽고 일정·할 일을 넣는다(worker/13_mcp.js).
// 원터치(11-20 사람 "이것도 원터치로" · "명령을 바로 붙여넣는 화면으로 연결해줘야지"): 앱마다 단추 하나로 '넣는 화면'까지 간다(11-20 각 공식 문서 확인).
//   Claude = 주소를 미리 채운 '사용자 지정 커넥터 추가' 창(claude.com/docs/connectors/building/directory-vs-custom).
//     Claude 계정으로 로그인한 Claude Code에도 이 커넥터가 저절로 들어간다(code.claude.com/docs/en/mcp 'Use MCP servers from claude.ai')
//   Claude Code = 명령이 채워진 Claude Code를 연다: 터미널 claude-cli://open?q= (code.claude.com/docs/en/deep-links) · VS Code 탭 vscode://anthropic.claude-code/open?prompt=
//     채운 글 = 명령을 실행해 달라는 부탁(+ 명령) → Enter 한 번에 추가 + 로그인(claude mcp login). '!'(셸 모드)는 미리 채우면 모드가 안 바뀌어서(11-20 이 노트북에서 열어 봄) 말로 부탁한다
//   ChatGPT = chatgpt.com/plugins(+ → Add custom MCP server, developers.openai.com/plugins/deploy/connect-chatgpt) · Gemini = gemini.google.com/devmode
//     (+ Create new → MCP Server URL, developers.google.com/connected-apps/mcp/dev-mode/usage) — 둘 다 주소를 채우는 링크가 없어 주소를 복사해 두고 그 화면을 연다.
//   Gemini CLI는 2026-05 Antigravity CLI로 넘어가며 명령이 바뀌어 뺐다(웹 Gemini로).
// 연결된 앱은 여기서 끊는다(끊으면 그 앱의 토큰이 바로 안 먹는다).
import { useEffect, useState } from 'react';
import { getAiLinks, unlinkAi } from '../api.js';
import Sheet from './Sheet.jsx';

export const claudeLink = (mcp) => `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Tachyon&connectorUrl=${encodeURIComponent(mcp)}`;
export const claudeCodeCommand = (mcp) => `claude mcp add --transport http --scope user tachyon ${mcp} && claude mcp login tachyon`;
export const claudeCodePrompt = (mcp) => `Tachyon(내 일정 · 할 일 앱)을 MCP 서버로 연결해 줘. 이 명령을 실행하고, 브라우저에 Tachyon 허락 창이 뜨면 내가 허락할 때까지 기다려 줘:\n${claudeCodeCommand(mcp)}`;
export const claudeCodeLinks = (mcp) => {
  const q = encodeURIComponent(claudeCodePrompt(mcp));
  return { terminal: `claude-cli://open?q=${q}`, vscode: `vscode://anthropic.claude-code/open?prompt=${q}` };
};
const CHATGPT = 'https://chatgpt.com/plugins';
const GEMINI = 'https://gemini.google.com/devmode';
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
      setNote({ at: 'links', text: err.message || '끊지 못했어요. 다시 시도해 주세요' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet title="AI 앱 연결" onClose={onClose}>
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
            <p className="hint">주소가 채워진 커넥터 추가 창이 열려요 → 추가 → 연결 → Tachyon ‘허락’. 한 번 하면 데스크톱 · 폰 앱과 Claude Code(Claude 계정 로그인)에서도 써요. 무료 요금제는 커넥터 1개까지, Team · Enterprise는 관리자가 추가해요.</p>
          </div>
          <div>
            <b>Claude Code</b>
            <span className="ai-btns">
              <a className="btn-line" style={linkButton} href={st ? claudeCodeLinks(st.mcp).terminal : undefined} aria-disabled={!st}>
                터미널에서
              </a>
              <a className="btn-line" style={linkButton} href={st ? claudeCodeLinks(st.mcp).vscode : undefined} aria-disabled={!st}>
                VS Code에서
              </a>
            </span>
            <p className="hint">
              부탁이 채워진 Claude Code가 열려요 → Enter 한 번이면 추가하고 Tachyon ‘허락’ 창까지 떠요(터미널은 처음이면 폴더 신뢰 질문에서 Yes). Claude 계정으로 로그인해 쓰면 위 ‘Claude에 연결’만으로도 들어와요. 안 열리면 Claude Code에서 아무 말이나 한 번 보낸 뒤 다시 눌러 주세요(그때 링크가 등록돼요) ·{' '}
              <button type="button" className="btn-text" style={{ height: 'auto', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }} disabled={!st} onClick={() => copy(claudeCodeCommand(st.mcp), 'code', '명령을 복사했어요. 터미널에 붙여 넣어 주세요')}>
                명령만 복사
              </button>
            </p>
            {said('code')}
          </div>
          <div>
            <b>ChatGPT</b>
            <a className="btn-line" style={linkButton} href={CHATGPT} target="_blank" rel="noopener noreferrer" onClick={() => st && copy(st.mcp, 'chatgpt', '주소를 복사했어요. 열린 화면에서 + → Add custom MCP server → 붙여 넣기')}>
              주소 복사하고 열기
            </a>
            <p className="hint">주소를 복사하고 ChatGPT 플러그인 화면을 열어요 → + → Add custom MCP server → Connection 칸에 붙여 넣기, 인증은 OAuth → Tachyon ‘허락’. ChatGPT는 주소를 채워 주는 링크가 없어요. 학교 ChatGPT Edu는 관리자 설정에 따라 막혀 있을 수 있어요.</p>
            {said('chatgpt')}
          </div>
          <div>
            <b>Gemini</b>
            <a className="btn-line" style={linkButton} href={GEMINI} target="_blank" rel="noopener noreferrer" onClick={() => st && copy(st.mcp, 'gemini', '주소를 복사했어요. 열린 화면에서 + Create new → MCP Server URL에 붙여 넣기')}>
              주소 복사하고 열기
            </a>
            <p className="hint">주소를 복사하고 Gemini 개발자 모드를 열어요 → + Create new → MCP Server URL 칸에 붙여 넣기 → Tachyon ‘허락’. Gemini도 주소를 채워 주는 링크가 없어요.</p>
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
