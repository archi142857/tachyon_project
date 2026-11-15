// 화면(웹) → 위젯 다리. 화면이 할 일·일정을 바꾼 뒤 window.Capacitor.Plugins.TachyonWidget.refresh()를 부른다(web/src/native.js).
//
// refresh: 쿠키를 디스크에 쓰고(앱이 꺼져도 위젯이 로그인 쿠키를 읽게) → 두 위젯을 백그라운드로 새로 받기 → 바로 resolve.
// 등록은 MainActivity.onCreate에서 super 전에 registerPlugin.
package com.tachyonproject.app.widget

import android.webkit.CookieManager
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "TachyonWidget")
class WidgetPlugin : Plugin() {
    @PluginMethod
    fun refresh(call: PluginCall) {
        CookieManager.getInstance().flush()
        WidgetRefresh.start(context)
        call.resolve()
    }
}
