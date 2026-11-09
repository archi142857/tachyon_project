// 홈 화면에 추가 안내. 안드로이드·PC 크롬은 설치 창을 바로 띄우고, 아이폰은 사파리에서 하는 법을 보인다.
// 아이폰 홈 화면 앱은 사파리와 쿠키가 따로라, 로그인한 뒤에 추가하라고 안내한다(추가할 때 쿠키가 옮겨 간다).
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
        <p>사파리 아래쪽 공유 버튼 → ‘홈 화면에 추가’를 누르면 앱처럼 열려요. 지금처럼 로그인한 채로 추가하면 보통 홈 화면 앱에도 로그인이 이어져요.</p>
      ) : (
        <p>브라우저 메뉴(⋮) → ‘홈 화면에 추가’ 또는 ‘앱 설치’를 누르면 앱처럼 열려요.</p>
      )}
    </Sheet>
  );
}
