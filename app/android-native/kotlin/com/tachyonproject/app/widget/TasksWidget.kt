// 할 일 위젯(홈 화면). 머리 "할 일" + 새로고침, 목록 = 끝나지 않은 할 일 8개(여유 적은 순), 줄 오른쪽 동그라미 = 끝내기.
//
// onUpdate(30분마다·처음 놓을 때): 저장된 것으로 바로 그리고 → goAsync + 일꾼 스레드로 새로 받기.
// 새로고침 단추 → 이 receiver로 broadcast → 다시 받기.
// 줄 누름은 WidgetTapActivity로 간다(동그라미 = task_id 실림 → 끝내기, 줄 나머지 → 앱 열기).
//   receiver에서 startActivity로 앱을 열면 안드로이드 14부터 막히는 런처가 많아서 Activity를 거친다.
// 목록 한 줄은 TasksWidgetService가 만든다.
package com.tachyonproject.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import com.tachyonproject.app.R

class TasksWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        draw(context, appWidgetManager, appWidgetIds)
        val pending = goAsync()
        WidgetRefresh.start(context, arrayOf(WidgetStore.TASKS)) { pending.finish() }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent) // APPWIDGET_UPDATE 등은 여기서 onUpdate로 간다
        if (intent.action == WidgetRefresh.ACTION_REFRESH) {
            val pending = goAsync()
            WidgetRefresh.start(context, arrayOf(WidgetStore.TASKS)) { pending.finish() }
        }
    }

    companion object {
        const val EXTRA_TASK_ID = "task_id"

        fun draw(c: Context, m: AppWidgetManager, ids: IntArray) {
            // 줄 누름 틀 = WidgetTapActivity. fill-in(task_id)을 받아야 해서 mutable
            val tap = Intent(c, WidgetTapActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val template = PendingIntent.getActivity(c, 2, tap, WidgetRefresh.MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            for (id in ids) {
                val v = WidgetRefresh.card(
                    c, id, R.layout.widget_tasks, c.getString(R.string.widget_tasks_title),
                    WidgetStore.TASKS, R.string.widget_tasks_empty, TasksWidgetService::class.java, TasksWidget::class.java,
                )
                v.setPendingIntentTemplate(R.id.widget_list, template)
                m.updateAppWidget(id, v)
            }
        }
    }
}
