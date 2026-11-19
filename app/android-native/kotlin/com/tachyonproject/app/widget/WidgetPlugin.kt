// 화면(웹) → 위젯 다리. 화면이 할 일·일정을 바꾼 뒤 window.Capacitor.Plugins.TachyonWidget.refresh()를 부른다(web/src/native.js).
//
// refresh: 쿠키를 디스크에 쓰고(앱이 꺼져도 위젯이 로그인 쿠키를 읽게) → 두 위젯을 백그라운드로 새로 받기 → 바로 resolve.
// download(11-19 강의자료 과목 폴더 저장, web/src/saveFiles.js): { api: '/api/etl/files/12', to: 'Tachyon 강의자료/<과목>/<파일>' }
//   → 안드로이드 내려받기 관리자가 로그인 쿠키를 붙여 Tachyon 서버에서 받아 Download/<to>에 넣는다(진행은 알림, 파일 앱에서 과목 폴더로 보임).
//   주소는 앱의 서버(TachyonApi.base)에만 — 화면이 다른 곳을 주어도 쿠키가 밖으로 나가지 않게.
// 등록은 MainActivity.onCreate에서 super 전에 registerPlugin.
package com.tachyonproject.app.widget

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
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

    @PluginMethod
    fun download(call: PluginCall) {
        val api = call.getString("api")
        val to = call.getString("to")
        if (api == null || !api.startsWith("/api/") || to.isNullOrBlank() || to.contains("..")) return call.reject("api · to가 틀렸어요")
        val url = TachyonApi.base(context) + api
        val req = DownloadManager.Request(Uri.parse(url))
            .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
            .setTitle(to.substringAfterLast('/'))
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, to)
        (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
        call.resolve()
    }
}
