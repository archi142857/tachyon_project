// 위젯이 마지막으로 받은 목록을 저장해 두는 곳(SharedPreferences "tachyon_widget").
//
// 종류(kind)마다 세 칸: 목록 JSON · 받은 시각 · 상태(ok / login / offline).
// 받기는 WidgetRefresh가, 읽기는 목록 공장(…WidgetService)과 위젯 머리가 한다. 읽기는 빨라서 어디서 불러도 된다.
package com.tachyonproject.app.widget

import android.content.Context
import org.json.JSONArray

object WidgetStore {
    const val TASKS = "tasks"
    const val EVENTS = "events"

    const val OK = "ok"
    const val LOGIN = "login" // 로그인 안 됨 → 목록도 비운다(로그아웃 뒤 남의 눈에 안 보이게)
    const val OFFLINE = "offline" // 못 받음 → 마지막 목록을 그대로 둔다

    private fun prefs(c: Context) = c.getSharedPreferences("tachyon_widget", Context.MODE_PRIVATE)

    /** 새로 받은 목록 저장(상태 ok, 받은 시각 = 지금) */
    fun save(c: Context, kind: String, list: JSONArray) {
        prefs(c).edit()
            .putString(kind, list.toString())
            .putLong("${kind}_at", System.currentTimeMillis())
            .putString("${kind}_status", OK)
            .apply()
    }

    /** 받기 실패 상태만 남긴다. login이면 목록을 비운다 */
    fun setStatus(c: Context, kind: String, status: String) {
        val edit = prefs(c).edit().putString("${kind}_status", status)
        if (status == LOGIN) edit.putString(kind, "[]")
        edit.apply()
    }

    /** 목록만 바꾼다(체크한 할 일을 바로 빼거나 되돌릴 때). 받은 시각은 그대로 */
    fun setList(c: Context, kind: String, list: JSONArray) {
        prefs(c).edit().putString(kind, list.toString()).apply()
    }

    fun list(c: Context, kind: String): JSONArray =
        try {
            JSONArray(prefs(c).getString(kind, null) ?: "[]")
        } catch (e: Exception) {
            JSONArray()
        }

    /** 아직 한 번도 안 받았으면 "" */
    fun status(c: Context, kind: String): String = prefs(c).getString("${kind}_status", "") ?: ""

    fun savedAt(c: Context, kind: String): Long = prefs(c).getLong("${kind}_at", 0L)
}
