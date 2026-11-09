// 홈 화면에 추가 안내. 안드로이드·PC 크롬은 설치 창을 바로 띄우고, 아이폰은 사파리에서 하는 법을 보인다.
import Sheet from './Sheet.jsx';

export default function InstallSheet({ prompt, onClose }) {
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  return (
    <Sheet title="홈 화면에 추가" onClose={onClose}>
      {prompt ? (
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await prompt.prompt();
            onClose();
          }}
        >
          설치하기
        </button>
      ) : ios ? (
        <p>사파리 아래쪽 공유 버튼 → ‘홈 화면에 추가’를 누르면 앱처럼 열려요. 다른 브라우저에서는 안 될 수 있어요.</p>
      ) : (
        <p>브라우저 메뉴(⋮) → ‘홈 화면에 추가’ 또는 ‘앱 설치’를 누르면 앱처럼 열려요.</p>
      )}
    </Sheet>
  );
}
