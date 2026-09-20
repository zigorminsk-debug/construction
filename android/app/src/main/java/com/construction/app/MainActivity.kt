package com.construction.app

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.print.PrintRange
import android.print.PdfPrintDocumentAdapter
import android.util.CancellationSignal
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.JavascriptInterface
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import java.io.File

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
        if (Build.VERSION.SDK_INT >= 26) {
            webView.addJavascriptInterface(PrintBridge(), "ConstructionAndroid")
        }

        // Enable debugging for WebView (visible in chrome://inspect)
        WebView.setWebContentsDebuggingEnabled(true)

        // Load local app
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    /**
     * Печать в APK: WebView.raster → PDF (printToPdf) → системный диалог печати
     * (принтер или «Сохранить как PDF»). window.print() в WebView без хука
     * не работает, поэтому JS сам вызывает этот мост.
     */
    inner class PrintBridge {
        @JavascriptInterface
        fun print() {
            if (Build.VERSION.SDK_INT < 26) return
            handler.post { printPdf() }
        }
    }

    private fun printPdf() {
        val out = File(cacheDir, "construction-print.pdf")
        out.delete()
        try {
            val fd = ParcelFileDescriptor.open(
                out,
                ParcelFileDescriptor.MODE_CREATE or
                    ParcelFileDescriptor.MODE_TRUNCATE or
                    ParcelFileDescriptor.MODE_WRITE_ONLY
            )
            webView.printToPdf(
                object : PrintDocumentAdapter() {
                    override fun onLayout(
                        oldDoc: PrintDocumentInfo?,
                        newDoc: PrintDocumentInfo,
                        cancellationSignal: CancellationSignal,
                        callback: PrintDocumentAdapter.LayoutResultCallback,
                        extras: Bundle?
                    ) {
                        callback.onLayoutSucceeded(newDoc)
                        listener.onLayoutFinished(true, newDoc)
                    }

                    override fun onPageRangeChanged(start: Int, end: Int, cancellationSignal: CancellationSignal) {}

                    override fun print(
                        requests: Array<out PrintRange>,
                        destination: PrintDocumentAdapter.PrinterCallback,
                        cancellationSignal: CancellationSignal
                    ) {
                        destination.write(fd.fileDescriptor, 0)
                        fd.close()
                        // PDF пишется асинхронно — дожидаемся стабилизации размера
                        waitForStablePdf(out)
                    }
                },
                object : PrintDocumentAdapter.LayoutResultCallback() {
                    override fun onLayoutSucceeded(
                        defaultPage: PrintDocumentAdapter.PageRange,
                        oldPageScope: PrintDocumentAdapter.PageScope,
                        newPageScope: PrintDocumentAdapter.PageScope
                    ) {}

                    override fun onLayoutFailed(exception: PrintDocumentAdapter.PrintRangeException) {}
                },
                null
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun waitForStablePdf(file: File) {
        var lastSize = -1L
        var stable = 0
        val started = System.currentTimeMillis()
        val runnable = object : Runnable {
            override fun run() {
                val size = file.length()
                stable = if (size > 0 && size == lastSize) stable + 1 else 0
                lastSize = size
                val timeout = System.currentTimeMillis() - started > 8000
                if (stable >= 3 || timeout) {
                    showSystemPrintDialog(file)
                } else {
                    handler.postDelayed(this, 250)
                }
            }
        }
        handler.postDelayed(runnable, 250)
    }

    private fun showSystemPrintDialog(file: File) {
        try {
            val adapter = PdfPrintDocumentAdapter(file, "Construction", 1, object : PdfPrintDocumentAdapter.Callback() {
                override fun onWriteFailure() {}
            })
            val jobInfo = PrintDocumentInfo.Builder("Construction")
                .setPageCount(1)
                .build()
            val pm = getSystemService(Context.PRINT_SERVICE) as PrintManager
            pm.print(jobInfo.name, adapter, jobInfo)
        } catch (e: Exception) {
            e.printStackTrace()
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
