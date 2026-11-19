import { describe, expect, it } from 'vitest';
import { aiCommands, claudeLink } from './components/AiSheet.jsx';

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
  it('명령에는 주소가 통째로 들어간다', () => {
    const c = aiCommands(mcp);
    expect(c.claude).toBe(`claude mcp add --transport http --scope user tachyon ${mcp}`);
    expect(c.gemini).toBe(`gemini mcp add --transport http -s user tachyon ${mcp}`);
  });
});
