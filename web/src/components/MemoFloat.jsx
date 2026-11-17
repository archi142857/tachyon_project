// 데스크탑 작은 메모 창(11-17 사람 목록 '데스크탑용 어플에서는 우측 하단에 항상 메모 입력할 수 있는 공간을 띄우도록').
// 앱 안 메모 칸은 11-15 사람 요청대로 아래 전체 폭에 두고, 이건 따로 '다른 창 위에 늘 떠 있는 작은 창'이다:
// 크롬 · 엣지 PC의 Document Picture-in-Picture(늘 맨 위, 116+). 자리는 사이트가 못 정하고(사람이 끌어 옮김),
// Tachyon 탭(또는 설치한 앱 창)을 닫으면 같이 닫힌다. 폰 · 사파리 · 파이어폭스에는 없어서 단추도 안 보인다.
// 창 안 글은 본 화면 React 트리의 포털이다(createPortal → 작은 창 body): 보내기는 Dashboard sendMemo 그대로라
// 메모 목록 · 팝업('할 일로 넣을까요?')은 Tachyon 창에 뜨고, 작은 창은 한 줄로 알려 준다.
import { useCallback, useEffect, useRef, useState } from 'react';

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

// 작은 창 안: 입력 한 칸 + 보내기, 밑에 한 줄(보내는 중 · 남겼어요 · 팝업은 Tachyon 창에서)
// pending = 지금 Tachyon 창에 떠 있는 팝업의 이름(없으면 null)
export function FloatMemo({ onSend, waiting = false, pending = null, count = 0 }) {
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
  const line = waiting ? '보내는 중…' : pending ? `‘${pending}’ — 넣을지는 Tachyon 창에서 골라요` : sent ? `남겼어요 · 메모 ${count}개` : 'Enter로 남겨요. 일정 · 할 일이면 Tachyon 창에 물어봐요';
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
      <p className="float-line" role="status">
        {line}
      </p>
    </div>
  );
}
