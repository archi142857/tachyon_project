// 할 일 위젯의 목록 공장. 저장된 목록(WidgetStore)만 읽는다 — 네트워크는 WidgetRefresh가 한다.
//
// 한 줄 = 제목 · 마감 말('오늘 18:00' · '내일 09:00' · '3일 남음' · '지남', 마감 없으면 비움) · 끝내기 동그라미.
// 동그라미 fill-in에는 task_id를 싣고(→ 끝내기), 줄 나머지는 빈 fill-in(→ 앱 열기). 받는 곳은 WidgetTapActivity.
package com.tachyonproject.app.widget

import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.tachyonproject.app.R
import org.json.JSONArray

class TasksWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsService.RemoteViewsFactory = Rows(applicationContext)

    private class Rows(private val c: Context) : RemoteViewsService.RemoteViewsFactory {
        private var tasks = JSONArray()
        private var now = 0L

        override fun onCreate() {}

        override fun onDataSetChanged() {
            tasks = WidgetStore.list(c, WidgetStore.TASKS)
            now = System.currentTimeMillis()
        }

        override fun onDestroy() {}

        override fun getCount(): Int = tasks.length()

        override fun getViewAt(position: Int): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.widget_row_task)
            val t = tasks.optJSONObject(position) ?: return v
            v.setTextViewText(R.id.widget_row_title, t.optString("title"))
            val due = dueLabel(t.str("due"))
            v.setTextViewText(R.id.widget_row_meta, due)
            v.setViewVisibility(R.id.widget_row_meta, if (due.isEmpty()) View.GONE else View.VISIBLE)
            v.setOnClickFillInIntent(R.id.widget_row, Intent())
            v.setOnClickFillInIntent(R.id.widget_row_check, Intent().putExtra(TasksWidget.EXTRA_TASK_ID, t.optLong("id")))
            return v
        }

        override fun getLoadingView(): RemoteViews? = null

        override fun getViewTypeCount(): Int = 1

        override fun getItemId(position: Int): Long = tasks.optJSONObject(position)?.optLong("id") ?: position.toLong()

        override fun hasStableIds(): Boolean = true

        /** 마감 글자('2026-11-15' 또는 '2026-11-15T18:00:00+09:00') → 짧은 말 */
        private fun dueLabel(due: String?): String {
            if (due.isNullOrEmpty()) return ""
            val timed = due.length > 10
            // 며칠 뒤인지: 한국은 서머타임이 없어 두 0시의 차가 하루의 딱 배수다
            val days = (kstMillis(due.take(10)) - kstMillis(kstDate())) / DAY_MS
            val past = if (timed) kstMillis(due) < now else days < 0
            if (past) return c.getString(R.string.widget_due_past)
            val time = if (timed) " " + clock(due) else ""
            return when (days) {
                0L -> c.getString(R.string.widget_due_today) + time
                1L -> c.getString(R.string.widget_due_tomorrow) + time
                else -> c.getString(R.string.widget_due_days, days)
            }
        }
    }
}
