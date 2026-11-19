// eTL 원터치 연결(11-20 사람 "백그라운드로 브라우저를 돌리던지 해서 로그인만 하면 나머진 알아서"):
// 화면이 TachyonEtl.open({ url, script })를 부르면 앱 안 창(전체 화면 WebView)에 eTL을 띄운다.
//   1. 학생이 서울대 로그인 화면에서 직접 로그인한다(비밀번호는 서울대 화면에만 — Tachyon은 보지도 받지도 않음).
//   2. eTL 쪽(https://myetl.snu.ac.kr)이 뜰 때마다 화면이 준 script(web/src/etlToken.js nativeScript)를 그 쪽에서 돌린다
//      → 로그인 전이면 { wait: true }(다음 쪽에서 다시), 끝나면 액세스 토큰 · 캘린더 주소를 TachyonEtl.done(JSON)으로 돌려준다.
//   3. 받은 것을 그대로 resolve하고 창을 닫는다. 화면이 서버에 토큰을 넣는다(PUT /api/etl). ✕ · 뒤로로 닫으면 reject("closed").
// script를 화면이 주므로 eTL 쪽 사정이 바뀌어도 APK를 다시 만들지 않고 사이트만 고치면 된다.
// done()은 지금 쪽이 eTL일 때만 받는다(로그인 중 거치는 다른 사이트가 부르면 무시).
// 등록은 MainActivity.onCreate에서 super 전에 registerPlugin.
package com.tachyonproject.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.graphics.Bitmap
import android.net.Uri
import android.view.Gravity
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

private const val ETL_HOST = "myetl.snu.ac.kr"

@CapacitorPlugin(name = "TachyonEtl")
class EtlPlugin : Plugin() {
    @PluginMethod
    fun open(call: PluginCall) {
        val script = call.getString("script") ?: return call.reject("script가 없어요")
        val url = call.getString("url") ?: "https://$ETL_HOST/"
        if (Uri.parse(url).host != ETL_HOST) return call.reject("eTL 주소만 열어요")
        activity.runOnUiThread { EtlWindow(activity, url, script, call).show() }
    }
}

private class EtlWindow(val activity: Activity, val start: String, val script: String, val call: PluginCall) {
    private val dialog = Dialog(activity, android.R.style.Theme_DeviceDefault_Light_NoActionBar)
    private val web = WebView(activity)
    private var finished = false
    private var running = false // 지금 쪽에서 script가 도는 중(쪽이 바뀌면 다시 돌릴 수 있게 풀림)

    @SuppressLint("SetJavaScriptEnabled")
    fun show() {
        val dp = activity.resources.displayMetrics.density
        val title = TextView(activity).apply {
            text = "eTL에 로그인하면 알아서 연결해요"
            textSize = 15f
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        val close = Button(activity).apply {
            text = "닫기"
            setOnClickListener { dialog.dismiss() }
        }
        val bar = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((16 * dp).toInt(), (4 * dp).toInt(), (8 * dp).toInt(), (4 * dp).toInt())
            addView(title)
            addView(close)
        }
        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            fitsSystemWindows = true
            addView(bar)
            addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        }

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true) // 서울대 로그인이 여러 주소를 거친다
        web.addJavascriptInterface(Bridge(), "TachyonEtl")
        web.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                running = false
            }

            override fun onPageFinished(view: WebView, url: String?) {
                val u = Uri.parse(url ?: return)
                if (finished || running || u.scheme != "https" || u.host != ETL_HOST) return
                running = true
                view.evaluateJavascript(script, null)
            }
        }

        dialog.setContentView(root)
        dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        dialog.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP && web.canGoBack()) {
                web.goBack()
                true
            } else {
                false
            }
        }
        dialog.setOnDismissListener {
            if (!finished) {
                finished = true
                call.reject("닫았어요", "closed")
            }
            CookieManager.getInstance().flush()
            web.destroy()
        }
        web.loadUrl(start)
        dialog.show()
    }

    inner class Bridge { // WebView가 부르는 다리라 public
        @JavascriptInterface
        fun done(json: String) {
            activity.runOnUiThread {
                if (finished || Uri.parse(web.url ?: "").host != ETL_HOST) return@runOnUiThread
                val r = try {
                    JSObject(json)
                } catch (e: Exception) {
                    JSObject().apply { put("error", "답을 읽지 못했어요") }
                }
                if (r.optBoolean("wait")) {
                    running = false // 아직 로그인 전 — 다음 쪽에서 다시
                    return@runOnUiThread
                }
                finished = true
                call.resolve(r)
                dialog.dismiss()
            }
        }
    }
}
