// 오늘 일정 위젯(홈 화면). 머리 "오늘 11월 15일 (일)" + 새로고침, 목록 = 오늘(한국 날짜) 일정.
//
// onUpdate(30분마다·처음 놓을 때): 저장된 것으로 바로 그리고 → goAsync + 일꾼 스레드로 새로 받기.
// 새로고침 단추 → 이 receiver로 broadcast → 다시 받기. 줄·머리를 누르면 앱 열기.
// 목록 한 줄은 TodayWidgetService가 만든다.
package com.tachyonproject.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import com.tachyonproject.app.R
import java.util.Calendar

class TodayWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        draw(context, appWidgetManager, appWidgetIds)
        val pending = goAsync()
        WidgetRefresh.start(context, arrayOf(WidgetStore.EVENTS)) { pending.finish() }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent) // APPWIDGET_UPDATE 등은 여기서 onUpdate로 간다
        if (intent.action == WidgetRefresh.ACTION_REFRESH) {
            val pending = goAsync()
            WidgetRefresh.start(context, arrayOf(WidgetStore.EVENTS)) { pending.finish() }
        }
    }

    companion object {
        fun draw(c: Context, m: AppWidgetManager, ids: IntArray) {
            val cal = Calendar.getInstance(KST)
            val weekday = c.getString(R.string.widget_weekdays)[cal.get(Calendar.DAY_OF_WEEK) - 1] // 일요일 = 1
            val title = c.getString(R.string.widget_today_title, cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH), weekday.toString())
            // 줄을 누르면 앱 열기: fill-in을 받는 틀이라 mutable(대상은 MainActivity로 정해 둠)
            val template = PendingIntent.getActivity(
                c, 1, WidgetRefresh.openAppIntent(c), WidgetRefresh.MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            for (id in ids) {
                val v = WidgetRefresh.card(
                    c, id, R.layout.widget_today, title,
                    WidgetStore.EVENTS, R.string.widget_today_empty, TodayWidgetService::class.java, TodayWidget::class.java,
                )
                v.setPendingIntentTemplate(R.id.widget_list, template)
                m.updateAppWidget(id, v)
            }
        }
    }
}
