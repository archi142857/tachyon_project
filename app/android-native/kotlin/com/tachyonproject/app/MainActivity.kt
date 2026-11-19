// 앱 첫 화면. Capacitor가 WebView로 배포 사이트를 띄운다(app/capacitor.config.json).
//
// 1. super.onCreate 전에 위젯 다리 플러그인(TachyonWidget)과 eTL 원터치 창(TachyonEtl, EtlPlugin.kt)을 등록한다 → 화면에서 부를 수 있다.
// 2. 앱을 떠날 때(onPause) 쿠키를 디스크에 쓰고 위젯을 새로 받는다 → 로그인·로그아웃 직후에도 위젯이 맞게 바뀐다.
package com.tachyonproject.app

import android.os.Bundle
import android.webkit.CookieManager
import com.getcapacitor.BridgeActivity
import com.tachyonproject.app.widget.WidgetPlugin
import com.tachyonproject.app.widget.WidgetRefresh

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(WidgetPlugin::class.java)
        registerPlugin(EtlPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
        WidgetRefresh.start(this)
    }
}
