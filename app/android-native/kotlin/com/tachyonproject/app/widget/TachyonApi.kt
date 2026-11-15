// 위젯이 서버(worker/7_items.js)와 말하는 곳: 주소 · 로그인 쿠키 · GET/PATCH, 그리고 서버 시각 글자 읽기.
//
// 주소 = 앱에 들어간 capacitor.config.json의 server.url(화면과 같은 곳).
// 쿠키 = WebView가 로그인 때 받은 tachyon_session(HttpOnly라 화면 JS는 못 읽지만 CookieManager는 읽는다).
// 401이거나 쿠키가 없으면 NotLoggedIn, 그 밖의 실패(인터넷·5xx)는 IOException.
// 쓰기 요청의 Origin 검사(worker/index.js sameOrigin)는 Origin 머리가 없으면 통과라 따로 보내지 않는다.
// 메인 스레드에서 부르지 않는다(WidgetRefresh의 일꾼 스레드에서만).
package com.tachyonproject.app.widget

import android.content.Context
import android.webkit.CookieManager
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

object TachyonApi {
    class NotLoggedIn : Exception()

    private var base: String? = null

    /** 'https://tachyon….workers.dev' (끝 / 없이) */
    fun base(c: Context): String = base ?: c.assets.open("capacitor.config.json").bufferedReader().use {
        JSONObject(it.readText()).getJSONObject("server").getString("url").trimEnd('/')
    }.also { base = it }

    fun get(c: Context, path: String): JSONObject = request(c, "GET", path, null)

    fun patch(c: Context, path: String, body: JSONObject): JSONObject = request(c, "PATCH", path, body)

    private fun request(c: Context, method: String, path: String, body: JSONObject?): JSONObject {
        val root = base(c)
        val cookie = CookieManager.getInstance().getCookie(root)
        if (cookie == null || !cookie.contains("tachyon_session=")) throw NotLoggedIn()
        val conn = URL(root + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method // 안드로이드 HttpURLConnection은 PATCH도 받는다
            // 짧게: 위젯은 broadcast 시간(goAsync) 안에 끝나야 한다. 늦으면 저장된 목록 + 'HH:MM에 받음'
            conn.connectTimeout = 3000
            conn.readTimeout = 4000
            conn.setRequestProperty("Cookie", cookie)
            conn.setRequestProperty("Accept", "application/json")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            if (code == 401) throw NotLoggedIn()
            if (code !in 200..299) throw IOException("HTTP $code")
            return JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        } finally {
            conn.disconnect()
        }
    }
}

// ── 시각 글자(서버는 늘 한국 시간 '2026-11-13T15:00:00+09:00', 종일은 '2026-11-13') ──

val KST: TimeZone = TimeZone.getTimeZone("Asia/Seoul")
const val DAY_MS = 24L * 60 * 60 * 1000

/** 한국 날짜 'YYYY-MM-DD'. plusDays = 오늘에서 며칠 뒤 */
fun kstDate(plusDays: Int = 0): String {
    val cal = Calendar.getInstance(KST)
    cal.add(Calendar.DAY_OF_MONTH, plusDays)
    return String.format(Locale.US, "%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH))
}

/** 서버 시각 글자 → 밀리초. 날짜만이면 그날 0시(한국). 글자가 이상해도 죽지 않는다 */
fun kstMillis(iso: String): Long {
    fun part(from: Int, to: Int) = if (iso.length >= to) iso.substring(from, to).toIntOrNull() ?: 0 else 0
    val cal = Calendar.getInstance(KST)
    cal.clear()
    cal.set(part(0, 4), part(5, 7) - 1, part(8, 10), part(11, 13), part(14, 16))
    return cal.timeInMillis
}

/** 시각 글자의 'HH:MM'(종일이면 빈 글자) */
fun clock(iso: String): String = if (iso.length >= 16) iso.substring(11, 16) else ""

/** 밀리초 → 한국 시각 'HH:MM' */
fun kstClock(millis: Long): String {
    val cal = Calendar.getInstance(KST)
    cal.timeInMillis = millis
    return String.format(Locale.US, "%02d:%02d", cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE))
}

/** JSON 칸 글자. 없거나 null이면 null(optString은 null을 "null"로 준다) */
fun JSONObject.str(key: String): String? = if (isNull(key)) null else optString(key)
