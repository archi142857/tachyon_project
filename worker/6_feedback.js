// 6. 의견·오류 → GitHub 이슈 (담당: 서버 세션)
//
// 피드백 고리의 입구(계획 '피드백 고리'). 어느 화면에서든 의견을 보내면 GitHub 이슈가 되고,
// 화면 오류(window.onerror)·서버 오류도 같은 창구로 쌓인다. 같은 오류는 이슈 하나만 만든다.
//
//   POST /api/feedback        (로그인) { kind: 'bug'|'pain'|'idea', text, screen }
//                             → { ok, issue, url }  kind: 버그 / 불편 / 추가. 화면 이름·시각·기기는 자동으로 붙는다
//   POST /api/feedback/error  (로그인 없어도 됨) { message, stack, screen }  화면 오류 자동 보고
//                             → { ok, issue, duplicate }
//   reportServerError(env, err, { request, where })  worker/index.js가 서버 오류 때 부른다
//
// 이슈는 저장소가 공개되면 누구나 본다. 그래서 이메일·전화번호·긴 숫자(학번 등)·주소(URL)는 지우고 올리고,
// 보낸 사람은 '사용자 #번호'로만 적는다. 화면에도 '개인 정보는 쓰지 마세요'를 붙여 달라(화면 세션).
// 의견 글은 log 표(action 'feedback', detail에 지운 글)에도 남긴다 — GitHub 연결 전이나 실패해도 잃지 않게.
//
// 필요한 것: 비밀값 GITHUB_TOKEN(이 저장소 Issues 쓰기만 되는 fine-grained 토큰), [vars] GITHUB_REPO
// 한도: 한 사람 의견 하루 20개, 새 오류 이슈는 전체 하루 30개.

import { json, fail, readJson } from './lib/http.js';
import { kstIso, kstDate } from './lib/time.js';
import { logStatement } from './lib/log.js';

const KINDS = { bug: '버그', pain: '불편', idea: '추가' };
const FEEDBACK_PER_DAY = 20;
const ERROR_ISSUES_PER_DAY = 30;

export async function handle(request, env, ctx, user) {
  const { pathname } = new URL(request.url);
  if (request.method !== 'POST') return fail(405, 'POST만 받아요');
  if (pathname === '/api/feedback') return sendFeedback(request, env, user);
  if (pathname === '/api/feedback/error') return clientError(request, env, user);
  return fail(404, '없는 주소예요');
}

// ── 의견 버튼 ────────────────────────────────────────────────────

async function sendFeedback(request, env, user) {
  if (!user) return fail(401, '로그인이 필요해요');
  const body = await readJson(request);
  const kind = body && body.kind;
  if (!KINDS[kind]) return fail(400, "kind는 'bug'(버그)·'pain'(불편)·'idea'(추가) 가운데 하나예요");
  const text = scrub(body.text).slice(0, 500);
  if (!text) return fail(400, '한 줄이라도 적어 주세요');
  const screen = scrub(body.screen).slice(0, 60) || '?';

  if ((await countToday(env, 'feedback', user.id)) >= FEEDBACK_PER_DAY) return fail(429, `의견은 하루 ${FEEDBACK_PER_DAY}개까지예요`);

  const label = KINDS[kind];
  const issue = await createIssue(env, {
    title: `[${label}] ${firstLine(text).slice(0, 60)}`,
    body: [text, '', '---', `- 종류: ${label}`, `- 화면: ${screen}`, `- 시각: ${kstIso()}`, `- 기기: ${device(request)}`, `- 보낸 사람: 사용자 #${user.id}`, '', FOOTER].join('\n'),
    labels: ['의견', label],
  });
  await logStatement(env, user.id, 'feedback', { kind, screen, issue: issue ? issue.number : null, text }).run();
  return json({ ok: true, issue: issue ? issue.number : null, url: issue ? issue.html_url : null });
}

const FOOTER = '(Tachyon 의견 버튼이 만든 이슈. 이메일·전화번호·긴 숫자·주소는 지우고 올림)';

// ── 오류 자동 보고 ───────────────────────────────────────────────

async function clientError(request, env, user) {
  const body = await readJson(request, 16 * 1024);
  if (!body || typeof body.message !== 'string' || !body.message.trim()) return fail(400, 'message가 필요해요');
  const host = new URL(request.url).host;
  const result = await reportError(env, {
    where: `화면 ${scrub(body.screen).slice(0, 60) || '?'}`,
    message: body.message,
    stack: typeof body.stack === 'string' ? body.stack : '',
    device: device(request),
    userId: user ? user.id : null,
    host,
  });
  return json({ ok: true, ...result });
}

/** worker/index.js가 서버 오류 때 부른다(ctx.waitUntil 안에서). 실패해도 던지지 않는다. */
export async function reportServerError(env, err, { request, where } = {}) {
  try {
    // 숫자 번호는 :id로(같은 오류를 한 이슈로 묶게), 구독 주소의 서명(…ics)은 가린다
    const path = request ? new URL(request.url).pathname.replace(/\/[^/]+\.ics$/, '/….ics').replace(/\/\d+(?=\/|$)/g, '/:id') : '';
    return await reportError(env, {
      where: where || `서버 ${request ? `${request.method} ${path}` : '?'}`,
      message: `${(err && err.name) || 'Error'}: ${(err && err.message) || String(err)}`,
      stack: (err && err.stack) || '',
      device: 'Cloudflare Worker',
      userId: null,
    });
  } catch (e) {
    console.error('오류 보고 실패', e && e.message);
    return { issue: null };
  }
}

/** 같은 오류(어디서 + 메시지 모양)는 이슈 하나만. 이미 보고했으면 duplicate. */
async function reportError(env, { where: rawWhere, message, stack, device: dev, userId, host = null }) {
  const where = String(rawWhere).slice(0, 120);
  const msg = scrub(message, host).slice(0, 300);
  const fp = await fingerprint(`${where}\n${msg.replace(/\d+/g, '#')}`);
  // 이슈가 있는 줄을 먼저 본다. GitHub 연결 전에 난 오류(이슈 없음)는 연결된 뒤 처음 다시 날 때 이슈를 만든다.
  // detail은 JSON.stringify 글이라 LIKE로 찾는다(json_extract는 다른 기능이 남긴 JSON 아닌 줄에서 멈출 수 있어서).
  const seen = await env.DB.prepare(
    `SELECT detail FROM log WHERE action = 'error_report' AND detail LIKE ?
      ORDER BY detail LIKE '%"issue":null%', id DESC LIMIT 1`,
  )
    .bind(`%"fp":"${fp}"%`)
    .first();
  const seenIssue = seen ? issueOf(seen.detail) : null;
  if (seen && (seenIssue !== null || !githubReady(env))) return { issue: seenIssue, duplicate: true };
  if ((await countToday(env, 'error_report')) >= ERROR_ISSUES_PER_DAY) return { issue: null, duplicate: false, capped: true };

  const lines = scrub(stack, host).split('\n');
  if (lines[0].trim() === msg.trim()) lines.shift(); // 서버 오류의 stack은 첫 줄이 메시지 그대로
  const issue = await createIssue(env, {
    title: `[오류] ${where}: ${firstLine(msg).slice(0, 70)}`,
    body: [
      '```',
      msg,
      ...lines.slice(0, 12),
      '```',
      '',
      `- 어디서: ${where}`,
      `- 처음 난 시각: ${kstIso()}`,
      `- 기기: ${dev}`,
      `- 사용자: ${userId ? `#${userId}` : '로그인 전'}`,
      `- 같은 오류 열쇠: ${fp}`,
      '',
      '(Tachyon 오류 자동 보고. 같은 오류는 이슈를 다시 만들지 않는다)',
    ].join('\n'),
    labels: ['오류', '자동'],
  });
  await logStatement(env, userId, 'error_report', { fp, where, issue: issue ? issue.number : null }).run();
  return { issue: issue ? issue.number : null, duplicate: false };
}

// ── GitHub ───────────────────────────────────────────────────────

function githubReady(env) {
  return Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO);
}

function issueOf(detail) {
  try {
    const n = JSON.parse(detail).issue;
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

/** 이슈를 만든다. 토큰이 없거나 실패하면 null(의견은 log에 남아 있음). 라벨이 없으면 GitHub이 만든다. */
export async function createIssue(env, { title, body, labels }) {
  if (!githubReady(env)) return null;
  const post = (payload) =>
    fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        'user-agent': 'Tachyon-feedback',
      },
      body: JSON.stringify(payload),
    });
  try {
    let res = await post({ title, body, labels });
    if (res.status === 422) res = await post({ title, body }); // 라벨 문제면 라벨 없이 한 번 더
    if (!res.ok) {
      console.error('GitHub 이슈 만들기 실패', res.status);
      return null;
    }
    const data = await res.json();
    return { number: data.number, html_url: data.html_url };
  } catch (err) {
    console.error('GitHub 연결 실패', err && err.message);
    return null;
  }
}

// ── 도우미 ───────────────────────────────────────────────────────

/**
 * 공개될 글에서 개인 정보로 보이는 것을 지운다: 이메일, 주소(URL), 전화번호, 학번·긴 숫자, 토큰 모양 글자.
 * keepHost(이 앱의 주소)의 URL은 경로만 남긴다(오류가 난 파일·줄을 알아야 해서). 묻는 글(?…)은 버린다.
 */
export function scrub(value, keepHost = null) {
  if (value == null) return '';
  return String(value)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[이메일]')
    .replace(/(webcals?|https?):\/\/[^\s)"'<>]+/gi, (url) => {
      try {
        const u = new URL(url.replace(/^webcals?:/i, 'https:'));
        return keepHost && u.host === keepHost ? u.pathname : `[주소 ${u.host}]`;
      } catch {
        return '[주소]';
      }
    })
    .replace(/\b01[016-9][-\s.]?\d{3,4}[-\s.]?\d{4}\b/g, '[전화]')
    .replace(/\b0\d{1,2}[-\s.]\d{3,4}[-\s.]\d{4}\b/g, '[전화]') // 02-123-4567 같은 집·사무실 번호
    .replace(/\b\d{4}-\d{5}\b/g, '[번호]') // 학번 모양 2026-12345
    .replace(/[\w-]{20,}/g, (word) => (count(word, /\d/g) >= 3 && count(word, /[a-z]/gi) >= 3 ? '[토큰]' : word))
    .replace(/\d{8,}/g, '[번호]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim();
}

const count = (text, re) => (text.match(re) || []).length;

function firstLine(text) {
  return String(text).split('\n')[0].trim();
}

const OS_NAMES = [
  [/iPhone|iPad/, '아이폰·아이패드'],
  [/Android/, '안드로이드'],
  [/Mac OS X/, 'Mac'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];
const BROWSERS = [
  [/SamsungBrowser\/(\d+)/, '삼성 인터넷'],
  [/Edg\/(\d+)/, 'Edge'],
  [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/Version\/(\d+)[\d.]* .*Safari/, 'Safari'],
];

/** User-Agent → '안드로이드 · Chrome 131' 같은 짧은 이름 */
export function device(request) {
  const ua = (request && request.headers.get('user-agent')) || '';
  const os = (OS_NAMES.find(([re]) => re.test(ua)) || [null, '?'])[1];
  let browser = '?';
  for (const [re, name] of BROWSERS) {
    const m = re.exec(ua);
    if (m) {
      browser = `${name} ${m[1]}`;
      break;
    }
  }
  return `${os} · ${browser}`;
}

async function countToday(env, action, userId) {
  const since = `${kstDate()}T00:00:00+09:00`;
  const sql = userId == null
    ? 'SELECT count(*) AS n FROM log WHERE action = ? AND at >= ?'
    : 'SELECT count(*) AS n FROM log WHERE action = ? AND at >= ? AND user_id = ?';
  const stmt = env.DB.prepare(sql);
  const row = await (userId == null ? stmt.bind(action, since) : stmt.bind(action, since, userId)).first();
  return row ? row.n : 0;
}

async function fingerprint(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
