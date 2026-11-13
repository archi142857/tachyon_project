// 네이버 캘린더 칸 확인(setup.js checkNaver) — 서버 normalizeNaver와 같은 규칙이어야 한다(worker/test/caldav.test.js).
// 아이디·비밀번호는 지어낸 예시다.
import { describe, expect, it } from 'vitest';
import { NAVER, checkNaver, resultLine } from './setup.js';

describe('checkNaver', () => {
  it('빈칸 둘이면 empty', () => {
    expect(checkNaver('', '')).toEqual({ empty: true });
    expect(checkNaver('  ', ' ')).toEqual({ empty: true });
  });
  it('아이디는 @naver.com 앞부분·소문자, 비밀번호 사이 공백은 뺀다', () => {
    expect(checkNaver(' ExampleUser@naver.com ', 'EXAM PLEA PPPW 1234')).toEqual({ id: 'exampleuser', password: 'EXAMPLEAPPPW1234' });
  });
  it('아이디 모양이 아니면 아이디 오류', () => {
    expect(checkNaver('a b', 'EXAMPLEAPPPW1234').error).toMatch(/아이디/);
    expect(checkNaver('', 'EXAMPLEAPPPW1234').error).toMatch(/아이디/);
  });
  it('짧은 글(로그인 비밀번호처럼)은 애플리케이션 비밀번호를 넣어 달라고', () => {
    expect(checkNaver('exampleuser', 'short').error).toMatch(/애플리케이션 비밀번호/);
    expect(checkNaver('exampleuser', '').error).toMatch(/애플리케이션 비밀번호/);
  });
});

describe('NAVER 안내', () => {
  it('찾는 법은 2단계 인증 → 애플리케이션 비밀번호 순서, 로그인 비밀번호가 아니라고 말한다', () => {
    expect(NAVER.key).toBe('naver');
    const text = NAVER.steps.join(' ');
    expect(text).toMatch(/2단계 인증/);
    expect(text).toMatch(/애플리케이션 비밀번호/);
    expect(text).toMatch(/로그인 비밀번호가 아니/);
    expect(NAVER.open).toMatch(/^https:\/\/nid\.naver\.com\//);
  });
  it('연결 결과 한 줄은 다른 캘린더와 같은 말', () => {
    expect(resultLine({ kind: 'naver', ok: true, saved: true, tasks: 0, events: 5 })).toEqual({ ok: true, text: '일정 5개를 찾았어요' });
  });
});
