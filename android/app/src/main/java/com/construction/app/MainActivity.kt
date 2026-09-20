package com.construction.app

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        webView = WebView(this)
        setContentView(webView)

        // Печать: window.print() из веб-кода → системный диалог Android
        // (там можно выбрать принтер или «Сохранить как PDF»)
        webView.webViewClient = object : WebViewClient() {
            @Deprecated("Deprecated in Java")
            override fun onPrepareForPrint(
                view: WebView,
                printHelperAdapter: WebViewClient.PrintHelperAdapter
            ) {
                val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                val jobInfo = printHelperAdapter.printJobAdapter?.onLayout(0)
                if (jobInfo != null) {
                    printManager.print(jobInfo.name, printHelperAdapter.printJobAdapter, jobInfo)
                }
            }
        }
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

        // Enable debugging for WebView (visible in chrome://inspect)
        WebView.setWebContentsDebuggingEnabled(true)

        // Load local app
        webView.loadUrl("file:///android_asset/www/index.html")
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
