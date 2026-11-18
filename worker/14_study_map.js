// 14. 공부방 — 학습 지도 창. AI 앱(Claude · ChatGPT …)이 study_map 도구 결과를 받아 대화 안에 그리는 HTML 한 장(MCP Apps, 2026-01-26 규격).
//
// 그리는 것: 시험 범위 → 자료(주차 순) → 절 → 개념. 개념 색 = 결과(✓ 확인 · △ 애매 · ✗ 빈틈 · ○ 아직 · – 범위 밖), 절 옆 % = 그 절 수준.
// 맨 위 = 진도(확인한 개념 %)와 '다음 문제'. 개념을 누르면 채팅에 "튜터, … 문제 내줘"를 보낸다(ui/message).
// SDK 없이 postMessage(JSON-RPC)로: ui/initialize → ui/notifications/initialized → ui/notifications/tool-result를 받아 그린다.
// ChatGPT 옛 방식(window.openai.toolOutput)도 받는다. 밖의 주소를 하나도 부르지 않는다(CSP 빈 목록).
// 창이 안 뜨는 앱은 같은 결과의 map_text(글 지도)를 보여 준다 — 14_study.js mapText.

export const MAP_URI = 'ui://tachyon/study-map.html';

export const MAP_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tachyon 학습 지도</title>
<style>
:root {
  --bg: #ffffff; --panel: #f6f7f9; --line: #e3e6eb; --text: #1b1f24; --muted: #69707a;
  --ok: #2e9d68; --part: #d8961b; --wrong: #d64545; --none: #c9ced6; --out: #e9ecf0; --accent: #3b5bdb; --on-accent: #ffffff;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #17191d; --panel: #20232a; --line: #30343c; --text: #e8eaee; --muted: #9aa1ac;
    --ok: #3fbf83; --part: #e8aa35; --wrong: #ef6b6b; --none: #4a505b; --out: #2a2e35; --accent: #7c95ff; --on-accent: #0d1330;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #17191d; --panel: #20232a; --line: #30343c; --text: #e8eaee; --muted: #9aa1ac;
  --ok: #3fbf83; --part: #e8aa35; --wrong: #ef6b6b; --none: #4a505b; --out: #2a2e35; --accent: #7c95ff; --on-accent: #0d1330;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
body { padding: 16px; }
button { font: inherit; color: inherit; }
.empty { color: var(--muted); padding: 24px 0; text-align: center; }
.head { display: flex; gap: 16px; align-items: center; }
.head .t { flex: 1; min-width: 0; }
h1 { margin: 0; font-size: 17px; font-weight: 700; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); color: var(--muted); }
.chip.d { color: var(--text); font-weight: 600; }
.ring { width: 64px; height: 64px; flex: none; position: relative; }
.ring b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 15px; }
.bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--none); margin: 14px 0 6px; }
.bar i { display: block; height: 100%; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--muted); }
.legend span::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; background: var(--c); vertical-align: -1px; }
.next { margin: 14px 0 4px; padding: 10px 12px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line); display: flex; gap: 10px; align-items: center; }
.next .w { flex: 1; min-width: 0; }
.next small { display: block; color: var(--muted); font-size: 12px; }
.next b { overflow-wrap: anywhere; }
.btn { border: 0; border-radius: 8px; padding: 7px 12px; background: var(--accent); color: var(--on-accent); cursor: pointer; white-space: nowrap; }
.tabs { display: flex; gap: 4px; margin: 14px 0 8px; }
.tabs button { border: 1px solid var(--line); background: transparent; border-radius: 999px; padding: 3px 10px; font-size: 12px; cursor: pointer; color: var(--muted); }
.tabs button[aria-pressed="true"] { background: var(--text); color: var(--bg); border-color: var(--text); }
.path { list-style: none; margin: 0; padding: 0; }
.file { position: relative; padding: 0 0 14px 30px; }
.file::before { content: ""; position: absolute; left: 10px; top: 22px; bottom: 0; width: 2px; background: var(--line); }
.file:last-child::before { display: none; }
.node { position: absolute; left: 0; top: 2px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; background: var(--panel); border: 2px solid var(--none); color: var(--muted); }
.node.mapped { border-color: var(--accent); color: var(--accent); }
.node.done { background: var(--ok); border-color: var(--ok); color: #fff; }
.node.warn { border-color: var(--wrong); color: var(--wrong); }
.ftitle { font-weight: 650; overflow-wrap: anywhere; }
.fmeta { color: var(--muted); font-size: 12px; }
.fmeta .bad { color: var(--wrong); }
.secs { margin-top: 6px; display: grid; gap: 2px; }
.sec { border-radius: 8px; }
.sec > button { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto 44px; gap: 8px; align-items: center; text-align: left; border: 0; background: transparent; padding: 5px 6px; border-radius: 8px; cursor: pointer; }
.sec > button:hover { background: var(--panel); }
.sec .st { overflow-wrap: anywhere; }
.sec.out .st { color: var(--muted); text-decoration: line-through; }
.dots { display: flex; flex-wrap: wrap; gap: 3px; justify-content: flex-end; max-width: 160px; }
.dot { width: 9px; height: 9px; border-radius: 2px; background: var(--none); }
.ok { --c: var(--ok); } .part { --c: var(--part); } .wrong { --c: var(--wrong); } .none { --c: var(--none); } .out { --c: var(--out); }
.dot.ok, .dot.part, .dot.wrong, .dot.out { background: var(--c); }
.lv { font-size: 12px; color: var(--muted); text-align: right; }
.cons { display: none; padding: 2px 6px 8px; }
.sec.open .cons { display: flex; flex-wrap: wrap; gap: 6px; }
.con { display: inline-flex; gap: 6px; align-items: baseline; border: 1px solid var(--line); border-left: 4px solid var(--c); background: var(--bg); border-radius: 6px; padding: 3px 8px; cursor: pointer; text-align: left; max-width: 100%; }
.con:hover { background: var(--panel); }
.con span { overflow-wrap: anywhere; }
.con small { color: var(--muted); font-size: 11px; white-space: nowrap; }
.con.out span { text-decoration: line-through; color: var(--muted); }
.rest { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 10px; color: var(--muted); font-size: 12px; }
.rest p { margin: 4px 0; overflow-wrap: anywhere; }
.rest b { color: var(--text); font-weight: 600; }
.sent { position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%); background: var(--text); color: var(--bg); padding: 6px 12px; border-radius: 8px; font-size: 12px; opacity: 0; transition: opacity .2s; pointer-events: none; }
.sent.on { opacity: 1; }
</style>
</head>
<body>
<div id="app"><p class="empty">학습 지도를 불러오는 중…</p></div>
<div class="sent" id="sent">채팅에 보냈어요</div>
<script>
(function () {
  var app = document.getElementById('app');
  var data = null;
  var filter = 'all';
  var open = {};
  var rid = 0;
  var waiting = {};
  var MARK = { ok: '✓', part: '△', wrong: '✗', out: '–' };
  var STATE = { unread: '아직 안 읽음', reading: '읽는 중', unreadable: '못 읽는 형식 — 채팅에 올려 주세요', mapped: '' };

  function post(msg) { if (window.parent !== window) window.parent.postMessage(msg, '*'); }
  function request(method, params) {
    var id = ++rid;
    post({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
    return new Promise(function (ok) { waiting[id] = ok; setTimeout(function () { if (waiting[id]) { delete waiting[id]; ok(null); } }, 4000); });
  }
  function notify(method, params) { post({ jsonrpc: '2.0', method: method, params: params || {} }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function theme(ctx) { if (ctx && (ctx.theme === 'dark' || ctx.theme === 'light')) document.documentElement.setAttribute('data-theme', ctx.theme); }

  function take(result) {
    if (!result) return;
    var d = result.structuredContent || result;
    if ((!d || !d.files) && result.content) {
      for (var i = 0; i < result.content.length; i++) {
        try { var j = JSON.parse(result.content[i].text); if (j && j.files) { d = j; break; } } catch (e) {}
      }
    }
    if (d && d.files) { data = d; draw(); }
  }

  function say(text) {
    if (window.openai && window.openai.sendFollowUpMessage) window.openai.sendFollowUpMessage({ prompt: text });
    else request('ui/message', { role: 'user', content: [{ type: 'text', text: text }] });
    var s = document.getElementById('sent'); s.classList.add('on'); setTimeout(function () { s.classList.remove('on'); }, 1400);
  }

  function ring(p) {
    var r = 26, c = 2 * Math.PI * r, on = c * p / 100;
    return '<div class="ring" aria-label="확인한 개념 ' + p + '%"><svg viewBox="0 0 64 64" width="64" height="64">' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="var(--none)" stroke-width="7"/>' +
      '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="var(--ok)" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + on + ' ' + c + '" transform="rotate(-90 32 32)"/>' +
      '</svg><b>' + p + '%</b></div>';
  }

  function keep(c) {
    if (filter === 'gaps') return c.s === 'wrong' || c.s === 'part';
    if (filter === 'new') return !c.s;
    return true;
  }

  function draw() {
    var d = data, s = d.stats || {};
    var files = d.files || [];
    var inScope = files.filter(function (f) { return f.state !== 'out' && f.state !== 'undecided'; });
    var h = '';
    h += '<div class="head"><div class="t"><h1>' + esc(d.course) + '</h1><div class="chips">';
    h += '<span class="chip d">' + esc(d.exam || '시험 미정') + '</span>';
    if (d.exam_date) h += '<span class="chip">' + esc(d.exam_date.slice(5).replace('-', '.')) + '</span>';
    if (d.d_day) h += '<span class="chip d">' + esc(d.d_day) + '</span>';
    h += '<span class="chip">자료 ' + inScope.length + ' · 개념 ' + (s.concepts || 0) + '</span>';
    if (s.pages_total) h += '<span class="chip">읽은 쪽 ' + s.pages_read + '/' + s.pages_total + '</span>';
    h += '</div></div>' + ring(s.percent || 0) + '</div>';
    var n = s.concepts || 0;
    var pct = function (k) { return n ? (100 * (s[k] || 0) / n) : 0; };
    h += '<div class="bar" role="img" aria-label="확인 ' + (s.ok || 0) + ', 애매 ' + (s.part || 0) + ', 빈틈 ' + (s.wrong || 0) + ', 아직 ' + (s.unseen || 0) + '">' +
      '<i style="width:' + pct('ok') + '%;background:var(--ok)"></i><i style="width:' + pct('part') + '%;background:var(--part)"></i><i style="width:' + pct('wrong') + '%;background:var(--wrong)"></i></div>';
    h += '<div class="legend"><span class="ok">확인 ' + (s.ok || 0) + '</span><span class="part">애매 ' + (s.part || 0) + '</span><span class="wrong">빈틈 ' + (s.wrong || 0) + '</span><span class="none">아직 ' + (s.unseen || 0) + '</span></div>';

    if (d.next) {
      var why = { diagnose: '진단', gap: '빈틈 다시', new: '새 개념' }[d.next.why] || '다음';
      h += '<div class="next"><div class="w"><small>다음 문제 · ' + why + '</small><b>' + esc(d.next.name) + '</b><small>' + esc(d.next.file_title) + ' · p.' + esc(d.next.pages) + '</small></div>' +
        '<button class="btn" data-ask="' + esc(d.next.id) + '">문제 받기</button></div>';
    } else if (d.phase === 'done') {
      h += '<div class="next"><div class="w"><b>범위 안 개념을 모두 확인했어요</b><small>오답 노트로 마지막 복습</small></div></div>';
    }

    h += '<div class="tabs" role="group" aria-label="보기">' +
      ['all:전체', 'gaps:빈틈', 'new:안 본 것'].map(function (t) { var k = t.split(':'); return '<button data-f="' + k[0] + '" aria-pressed="' + (filter === k[0]) + '">' + k[1] + '</button>'; }).join('') + '</div>';

    h += '<ol class="path">';
    inScope.forEach(function (f) {
      var cs = [];
      f.sections.forEach(function (sec) { sec.concepts.forEach(function (c) { if (c.s !== 'out') cs.push(c); }); });
      var allOk = cs.length && cs.every(function (c) { return c.s === 'ok'; });
      var anyBad = cs.some(function (c) { return c.s === 'wrong'; });
      var cls = f.state === 'mapped' ? (allOk ? 'done' : anyBad ? 'warn' : 'mapped') : f.state === 'unreadable' ? 'warn' : '';
      var meta = [];
      if (f.module) meta.push(esc(f.module));
      if (f.pages) meta.push(f.pages + '쪽');
      if (f.state !== 'mapped') {
        var got = 0; String(f.read || '').split(',').forEach(function (p) { var m = /^(\\d+)(?:-(\\d+))?$/.exec(p); if (m) got += (m[2] ? +m[2] : +m[1]) - +m[1] + 1; });
        meta.push('<span class="' + (f.state === 'unreadable' ? 'bad' : '') + '">' + STATE[f.state] + (f.state === 'reading' && f.pages ? ' ' + got + '/' + f.pages + '쪽' : '') + '</span>');
      } else if (cs.length) {
        meta.push(cs.filter(function (c) { return c.s === 'ok'; }).length + '/' + cs.length + ' 확인');
      }
      var secs = f.sections.map(function (sec) {
        var shown = sec.concepts.filter(keep);
        if (filter !== 'all' && !shown.length) return '';
        var dots = sec.concepts.map(function (c) { return '<i class="dot ' + (c.s || 'none') + '" title="' + esc(c.name) + '"></i>'; }).join('');
        var cons = shown.map(function (c) {
          return '<button class="con ' + (c.s || 'none') + '" data-ask="' + esc(c.id) + '"' + (c.s === 'out' ? ' disabled' : '') + '><span>' + (MARK[c.s] || '○') + ' ' + esc(c.name) + '</span><small>p.' + esc(c.pages) + (c.n ? ' · ' + c.n + '번' : '') + '</small></button>';
        }).join('');
        var isOpen = open[sec.id] || (filter !== 'all');
        return '<div class="sec' + (sec.out ? ' out' : '') + (isOpen ? ' open' : '') + '"><button data-sec="' + esc(sec.id) + '" aria-expanded="' + !!isOpen + '">' +
          '<span class="st">' + esc(sec.title) + '</span><span class="dots">' + dots + '</span><span class="lv">' + (sec.out ? '범위 밖' : sec.done || '') + '</span></button>' +
          '<div class="cons">' + cons + '</div></div>';
      }).join('');
      if (filter !== 'all' && !secs) return;
      h += '<li class="file"><span class="node ' + cls + '">' + f.n + '</span><div class="ftitle">' + esc(f.title) + '</div><div class="fmeta">' + meta.join(' · ') + '</div>' +
        (secs ? '<div class="secs">' + secs + '</div>' : '') + '</li>';
    });
    h += '</ol>';
    if (!inScope.length) h += '<p class="empty">아직 시험 범위를 정하지 않았어요. 튜터에게 시험과 범위를 말해 주세요.</p>';

    var und = files.filter(function (f) { return f.state === 'undecided'; });
    var out = files.filter(function (f) { return f.state === 'out'; });
    var wrong = d.wrong_open || [];
    if (und.length || out.length || wrong.length) {
      h += '<div class="rest">';
      if (und.length) h += '<p><b>범위 미정 ' + und.length + '</b> · ' + und.map(function (f) { return f.n + '. ' + esc(f.title); }).join(', ') + '</p>';
      if (out.length) h += '<p><b>범위 밖 ' + out.length + '</b> · ' + out.map(function (f) { return f.n + '. ' + esc(f.title); }).join(', ') + '</p>';
      if (wrong.length) h += '<p><b>오답 노트 ' + wrong.length + '</b> · ' + wrong.map(function (w) { return esc(w.name); }).join(', ') + '</p>';
      h += '</div>';
    }
    app.innerHTML = h;
    resize();
  }

  function find(id) {
    var out = null;
    (data.files || []).forEach(function (f) { f.sections.forEach(function (s) { s.concepts.forEach(function (c) { if (c.id === id) out = { c: c, f: f }; }); }); });
    return out;
  }

  app.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.f) { filter = b.dataset.f; draw(); return; }
    if (b.dataset.sec) { open[b.dataset.sec] = !open[b.dataset.sec]; draw(); return; }
    if (b.dataset.ask) {
      var hit = find(b.dataset.ask);
      if (hit) say('튜터, ' + data.course + ' 공부방에서 "' + hit.c.name + '"(' + hit.f.title + ' p.' + hit.c.pages + ', id ' + hit.c.id + ') 문제 하나 내줘');
    }
  });

  var lastH = 0;
  function resize() {
    var h = Math.ceil(document.body.getBoundingClientRect().height); // scrollHeight는 창 높이 밑으로 안 줄어 거르기 뒤에 빈 곳이 남는다
    if (h !== lastH) { lastH = h; notify('ui/notifications/size-changed', { height: h }); }
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(document.body);

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.jsonrpc !== '2.0') return;
    if (m.id != null && !m.method && waiting[m.id]) { var ok = waiting[m.id]; delete waiting[m.id]; ok(m.result || null); return; }
    if (m.method === 'ui/notifications/tool-result') take(m.params);
    else if (m.method === 'ui/notifications/host-context-changed') theme(m.params);
    else if (m.id != null && m.method) post({ jsonrpc: '2.0', id: m.id, result: {} }); // 창을 닫는 요청 등에는 '알았어'만
  });

  if (window.openai) {
    theme({ theme: window.openai.theme });
    if (window.openai.toolOutput) take(window.openai.toolOutput);
    window.addEventListener('openai:set_globals', function () { if (window.openai.toolOutput) take(window.openai.toolOutput); theme({ theme: window.openai.theme }); });
  }
  request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'tachyon-study-map', version: '1.0.0' }, appCapabilities: {} }).then(function (r) {
    if (r) theme(r.hostContext);
    notify('ui/notifications/initialized');
  });
})();
</script>
</body>
</html>`;
