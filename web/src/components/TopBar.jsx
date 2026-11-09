// 위 막대: 이름, 예시 표시, 의견 버튼, 햄버거 메뉴
import Icon from './Icon.jsx';

export default function TopBar({ example, onFeedback, onMenu }) {
  return (
    <header className="topbar">
      <span className="wordmark">Tachyon</span>
      {example && <span className="tag">예시 자료</span>}
      <span className="grow" />
      {onFeedback && (
        <button type="button" className="btn-text" onClick={onFeedback}>
          의견
        </button>
      )}
      {onMenu && (
        <button type="button" className="icon-btn" aria-label="메뉴" onClick={onMenu}>
          <Icon name="menu" />
        </button>
      )}
    </header>
  );
}
