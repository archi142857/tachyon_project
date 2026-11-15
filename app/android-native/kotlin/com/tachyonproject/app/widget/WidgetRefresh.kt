// 위젯 새로 받기 → 저장 → 다시 그리기. 두 위젯이 같이 쓰는 겉모양(card)도 여기서 만든다.
//
// 흐름: start/check → 일꾼 스레드 하나(차례대로, 메인 스레드 아님)
//         → TachyonApi로 받기 → WidgetStore에 저장(실패면 상태만: login / offline)
//         → redraw: 두 위젯 머리를 다시 그리고 notifyAppWidgetViewDataChanged → 목록 공장이 저장된 것을 다시 읽음.
// 할 일 체크: 저장된 목록에서 바로 빼서 그리고 → PATCH { done: true } → 실패하면 되돌림 → 다시 받기.
package com.tachyonproject.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import com.tachyonproject.app.MainActivity
import com.tachyonproject.app.R
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

object WidgetRefresh {
    const val ACTION_REFRESH = "com.tachyonproject.app.widget.REFRESH"

    /** 목록 줄 누름 틀(fill-in을 받아야 해서 mutable). 31 아래는 원래 mutable이라 0 */
    val MUTABLE = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0

    // 받기·체크를 한 줄로 세운다(체크 직후 옛 목록이 덮어쓰지 않게)
    private val worker = Executors.newSingleThreadExecutor()

    // 줄에서 받기를 기다리는 종류. 같은 종류가 이미 기다리면 새 요청은 그 받기에 합친다(goAsync를 줄 뒤에 오래 잡지 않게)
    private val waiting = mutableSetOf<String>()

    /** kinds를 새로 받아 저장하고 두 위젯을 다시 그린다. done = 끝나면 부름(goAsync의 finish) */
    fun start(
        context: Context,
        kinds: Array<String> = arrayOf(WidgetStore.TASKS, WidgetStore.EVENTS),
        done: (() -> Unit)? = null,
    ) {
        val c = context.applicationContext
        val fresh = synchronized(waiting) { kinds.filter { waiting.add(it) } }
        if (fresh.isEmpty()) {
            done?.invoke() // 모두 이미 줄에 있음 → 그 받기가 다시 그린다
            return
        }
        worker.execute {
            try {
                fresh.forEach {
                    // 받기 시작하면 줄에서 뺀다: 그 뒤에 온 요청(화면이 방금 바꿈)은 새로 받는다
                    synchronized(waiting) { waiting.remove(it) }
                    fetch(c, it)
                }
                redraw(c)
            } finally {
                done?.invoke()
            }
        }
    }

    /** 할 일 하나 끝내기(WidgetTapActivity가 부름) */
    fun check(context: Context, taskId: Long) {
        val c = context.applicationContext
        worker.execute {
            try {
                val before = WidgetStore.list(c, WidgetStore.TASKS)
                WidgetStore.setList(c, WidgetStore.TASKS, without(before, taskId))
                redraw(c)
                try {
                    TachyonApi.patch(c, "/api/tasks/$taskId", JSONObject().put("done", true))
                } catch (e: Exception) {
                    WidgetStore.setList(c, WidgetStore.TASKS, before) // 못 끝냈으면 다시 보이게
                }
                fetch(c, WidgetStore.TASKS)
                redraw(c)
            } catch (e: Exception) {
                // 일꾼 스레드에서 던지면 앱이 죽는다. 다음 받기 때 바로잡힌다
            }
        }
    }

    private fun fetch(c: Context, kind: String) {
        try {
            val list = if (kind == WidgetStore.TASKS) {
                TachyonApi.get(c, "/api/tasks?limit=8").getJSONArray("tasks")
            } else {
                TachyonApi.get(c, "/api/events?from=${kstDate()}&to=${kstDate(1)}").getJSONArray("events")
            }
            WidgetStore.save(c, kind, list)
        } catch (e: TachyonApi.NotLoggedIn) {
            WidgetStore.setStatus(c, kind, WidgetStore.LOGIN)
        } catch (e: Exception) {
            WidgetStore.setStatus(c, kind, WidgetStore.OFFLINE)
        }
    }

    private fun without(list: JSONArray, taskId: Long): JSONArray {
        val out = JSONArray()
        for (i in 0 until list.length()) {
            val t = list.optJSONObject(i) ?: continue
            if (t.optLong("id") != taskId) out.put(t)
        }
        return out
    }

    /** 홈 화면에 놓인 두 위젯을 모두 다시 그린다 */
    fun redraw(c: Context) {
        val m = AppWidgetManager.getInstance(c)
        val tasks = m.getAppWidgetIds(ComponentName(c, TasksWidget::class.java))
        TasksWidget.draw(c, m, tasks)
        m.notifyAppWidgetViewDataChanged(tasks, R.id.widget_list)
        val today = m.getAppWidgetIds(ComponentName(c, TodayWidget::class.java))
        TodayWidget.draw(c, m, today)
        m.notifyAppWidgetViewDataChanged(today, R.id.widget_list)
    }

    /** 두 위젯 공통 겉모양: 머리(제목 · 'HH:MM에 받음' · 새로고침) + 목록(비면 안내 글). 줄 누름 틀은 각 위젯이 붙인다 */
    @Suppress("DEPRECATION") // setRemoteAdapter(Intent): 31 아래(minSdk 24)도 돌아야 해서 이것을 쓴다
    fun card(
        c: Context,
        widgetId: Int,
        layout: Int,
        title: String,
        kind: String,
        emptyText: Int,
        service: Class<*>,
        provider: Class<*>,
    ): RemoteViews {
        val v = RemoteViews(c.packageName, layout)
        v.setTextViewText(R.id.widget_title, title)
        val line = statusLine(c, kind)
        v.setTextViewText(R.id.widget_status, line)
        v.setViewVisibility(R.id.widget_status, if (line.isEmpty()) View.GONE else View.VISIBLE)
        val loggedOut = WidgetStore.status(c, kind) == WidgetStore.LOGIN
        v.setTextViewText(R.id.widget_empty, c.getString(if (loggedOut) R.string.widget_login else emptyText))

        val adapter = Intent(c, service).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
        adapter.data = Uri.parse(adapter.toUri(Intent.URI_INTENT_SCHEME)) // 위젯마다 다른 공장
        v.setRemoteAdapter(R.id.widget_list, adapter)
        v.setEmptyView(R.id.widget_list, R.id.widget_empty)

        v.setOnClickPendingIntent(R.id.widget_head, openApp(c))
        v.setOnClickPendingIntent(R.id.widget_empty, openApp(c)) // '앱을 열어 로그인해 주세요' 같은 안내 글을 눌러도 앱 열기
        val refresh = Intent(c, provider).setAction(ACTION_REFRESH)
        v.setOnClickPendingIntent(
            R.id.widget_refresh,
            PendingIntent.getBroadcast(c, 0, refresh, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
        )
        return v
    }

    fun openAppIntent(c: Context): Intent = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    private fun openApp(c: Context): PendingIntent =
        PendingIntent.getActivity(c, 0, openAppIntent(c), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    /** 못 받았을 때만 한 줄: 'HH:MM에 받음'(저장된 목록을 보여 주는 중) 또는 '아직 받지 못했어요' */
    private fun statusLine(c: Context, kind: String): String {
        if (WidgetStore.status(c, kind) != WidgetStore.OFFLINE) return ""
        val at = WidgetStore.savedAt(c, kind)
        return if (at > 0) c.getString(R.string.widget_saved_at, kstClock(at)) else c.getString(R.string.widget_offline)
    }
}
