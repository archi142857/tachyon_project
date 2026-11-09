// Tachyon Project 서버 입구. web/에 없는 주소만 여기로 온다.
// 기능은 번호 붙은 파일(1_login.js, 2_collect_ics.js …)에 두고 여기서는 주소만 나눈다.
//
//   /api/health      → 여기서 바로 (DB 표 수, 아직 안 넣은 비밀값 이름)
//   /api/login*      → 1_login.js            구글 로그인·내 정보·로그아웃
//   /api/feeds*      → 2_collect_ics.js      캘린더(ICS) 주소·수집
//   /api/memo*       → 3_memo_popup.js       메모 → 즉시 팝업
//   /api/briefing*   → 4_night.js            밤 정리·아침 브리핑
//   /api/timetable*  → 5_timetable_photo.js  시간표 사진
//   /api/feedback*   → 6_feedback.js         의견·오류 → GitHub 이슈
//   /api/tasks*, /api/events* → 7_items.js   할 일·일정 읽기·고치기
//   /api/calendar*   → 8_calendar_feed.js    폰 달력에서 구독하는 Tachyon ICS
//
// 번호 파일 약속: `export async function handle(request, env, ctx, user)`
//   user = 로그인한 사람의 users 행(로그인 안 했으면 null). Cron이 필요하면 `export async function scheduled(event, env, ctx)`.
// 번호 파일이 아직 없으면 그 주소는 501로 답하고, 파일을 올리면 여기를 고치지 않아도 바로 연결된다.

import { getUser } from "./lib/auth.js";

export const ROUTES = [
  ["/api/login", "1_login"],
  ["/api/feeds", "2_collect_ics"],
  ["/api/memo", "3_memo_popup"],
  ["/api/briefing", "4_night"],
  ["/api/timetable", "5_timetable_photo"],
  ["/api/feedback", "6_feedback"],
  ["/api/tasks", "7_items"],
  ["/api/events", "7_items"],
  ["/api/calendar", "8_calendar_feed"],
];

// wrangler.toml의 crons와 같아야 한다 (UTC)
export const CRONS = {
  "*/15 * * * *": "2_collect_ics", // 15분마다 ICS 수집
  "30 16 * * *": "4_night", // 한국 01:30 밤 정리
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        const row = await env.DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").first();
        // 아직 안 넣은 비밀값 이름(값은 안 보임). 설정이 끝나면 빈 배열.
        const missing = ["APP_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "ANTHROPIC_API_KEY", "GITHUB_TOKEN"].filter((k) => !env[k]);
        return Response.json({ ok: true, tables: row.n, missing });
      }

      const name = routeFor(url.pathname);
      if (!name) return Response.json({ error: "없는 주소" }, { status: 404 });
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request)) {
        return Response.json({ error: "다른 사이트에서 온 요청은 받지 않는다" }, { status: 403 });
      }
      const mod = await loadModule(name);
      if (!mod || typeof mod.handle !== "function") return Response.json({ error: `${name}.js가 아직 없다` }, { status: 501 });

      let user = null;
      try {
        user = await getUser(request, env);
      } catch (err) {
        console.error("로그인 확인 실패", err && err.message);
      }
      return await mod.handle(request, env, ctx, user);
    } catch (err) {
      console.error("서버 오류", request.method, url.pathname, err && err.stack);
      reportError(env, ctx, err, { request });
      return Response.json({ error: "서버에서 오류가 났다" }, { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    const name = CRONS[event.cron];
    const mod = name && (await loadModule(name));
    if (!mod || typeof mod.scheduled !== "function") {
      console.log(`Cron ${event.cron}: ${name || "모르는 Cron"} — 처리할 파일이 아직 없어 건너뜀`);
      return;
    }
    try {
      await mod.scheduled(event, env, ctx);
    } catch (err) {
      console.error("Cron 오류", event.cron, err && err.stack);
      reportError(env, ctx, err, { where: `cron ${event.cron}` });
      throw err;
    }
  },
};

export function routeFor(pathname) {
  for (const [prefix, name] of ROUTES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return name;
  }
  return null;
}

// 번호마다 따로 적는 이유: 빌드 도구(esbuild)가 `./3_*.js` 모양의 파일만 찾아 묶게 해서,
// 아직 없는 파일이 있어도 빌드가 깨지지 않고 worker/test/의 시험 파일도 섞이지 않게 한다.
const IMPORTERS = {
  1: (rest) => import(`./1_${rest}.js`),
  2: (rest) => import(`./2_${rest}.js`),
  3: (rest) => import(`./3_${rest}.js`),
  4: (rest) => import(`./4_${rest}.js`),
  5: (rest) => import(`./5_${rest}.js`),
  6: (rest) => import(`./6_${rest}.js`),
  7: (rest) => import(`./7_${rest}.js`),
  8: (rest) => import(`./8_${rest}.js`),
};

/** 번호 파일(예: "3_memo_popup")을 불러온다. 아직 없으면 null. */
export async function loadModule(name) {
  const [, num, rest] = /^(\d)_(.+)$/.exec(name) || [];
  if (!IMPORTERS[num]) return null;
  try {
    return await IMPORTERS[num](rest);
  } catch (err) {
    const text = String((err && err.message) || err);
    const missing = (err && err.code === "ERR_MODULE_NOT_FOUND") || /not found|No such module|Cannot find module/i.test(text);
    if (missing && text.includes(name)) return null;
    throw err;
  }
}

/** 쓰기 요청(POST·PUT·DELETE)이 같은 사이트 화면에서 왔는지. Origin 머리글이 없으면(앱 밖 도구·앱) 통과. */
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

// 서버 오류를 6_feedback.js(오류 자동 보고)에 넘긴다. 그 파일이 없거나 실패해도 원래 응답은 그대로.
function reportError(env, ctx, err, info) {
  const job = loadModule("6_feedback")
    .then((feedback) => feedback && typeof feedback.reportServerError === "function" && feedback.reportServerError(env, err, info))
    .catch(() => {});
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
}
