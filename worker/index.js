// Tachyon Project 서버 입구. web/에 없는 주소만 여기로 온다.
// 기능은 번호 붙은 파일(1_login.js, 2_collect_ics.js …)에 두고 여기서는 주소만 나눈다.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      const row = await env.DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").first();
      return Response.json({ ok: true, tables: row.n });
    }

    return new Response("없는 주소", { status: 404 });
  },
};
