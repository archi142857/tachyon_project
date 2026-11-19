// eTL(Canvas) 액세스 토큰 알아보기 — 컨셉 몫(EtlSheet.jsx와 같이, 11-13 사람 피드백 '클릭만 하면 되도록'·'eTL에서 돌아가기').
// 복사해 둔 글이 토큰 모양일 때만 '연결할까요?'를 띄운다. 다른 글(비밀번호·메모 등)은 화면에만 두고 서버로 보내지 않는다.
// 토큰 모양: '숫자~영문·숫자'(예: 1234~AbCd…, 뒤는 보통 64자). eTL 비밀번호와 섞이지 않게 길이도 본다.

const TOKEN = /^\d{1,8}~[A-Za-z0-9]{20,}$/;

/** 복사한 글에서 토큰을 꺼낸다(앞뒤 공백·줄바꿈 무시). 토큰이 아니면 null */
export function tokenFrom(text) {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, '');
  return TOKEN.test(t) ? t : null;
}

/** 화면에 보일 때는 끝 4자만: '…a1B2' */
export function maskToken(token) {
  return token ? `…${token.slice(-4)}` : '';
}

// ── 원터치 연결(11-20 사람 "로그인만 하면 나머진 알아서 · 안 된다고만 하지 말고 우회해서") ──
// 학생이 eTL(서울대 로그인 화면)에 직접 로그인하면, eTL 쪽 화면 안에서 grab()을 돌려 토큰을 만들고 캘린더 주소를 읽는다.
// 비밀번호는 서울대 화면에만 들어가고 Tachyon은 보지 않는다(계획.md '비밀번호는 절대 받지 않음' 그대로).
//   - 안드로이드 앱: 앱 안 창(app/android-native EtlPlugin.kt)이 eTL 쪽이 뜰 때마다 nativeScript()를 돌린다 → 완전 자동
//   - PC 브라우저: 다른 사이트 화면에 글을 넣을 길이 북마크뿐이라 bookmarklet()(처음 한 번 즐겨찾기 줄로 끌어다 놓기 → 로그인 뒤 한 번 누르기)
// 서버는 토큰만 있으면 캘린더 주소도 스스로 찾는다(worker/9_etl.js linkCalendar) — ics는 토큰을 못 만들 때의 대비.
export const ETL_ORIGIN = 'https://myetl.snu.ac.kr';

/**
 * eTL 화면 안에서 도는 함수. 글로 바꿔(Function.toString) 다른 화면에 넣으므로 밖의 이름을 하나도 쓰지 않는다.
 * → 로그인 전이면 null, 로그인했으면 { token, ics }(못 얻은 것은 null)
 * 토큰 만들기: 2024년 뒤 Canvas는 POST /api/v1/users/self/tokens(token[…], 학생은 만료 120일 안 필수),
 * 그 전 Canvas는 POST /profile/tokens(access_token[…]) — 서울대 eTL은 11-20 기준 앞 경로가 없어 뒤쪽. 응답의 visible_token이 토큰.
 * 세션 요청이라 CSRF 값(_csrf_token 쿠키)을 머리와 본문에 같이 넣고, 세션 JSON 앞에 붙는 while(1);은 떼고 읽는다.
 */
export async function grab() {
  const read = async (r) => JSON.parse((await r.text()).replace(/^while\(1\);/, ''));
  const me = await fetch('/api/v1/users/self/profile', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!me.ok) return null;
  const ics = ((await read(me)).calendar || {}).ics || null;
  const csrf = decodeURIComponent((document.cookie.match(/(?:^|;\s*)_csrf_token=([^;]*)/) || [])[1] || '');
  const until = new Date(Date.now() + 119 * 864e5).toISOString();
  const tries = [
    ['/api/v1/users/self/tokens', { 'token[purpose]': 'Tachyon', 'token[expires_at]': until }],
    ['/profile/tokens', { 'access_token[purpose]': 'Tachyon' }],
  ];
  for (const [path, fields] of tries) {
    const r = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-CSRF-Token': csrf },
      body: new URLSearchParams({ ...fields, authenticity_token: csrf }),
    });
    if (!r.ok) continue;
    const token = (await read(r).catch(() => ({}))).visible_token;
    if (token) return { token, ics };
  }
  return { token: null, ics };
}

/** 앱 안 창에 넣는 글: 로그인 전이면 { wait: true }(다음 쪽에서 다시), 끝나면 { token, ics } 또는 { error } */
export function nativeScript() {
  return `(${grab})().then((r) => TachyonEtl.done(JSON.stringify(r || { wait: true })), (e) => TachyonEtl.done(JSON.stringify({ error: String(e) })))`;
}

/**
 * PC 즐겨찾기 줄에 끌어다 놓는 북마크 주소(javascript:). eTL 창에서 누르면 grab() → Tachyon이 연 창이면 그 Tachyon에 보내고 닫고,
 * 아니면 이 탭을 Tachyon(#etl=…)으로 옮긴다(토큰은 # 뒤라 서버 · 로그에 가지 않고, Tachyon이 읽자마자 주소에서 지운다).
 */
export function bookmarklet(origin) {
  const to = JSON.stringify(origin);
  const send = `(r) => {
    if (!r) return alert('eTL에 먼저 로그인한 뒤 눌러 주세요');
    const m = { tachyonEtl: 1, token: r.token, ics: r.ics };
    if (window.opener) { window.opener.postMessage(m, ${to}); window.close(); }
    else location.href = ${to} + '/#etl=' + encodeURIComponent(JSON.stringify(m));
  }`;
  const code = `if (location.origin !== ${JSON.stringify(ETL_ORIGIN)}) alert('eTL(myetl.snu.ac.kr) 창에서 눌러 주세요');
  else (${grab})().then(${send}, (e) => alert('eTL 연결을 만들지 못했어요: ' + e));void 0`;
  return `javascript:${encodeURIComponent(code.replace(/\s*\n\s*/g, ' '))}`;
}

/** 북마크가 보낸 것인지 보고 { token, ics }로(모양이 틀리면 null). postMessage · #etl= 둘 다 */
export function giftFrom(data) {
  if (!data || data.tachyonEtl !== 1) return null;
  const token = tokenFrom(data.token || '');
  const ics = typeof data.ics === 'string' && data.ics.startsWith(`${ETL_ORIGIN}/`) ? data.ics : null;
  return token || ics ? { token, ics } : null;
}

/** 주소의 #etl=…를 읽고 바로 지운다(뒤로 가기 · 새로 고침에 남지 않게) */
export function takeHashGift() {
  const h = window.location.hash;
  if (!h.startsWith('#etl=')) return null;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  try {
    return giftFrom(JSON.parse(decodeURIComponent(h.slice(5))));
  } catch {
    return null;
  }
}
