import { describe, expect, it } from 'vitest';
import { claudeCodeCommand, claudeCodeLinks, claudeCodePrompt, claudeLink } from './components/AiSheet.jsx';

describe('AI 에이전트 원터치', () => {
  const mcp = 'https://tachyon.example.dev/mcp';
  it('Claude 링크는 주소를 퍼센트 인코딩해 커넥터 추가 창을 채운다', () => {
    const u = new URL(claudeLink(mcp));
    expect(u.origin + u.pathname).toBe('https://claude.ai/customize/connectors');
    expect(u.searchParams.get('modal')).toBe('add-custom-connector');
    expect(u.searchParams.get('connectorName')).toBe('Tachyon');
    expect(u.searchParams.get('connectorUrl')).toBe(mcp);
    expect(claudeLink(mcp)).toContain('connectorUrl=https%3A%2F%2Ftachyon.example.dev%2Fmcp');
  });
  it('Claude Code 링크는 추가 + 로그인 명령이 든 부탁을 채운다', () => {
    expect(claudeCodeCommand(mcp)).toBe(`claude mcp add --transport http --scope user tachyon ${mcp} && claude mcp login tachyon`);
    const { terminal, vscode } = claudeCodeLinks(mcp);
    expect(terminal.startsWith('claude-cli://open?q=')).toBe(true);
    expect(vscode.startsWith('vscode://anthropic.claude-code/open?prompt=')).toBe(true);
    expect(claudeCodePrompt(mcp).endsWith(`\n${claudeCodeCommand(mcp)}`)).toBe(true);
    expect(decodeURIComponent(terminal.split('?q=')[1])).toBe(claudeCodePrompt(mcp));
    expect(decodeURIComponent(vscode.split('?prompt=')[1])).toBe(claudeCodePrompt(mcp));
    expect(terminal).not.toMatch(/[ &]/); // 주소 안 & · 빈칸이 다른 인자로 새지 않게
  });
});
