// 서버 시험용 환경 (담당: 서버 세션). 사람·주소는 모두 지어낸 예시다.
//
// 가짜 D1은 helpers/d1.js(AI 세션, 저장소 맨 위 schema.sql을 그대로 읽음)를 쓴다 — 표의 원본은 schema.sql 하나.

import { fakeD1, fakeCtx } from './d1.js';

export function makeEnv(extra = {}) {
  const DB = fakeD1();
  return { DB, APP_SECRET: 'test-secret-예시-0123456789abcdef', FEEDS_PER_RUN: '20', ...extra };
}

export const makeCtx = fakeCtx;

/** 예시 사용자를 넣고 users 행을 돌려준다 */
export async function addTestUser(env, { sub = 'sub-example-1', email = 'student@example.invalid', name = '예시 학생' } = {}) {
  return env.DB.prepare('INSERT INTO users (google_sub, email, name) VALUES (?, ?, ?) RETURNING *').bind(sub, email, name).first();
}
