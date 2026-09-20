package com.construction.app

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.JavascriptInterface
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this)
        setContentView(webView)

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.textZoom = 100

        // Мост для печати: JS → window.ConstructionAndroid.print()
        // (window.print() в WebView не вызывает системную печать)
        webView.addJavascriptInterface(PrintBridge(), "ConstructionAndroid")

        // Enable debugging for WebView (visible in chrome://inspect)
        WebView.setWebContentsDebuggingEnabled(true)

        // Load local app
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    /**
     * Печать в APK: системный диалог печати (принтер или «Сохранить как PDF»).
     * createPrintDocumentAdapter (API 19) рендерит контент WebView через
     * стандартный print-пайплайн Chromium — учитывает CSS @media print.
     */
    inner class PrintBridge {
        @JavascriptInterface
        fun print() {
            handler.post {
                try {
                    val adapter = webView.createPrintDocumentAdapter()
                    val attrs = PrintAttributes.Builder().build()
                    val pm = getSystemService(Context.PRINT_SERVICE) as PrintManager
                    pm.print("Construction", adapter, attrs)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
