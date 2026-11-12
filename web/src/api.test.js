// api.js: 서버 오류를 화면 글로 바꾸는 곳(11-12 서버 쪽지 1104 — 로그인 오류 db_limit·server, 503 { error, code })
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTogether, loginErrorText } from './api.js';

const answer = (status, body) => vi.fn(async () => new Response(body === undefined ? 'x' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('로그인 오류 글', () => {
  it('저장소 한도(db_limit)·서버 문제(server)는 알아듣는 글로', () => {
    expect(loginErrorText('db_limit')).toMatch(/오전 9시/);
    expect(loginErrorText('server')).toMatch(/잠시 뒤/);
    expect(loginErrorText('denied')).toMatch(/그만뒀어요/);
    expect(loginErrorText('state')).toBe('로그인하지 못했어요. 다시 해 주세요');
    expect(loginErrorText(null)).toBeNull();
  });
});

describe('API 오류 글', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('503 + code면 서버 안내 글과 code를 그대로 넘긴다', async () => {
    vi.stubGlobal('fetch', answer(503, { error: '오늘 서버가 쓸 수 있는 저장소 읽기 양을 다 썼어요. 한국 시각 오전 9시에 다시 돼요', code: 'db_limit' }));
    await expect(getTogether()).rejects.toMatchObject({ status: 503, code: 'db_limit', message: expect.stringMatching(/오전 9시/) });
  });

  it('503 준비 중(code 없음)도 서버 문장 그대로', async () => {
    vi.stubGlobal('fetch', answer(503, { error: '같이 쓰기를 준비 중이에요' }));
    await expect(getTogether()).rejects.toMatchObject({ status: 503, code: null, message: '같이 쓰기를 준비 중이에요' });
  });

  it('500이나 글이 없는 503은 한 줄 안내만', async () => {
    vi.stubGlobal('fetch', answer(500, { error: '서버에서 오류가 났다' }));
    await expect(getTogether()).rejects.toMatchObject({ status: 500, message: '잠깐 문제가 생겼어요. 잠시 뒤에 다시 해 주세요' });
    vi.stubGlobal('fetch', answer(503));
    await expect(getTogether()).rejects.toMatchObject({ status: 503, message: '잠깐 문제가 생겼어요. 잠시 뒤에 다시 해 주세요' });
  });

  it('4xx는 서버 문장 그대로', async () => {
    vi.stubGlobal('fetch', answer(400, { error: '그룹 이름을 적어 주세요' }));
    await expect(getTogether()).rejects.toMatchObject({ status: 400, message: '그룹 이름을 적어 주세요' });
  });
});
