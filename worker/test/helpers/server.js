// 서버 시험용 환경 (담당: 서버 세션). 사람·주소는 모두 지어낸 예시다.
//
// 가짜 D1은 helpers/d1.js(AI 세션, schema.sql을 그대로 읽음)를 쓴다.
// feeds 표는 schema.sql에 들어오기 전까지만 여기서 만든다(소통판에 요청함). 들어오면 IF NOT EXISTS라 그쪽 것을 쓴다.

import { fakeD1, fakeCtx } from './d1.js';
import { FEEDS_SQL } from '../../2_collect_ics.js';

export function makeEnv(extra = {}) {
  const DB = fakeD1();
  DB.sqlite.exec(FEEDS_SQL);
  return { DB, APP_SECRET: 'test-secret-예시-0123456789abcdef', FEEDS_PER_RUN: '20', ...extra };
}

export const makeCtx = fakeCtx;

/** 예시 사용자를 넣고 users 행을 돌려준다 */
export async function addTestUser(env, { sub = 'sub-example-1', email = 'student@example.invalid', name = '예시 학생' } = {}) {
  return env.DB.prepare('INSERT INTO users (google_sub, email, name) VALUES (?, ?, ?) RETURNING *').bind(sub, email, name).first();
}
