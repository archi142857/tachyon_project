// 오늘 일정 위젯의 목록 공장. 저장된 목록(WidgetStore)만 읽는다 — 네트워크는 WidgetRefresh가 한다.
//
// 1. 오늘(한국 날짜)과 겹치는 것만 남긴다 — 서버 질의(worker/7_items.js listEvents)와 같은 글자 비교.
//    인터넷이 끊긴 채 날이 바뀌어도 어제 일정이 '오늘'로 보이지 않게.
// 2. 종일 먼저, 그다음 시작 시각 순.
// 3. 한 줄 = '종일' 또는 '10:00–11:15' + '제목 · 장소'. 이미 끝난 일정은 흐린 줄(widget_row_event_past).
package com.tachyonproject.app.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.tachyonproject.app.R
import org.json.JSONObject

class TodayWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsService.RemoteViewsFactory = Rows(applicationContext)

    private class Rows(private val c: Context) : RemoteViewsService.RemoteViewsFactory {
        private var events: List<JSONObject> = emptyList()
        private var now = 0L

        override fun onCreate() {}

        override fun onDataSetChanged() {
            val today = kstDate()
            val tomorrow = kstDate(1)
            now = System.currentTimeMillis()
            val all = WidgetStore.list(c, WidgetStore.EVENTS)
            events = (0 until all.length())
                .mapNotNull { all.optJSONObject(it) }
                .filter { overlaps(it, today, tomorrow) }
                .sortedWith(compareBy<JSONObject>({ it.optString("start").length > 10 }, { it.optString("start") }))
        }

        override fun onDestroy() {}

        override fun getCount(): Int = events.size

        override fun getViewAt(position: Int): RemoteViews {
            val e = events.getOrNull(position) ?: return RemoteViews(c.packageName, R.layout.widget_row_event)
            val start = e.optString("start")
            val end = e.str("end")
            val allDay = start.length <= 10
            // 끝 시각이 없으면 시작 + 1시간(서버·화면과 같은 규칙)
            val endMs = end?.let(::kstMillis) ?: (kstMillis(start) + 3_600_000)
            val ended = !allDay && endMs <= now
            val v = RemoteViews(c.packageName, if (ended) R.layout.widget_row_event_past else R.layout.widget_row_event)

            val endClock = end?.let { clock(it) }.orEmpty()
            val time = when {
                allDay -> c.getString(R.string.widget_all_day)
                endClock.isEmpty() -> clock(start)
                else -> "${clock(start)}–$endClock"
            }
            val title = e.optString("title")
            val place = e.str("place")
            v.setTextViewText(R.id.widget_row_meta, time)
            v.setTextViewText(R.id.widget_row_title, if (place.isNullOrBlank()) title else "$title · $place")
            v.setOnClickFillInIntent(R.id.widget_row, Intent())
            return v
        }

        override fun getLoadingView(): RemoteViews? = null

        override fun getViewTypeCount(): Int = 2 // widget_row_event · widget_row_event_past

        override fun getItemId(position: Int): Long = events.getOrNull(position)?.optLong("id") ?: position.toLong()

        override fun hasStableIds(): Boolean = true

        /** [오늘 0시, 내일 0시)와 겹치나. '2026-11-15' < '2026-11-15T10:00…' 이라 종일·시각이 섞여도 글자 비교로 맞다 */
        private fun overlaps(e: JSONObject, today: String, tomorrow: String): Boolean {
            val start = e.optString("start")
            val end = e.str("end") ?: start
            return start < tomorrow && (end > today || start >= today)
        }
    }
}
