// 데스크탑 작은 메모 창(11-17 사람 목록 '데스크탑용 어플에서는 우측 하단에 항상 메모 입력할 수 있는 공간을 띄우도록').
// 앱 안 메모 칸은 11-15 사람 요청대로 아래 전체 폭에 두고, 이건 따로 '다른 창 위에 늘 떠 있는 작은 창'이다:
// 크롬 · 엣지 PC의 Document Picture-in-Picture(늘 맨 위, 116+). 자리는 사이트가 못 정하고(사람이 끌어 옮김),
// Tachyon 탭(또는 설치한 앱 창)을 닫으면 같이 닫힌다. 폰 · 사파리 · 파이어폭스에는 없어서 단추도 안 보인다.
// 창 안 글은 본 화면 React 트리의 포털이다(createPortal → 작은 창 body): 보내기는 Dashboard sendMemo 그대로라
// 메모 목록은 Tachyon 창에 쌓인다. 팝업('넣을까요?')은 11-19 사람 "다른 창을 보고 있을 때도 위로 팝업으로 … 타키온 창을 보고 있으면
// 그냥 저대로"에 따라: Tachyon 창이 안 보이면(visibilityState hidden — 다른 탭 · 최소화 · 다른 앱에 다 가림) 작은 창을 키워 그 안에(FloatPopup),
// 보이면 지금처럼 Tachyon 창에. 창 키우기는 브라우저가 손 누름 바로 뒤(몇 초)에만 허락해서(Document PiP 규칙),
// AI 답이 늦어 못 키우면 팝업은 Tachyon 창에 두고 작은 창 한 줄에 '여기서 고르기' 단추 — 누르면 그 손 누름으로 키워 옮긴다.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// 팝업을 띄울 때 창 크기. 닫으면 그 전 크기로 되돌린다(사람이 끌어 바꾼 크기 그대로)
export const POPUP_SIZE = [470, 560];
const before = new WeakMap(); // 창 → 키우기 전 [너비, 높이]

// 작은 창을 팝업 크기로 → 됐으면 true. 손 누름 뒤가 아니면 브라우저가 NotAllowedError를 던져 false
export function growFloat(win, [w, h] = POPUP_SIZE) {
  if (!win) return false;
  try {
    const size = [win.outerWidth, win.outerHeight];
    win.resizeTo(Math.max(w, size[0]), Math.max(h, size[1]));
    if (!before.has(win)) before.set(win, size);
    return true;
  } catch {
    return false;
  }
}

// 팝업이 닫히면 키우기 전 크기로(저장 · 그만 단추를 누른 바로 뒤라 허락된다). 못 줄이면 그대로 둔다
export function shrinkFloat(win) {
  const size = win && before.get(win);
  if (!size) return;
  before.delete(win);
  try {
    win.resizeTo(size[0], size[1]);
  } catch {
    /* 사람이 직접 줄이면 된다 */
  }
}

// 팝업 글이 창보다 길면(고치기 칸을 열면) 그만큼 키운다. 화면 높이를 넘지 않게, 못 키우면 창 안에서 굴린다
export function fitFloat(win, contentHeight) {
  try {
    const frame = win.outerHeight - win.innerHeight; // 창 위 제목 줄
    const want = Math.min(Math.ceil(contentHeight + frame), (win.screen?.availHeight || 900) - 40);
    if (want > win.outerHeight + 4) win.resizeTo(win.outerWidth, want);
  } catch {
    /* 손 누름 뒤가 아님 — 굴려서 본다 */
  }
}

export const canFloat = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;

// 본 창의 CSS를 작은 창에 한 번 옮긴다(공식 안내 그대로: 읽히는 규칙은 <style>로, 못 읽으면 <link>로).
// 테마 · 글자 크기는 <html>의 속성(data-theme · style · class · lang)을 같이 옮겨 같은 모양이 되게
export function copyLook(from, to) {
  for (const sheet of [...from.styleSheets]) {
    try {
      const style = to.createElement('style');
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      to.head.append(style);
    } catch {
      if (!sheet.href) continue;
      const link = to.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      to.head.append(link);
    }
  }
  for (const { name, value } of [...from.documentElement.attributes]) to.documentElement.setAttribute(name, value);
  to.body.className = 'float-body';
  to.title = 'Tachyon 메모';
}

// [창, 열기, 닫기]. 열기는 사람이 누른 그 순간에만 된다(브라우저 규칙). 창이 닫히면(× · Tachyon 탭 닫기) null로
export function useFloatWindow() {
  const [win, setWin] = useState(null);
  const open = useCallback(async () => {
    if (!canFloat()) return;
    try {
      const next = await window.documentPictureInPicture.requestWindow({ width: 420, height: 150 });
      copyLook(document, next.document);
      next.addEventListener('pagehide', () => setWin(null), { once: true });
      setWin(next);
    } catch {
      setWin(null);
    }
  }, []);
  const close = useCallback(() => win?.close(), [win]);
  // 테마를 바꾸면 작은 창도 따라 바꾼다(<html> 속성만 — CSS는 처음에 다 옮겨 둠)
  useEffect(() => {
    if (!win) return undefined;
    const sync = () => {
      for (const { name, value } of [...document.documentElement.attributes]) win.document.documentElement.setAttribute(name, value);
    };
    const watch = new MutationObserver(sync);
    watch.observe(document.documentElement, { attributes: true });
    return () => watch.disconnect();
  }, [win]);
  return [win, open, close];
}

// 작은 창 안의 팝업 틀: 창 몸에 has-popup을 달아 팝업이 창에 꽉 차게(memofloat.css), 글이 길어지면 창을 키우고, Esc = 그만
export function FloatPopup({ win, onCancel, children }) {
  const box = useRef(null);
  useLayoutEffect(() => {
    const body = win.document.body;
    body.classList.add('has-popup');
    return () => body.classList.remove('has-popup');
  }, [win]);
  useEffect(() => {
    const el = box.current;
    if (!el || !win.ResizeObserver) return undefined;
    const fit = () => fitFloat(win, el.scrollHeight);
    fit();
    const watch = new win.ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [win]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    win.addEventListener('keydown', onKey);
    return () => win.removeEventListener('keydown', onKey);
  }, [win, onCancel]);
  return (
    <div ref={box} className="float-popup">
      {children}
    </div>
  );
}

// 작은 창 안: 입력 한 칸 + 보내기, 밑에 한 줄(보내는 중 · 남겼어요 · 팝업이 Tachyon 창에 있음)
// pending = 지금 Tachyon 창에 떠 있는 팝업의 이름(없으면 null), onHere = 그 팝업을 이 창으로 옮기기(누른 손으로 창을 키운다),
// note = Tachyon 창 아래 알림 글(‘…’ 할 일에 넣었어요 등) — 작은 창에서 고른 결과를 여기서도 보이게
export function FloatMemo({ onSend, waiting = false, pending = null, count = 0, onHere = null, note = null }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    input.current?.ownerDocument?.defaultView?.focus();
    input.current?.focus();
  }, []);
  const send = () => {
    const value = text.trim();
    if (!value || waiting) return;
    onSend(value);
    setText('');
    setSent(true);
    input.current?.focus();
  };
  const line = waiting ? '보내는 중…' : pending ? `‘${pending}’ 넣을까요? — Tachyon 창에 떠 있어요` : note || (sent ? `남겼어요 · 메모 ${count}개` : 'Enter로 남겨요. 일정 · 할 일이면 넣을지 물어봐요');
  return (
    <div className="float-memo">
      <form
        aria-label="작은 창 메모 쓰기"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={input}
          value={text}
          maxLength={500}
          autoComplete="off"
          aria-label="메모"
          placeholder="적기만 하세요 (예: 내일 3시 팀플)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            send();
          }}
        />
        <button type="submit" className="send" disabled={!text.trim() || waiting}>
          남기기
        </button>
      </form>
      <div className="float-status">
        <p className="float-line" role="status">
          {line}
        </p>
        {pending && onHere && !waiting && (
          <button type="button" className="float-here" onClick={onHere}>
            여기서 고르기
          </button>
        )}
      </div>
    </div>
  );
}
