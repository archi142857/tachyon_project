import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookmarklet, giftFrom, grab, maskToken, nativeScript, tokenFrom } from './etlToken.js';

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

// 가짜 eTL: 로그인했으면 프로필(캘린더 주소), 토큰은 옛 Canvas 경로(/profile/tokens)만 — 11-20 서울대 eTL처럼
const ICS = 'https://myetl.snu.ac.kr/feeds/calendars/user_EXAMPLE.ics';
function fakeEtl({ loggedIn = true } = {}) {
  const posts = [];
  const fetch = async (path, init = {}) => {
    if (path === '/api/v1/users/self/profile') return loggedIn ? new Response(`while(1);${JSON.stringify({ id: 1, calendar: { ics: ICS } })}`) : new Response('{}', { status: 401 });
    if (init.method === 'POST') {
      posts.push({ path, csrf: init.headers['X-CSRF-Token'], body: Object.fromEntries(init.body) });
      if (path === '/profile/tokens') return new Response(JSON.stringify({ purpose: 'Tachyon', visible_token: FAKE }));
    }
    return new Response('<html>없는 쪽</html>', { status: 404 });
  };
  return { fetch, posts, document: { cookie: 'a=1; _csrf_token=ab%2Bc%3D%3D; b=2' } };
}

describe('원터치 연결(eTL 화면 안에서 도는 글)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('로그인했으면 토큰을 만들고 캘린더 주소를 읽는다: 새 경로가 없으면 옛 경로로, CSRF는 풀어서', async () => {
    const etl = fakeEtl();
    vi.stubGlobal('fetch', etl.fetch);
    vi.stubGlobal('document', etl.document);
    expect(await grab()).toEqual({ token: FAKE, ics: ICS });
    expect(etl.posts.map((p) => p.path)).toEqual(['/api/v1/users/self/tokens', '/profile/tokens']);
    expect(etl.posts[1]).toMatchObject({ csrf: 'ab+c==', body: { 'access_token[purpose]': 'Tachyon', authenticity_token: 'ab+c==' } });
    expect(etl.posts[0].body['token[expires_at]']).toMatch(/^\d{4}-/);
  });

  it('로그인 전이면 아무것도 만들지 않는다', async () => {
    const etl = fakeEtl({ loggedIn: false });
    vi.stubGlobal('fetch', etl.fetch);
    vi.stubGlobal('document', etl.document);
    expect(await grab()).toBeNull();
    expect(etl.posts).toEqual([]);
  });

  it('앱 안 창: 로그인 전이면 wait, 끝나면 토큰 · 주소를 TachyonEtl.done으로', async () => {
    for (const loggedIn of [false, true]) {
      const etl = fakeEtl({ loggedIn });
      vi.stubGlobal('fetch', etl.fetch);
      vi.stubGlobal('document', etl.document);
      const got = await new Promise((done) => new Function('TachyonEtl', nativeScript())({ done }));
      expect(JSON.parse(got)).toEqual(loggedIn ? { token: FAKE, ics: ICS } : { wait: true });
    }
  });

  it('PC 북마크: Tachyon이 연 창이면 그 Tachyon에 보내고 닫는다, 아니면 #etl=로 옮긴다, eTL 밖이면 알리기만', async () => {
    const url = bookmarklet('https://tachyon.example.invalid');
    expect(url.startsWith('javascript:')).toBe(true);
    const code = decodeURIComponent(url.slice('javascript:'.length));
    const run = (env) => {
      const etl = fakeEtl();
      const said = [];
      new Function('location', 'window', 'alert', 'fetch', 'document', code)(env.location, env.window, (t) => said.push(t), etl.fetch, etl.document);
      return new Promise((r) => setTimeout(() => r({ said, posts: etl.posts }), 20));
    };
    const sent = [];
    const popup = { location: { origin: 'https://myetl.snu.ac.kr' }, window: { opener: { postMessage: (m, to) => sent.push([m, to]) }, close: () => sent.push('closed') } };
    await run(popup);
    expect(sent).toEqual([[{ tachyonEtl: 1, token: FAKE, ics: ICS }, 'https://tachyon.example.invalid'], 'closed']);
    expect(giftFrom(sent[0][0])).toEqual({ token: FAKE, ics: ICS });

    const tab = { location: { origin: 'https://myetl.snu.ac.kr' }, window: { opener: null } };
    await run(tab);
    expect(tab.location.href.startsWith('https://tachyon.example.invalid/#etl=')).toBe(true);
    expect(giftFrom(JSON.parse(decodeURIComponent(tab.location.href.split('#etl=')[1])))).toEqual({ token: FAKE, ics: ICS });

    const elsewhere = await run({ location: { origin: 'https://example.invalid' }, window: {} });
    expect(elsewhere.said[0]).toMatch(/eTL/);
    expect(elsewhere.posts).toEqual([]);
  });

  it('받은 것: 토큰 모양 · eTL 주소만', () => {
    expect(giftFrom({ tachyonEtl: 1, token: 'mypassword', ics: 'https://evil.example/x.ics' })).toBeNull();
    expect(giftFrom({ token: FAKE })).toBeNull();
    expect(giftFrom({ tachyonEtl: 1, token: null, ics: ICS })).toEqual({ token: null, ics: ICS });
  });
});
