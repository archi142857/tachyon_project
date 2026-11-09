// 테스트용 가짜 D1: Node 내장 SQLite(node:sqlite, Node 22.13 이상) 위에 D1과 같은 모양
// (prepare → bind → first · all · run, batch)을 씌운다. 표는 저장소 맨 위 schema.sql을 그대로 읽어 만든다.
// → schema.sql이 바뀌면 테스트가 바로 알려 준다. 다른 세션 테스트도 가져다 써도 된다.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL("../../../schema.sql", import.meta.url), "utf8"));
  return {
    prepare: (sql) => statement(db, sql, []),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const out = statements.map((s) => s.runNow());
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    sqlite: db, // 테스트에서 바로 들여다볼 때
  };
}

function statement(db, sql, params) {
  const plain = (row) => (row ? { ...row } : row);
  const returnsRows = /^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql);
  return {
    bind: (...args) => statement(db, sql, args.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v))),
    async first(column) {
      const row = plain(db.prepare(sql).get(...params));
      if (row == null) return null;
      return column ? row[column] : row;
    },
    async all() {
      return { results: db.prepare(sql).all(...params).map(plain), success: true, meta: {} };
    },
    async run() {
      return this.runNow();
    },
    runNow() {
      const st = db.prepare(sql);
      if (returnsRows) return { results: st.all(...params).map(plain), success: true, meta: {} };
      const r = st.run(...params);
      return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  };
}

/** 테스트용 사용자 한 명 넣기 (지어낸 값) */
export function addUser(d1, { email = "tester@example.com", googleSub = "sub-test" } = {}) {
  const r = d1.sqlite.prepare("INSERT INTO users (google_sub, email) VALUES (?, ?) RETURNING id").get(googleSub, email);
  return { id: r.id, email };
}

/** ctx.waitUntil로 넘긴 일을 모았다가 기다린다 */
export function fakeCtx() {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), settle: () => Promise.all(pending) };
}
