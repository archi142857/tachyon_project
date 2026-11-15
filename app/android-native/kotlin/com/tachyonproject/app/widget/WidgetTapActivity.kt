// 할 일 위젯 줄을 누르면 잠깐 뜨는 화면 없는 Activity(manifest에서 Theme.NoDisplay).
// 동그라미를 눌렀으면(task_id 실림) 그 할 일을 끝내고, 줄 나머지를 눌렀으면 앱을 연다. 그리고 바로 닫힌다.
// receiver(TasksWidget)에서 바로 앱을 열면 안드로이드 14부터 막히는 런처가 많아서, 누름을 Activity로 받는다.
package com.tachyonproject.app.widget

import android.app.Activity
import android.os.Bundle

class WidgetTapActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val taskId = intent.getLongExtra(TasksWidget.EXTRA_TASK_ID, 0L)
        if (taskId > 0) {
            WidgetRefresh.check(this, taskId) // 일꾼 스레드에서 끝내기 → 다시 그리기
        } else {
            startActivity(WidgetRefresh.openAppIntent(this))
        }
        finish()
    }
}
