import { describe, expect, it } from 'vitest';
import { maskToken, tokenFrom } from './etlToken.js';

// 지어낸 토큰(실제 토큰 아님)
const FAKE = `1234~${'Ab12'.repeat(16)}`;

describe('eTL 토큰 알아보기', () => {
  it('토큰 모양이면 꺼낸다(앞뒤 공백·줄바꿈 무시)', () => {
    expect(tokenFrom(FAKE)).toBe(FAKE);
    expect(tokenFrom(`  ${FAKE}\n`)).toBe(FAKE);
  });

  it('비밀번호·메모·주소는 토큰이 아니다', () => {
    expect(tokenFrom('mypassword123!')).toBeNull();
    expect(tokenFrom('내일 3시 팀플')).toBeNull();
    expect(tokenFrom('https://myetl.snu.ac.kr/feeds/calendars/user_x.ics')).toBeNull();
    expect(tokenFrom('1234~short')).toBeNull();
    expect(tokenFrom('')).toBeNull();
    expect(tokenFrom(null)).toBeNull();
  });

  it('화면에는 끝 4자만', () => {
    expect(maskToken(FAKE)).toBe(`…${FAKE.slice(-4)}`);
    expect(maskToken('')).toBe('');
  });
});
