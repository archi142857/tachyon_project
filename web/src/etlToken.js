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
