// 첫 설정 '학과' 칸(11-11 사람 요청 "학부 선택은 목록으로 칸 밑에 죽 뜨다가 검색하면서 선택"):
// 칸을 누르면 바로 밑에 학과 목록이 죽 뜨고, 쓰는 대로 좁혀진다(이름 앞 → 이름 안 → 단과대 이름 순).
// 목록에 없는 학과·전공은 맨 아래 '‘…’ 그대로 쓰기'로 넣는다(Enter는 맞는 학과 맨 위 것). 목록: web/src/departments.json(만든 법은 그 안 about).
import { useId, useMemo, useRef, useState } from 'react';
import DEPARTMENTS from '../departments.json';
import { matchDepartments, searchKey } from '../setup.js';

export default function DeptPicker({ value, onChange, invalid }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // 연 뒤에 글을 쳤는지(안 쳤으면 목록 전체를 보인다 — 고른 것을 바꾸기 쉽게)
  const [active, setActive] = useState(-1);
  const closing = useRef(null);

  const query = typed ? value : '';
  const list = useMemo(() => matchDepartments(DEPARTMENTS.list, query), [query]);
  const exact = DEPARTMENTS.list.some(([name]) => searchKey(name) === searchKey(value));
  const custom = typed && value.trim() && !exact ? [[value.trim(), null]] : [];
  const options = [...list, ...custom];

  function pick(name) {
    onChange(name);
    setOpen(false);
    setTyped(false);
    setActive(-1);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      const row = options[active >= 0 ? active : 0];
      if (row) pick(row[0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="dept-picker">
      <input
        id={`${id}-input`}
        className="input"
        role="combobox"
        aria-label="학과"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-invalid={invalid ? 'true' : undefined}
        value={value}
        maxLength={60}
        placeholder="학과 이름을 치거나 목록에서 고르기"
        autoComplete="off"
        enterKeyHint="done"
        onFocus={() => {
          clearTimeout(closing.current);
          setOpen(true);
          setTyped(false);
        }}
        onBlur={() => {
          closing.current = setTimeout(() => setOpen(false), 150); // 목록을 누르는 사이 닫히지 않게 잠깐 둔다
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setTyped(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="dept-list" id={`${id}-list`} role="listbox" aria-label="학과 목록">
          {options.map(([name, college], i) => (
            <li
              key={college === null ? 'custom' : name}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active || (!typed && name === value)}
              className={i === active ? 'on' : undefined}
              onMouseDown={(e) => e.preventDefault()} // 누르는 순간 칸이 blur돼 목록이 먼저 닫히지 않게
              onClick={() => pick(name)}
            >
              {college === null ? (
                <span className="name">‘{name}’ 그대로 쓰기</span>
              ) : (
                <>
                  <span className="name">{name}</span>
                  <span className="college">{college}</span>
                </>
              )}
            </li>
          ))}
          {!options.length && <li className="empty">맞는 학과가 없어요</li>}
        </ul>
      )}
    </div>
  );
}
