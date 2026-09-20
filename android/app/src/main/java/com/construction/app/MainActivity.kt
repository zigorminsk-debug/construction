package com.construction.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.Settings
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())

    // ==================== Автообновление через GitHub ====================
    // CI создаёт GitHub Release v1.0.<run_number> на каждый push
    // (APK — в assets релиза). Приложение при старте проверяет
    // /releases/latest: если versionCode больше установленного —
    // диалог «Обновить», скачивание с прогрессом и системная установка.
    companion object {
        const val REPO = "zigorminsk-debug/construction"
        const val API_LATEST = "https://api.github.com/repos/$REPO/releases/latest"
    }

    private var pendingApk: File? = null // скачано, ждёт разрешения «неизвестные источники»
    private var updateOffered = false    // не дёргать пользователем по кругу

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

        // Проверка новой версии — один раз за запуск, после загрузки приложения
        handler.postDelayed({ checkForUpdate() }, 2500)
    }

    override fun onResume() {
        super.onResume()
        // Пользователь вернулся с экрана разрешения установки —
        // докидываем уже скачанный APK системной установке
        val apk = pendingApk
        if (apk != null && apk.exists() && canInstallPackages()) {
            pendingApk = null
            installApk(apk)
        }
    }

    private fun canInstallPackages(): Boolean =
        Build.VERSION.SDK_INT < 30 || packageManager.canRequestPackageInstalls()

    /** Текущая версия приложения (versionCode / versionName из пакетных данных). */
    private fun currentVersion(): Pair<Int, String> {
        @Suppress("DEPRECATION")
        val info = packageManager.getPackageInfo(packageName, 0)
        return (info.versionCode to info.versionName)
    }

    /**
     * Проверка новой версии. force=true — по кнопке «Проверить обновление»
     * в справке (не считаемся с тем, что диалог уже показывали).
     * Результат сообщается в JS: window.__updateCheckResult('latest:N' | 'update:N' | 'error')
     */
    private fun checkForUpdate(force: Boolean = false) {
        if (updateOffered && !force) return
        if (force) updateOffered = false
        Thread {
            try {
                val latest = fetchLatestRelease()
                if (latest == null) {
                    notifyJs("error")
                    return@Thread
                }
                val (curCode, _) = currentVersion()
                if (latest.code > curCode) {
                    updateOffered = true
                    notifyJs("update:${latest.code}")
                    handler.post { showUpdateDialog(latest) }
                } else {
                    notifyJs("latest:${latest.code}")
                }
            } catch (e: Exception) {
                Log.w("UpdateCheck", "Проверка обновления не удалась", e)
                notifyJs("error")
            }
        }.start()
    }

    private fun notifyJs(status: String) {
        handler.post {
            try {
                webView.evaluateJavascript(
                    "window.__updateCheckResult && window.__updateCheckResult('$status')", null
                )
            } catch (_: Exception) { /* WebView ещё не готов */ }
        }
    }

    class RemoteRelease(val code: Int, val name: String, val apkUrl: String)

    /** Свежий релиз GitHub: tag "v1.0.N" → code = N; apkUrl — asset *.apk. */
    private fun fetchLatestRelease(): RemoteRelease? {
        val conn = (URL(API_LATEST).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15000
            readTimeout = 15000
            setRequestProperty("User-Agent", "construction-app")
            setRequestProperty("Accept", "application/vnd.github+json")
        }
        return try {
            if (conn.responseCode != 200) return null
            val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            val code = json.optString("tag_name", "").substringAfterLast('.').toIntOrNull() ?: return null
            val assets = json.optJSONArray("assets") ?: return null
            var apkUrl: String? = null
            for (i in 0 until assets.length()) {
                val a = assets.getJSONObject(i)
                val an = a.optString("name", "")
                // release-APK называется construction-v<версия>.apk; debug пропускаем
                if (!an.endsWith(".apk") || an.contains("debug", ignoreCase = true)) continue
                val dl = a.optString("browser_download_url", "")
                if (dl.isNotEmpty()) { apkUrl = apkUrl ?: dl }
            }
            val url = apkUrl ?: return null
            RemoteRelease(code, json.optString("name", "v1.0.$code"), url)
        } finally {
            conn.disconnect()
        }
    }

    private fun showUpdateDialog(latest: RemoteRelease) {
        val (_, curName) = currentVersion()
        AlertDialog.Builder(this)
            .setTitle("Доступна новая версия")
            .setMessage("Вышла версия 1.0.${latest.code} (у вас $curName).\n\nСкачать и установить обновление?")
            .setPositiveButton("Обновить") { _, _ -> downloadAndInstall(latest.apkUrl) }
            .setNegativeButton("Позже", null)
            .show()
    }

    private fun downloadAndInstall(apkUrl: String) {
        Thread {
            try {
                val dir = File(filesDir, "updates")
                dir.mkdirs()
                val apkFile = File(dir, "update.apk")
                if (apkFile.exists()) apkFile.delete()

                val bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
                    max = 100
                    progress = 0
                }
                var dialog: AlertDialog? = null
                handler.post {
                    dialog = AlertDialog.Builder(this@MainActivity)
                        .setTitle("Скачивание обновления")
                        .setView(bar)
                        .setCancelable(false)
                        .show()
                }

                // 1) размер APK (отдельный запрос, чтобы прогресс-бар был в процентах)
                val total = probeSize(apkUrl)
                // 2) скачивание с прогрессом
                downloadTo(apkFile, apkUrl) { done ->
                    if (total > 0) handler.post { bar.progress = (done * 100 / total).toInt() }
                }

                handler.post {
                    dialog?.dismiss()
                    if (!canInstallPackages()) {
                        // После возврата из настроек onResume сам докинет установку
                        pendingApk = apkFile
                        Toast.makeText(
                            this@MainActivity,
                            "Разрешите установку из неизвестных источников — обновление установится автоматически",
                            Toast.LENGTH_LONG
                        ).show()
                        startActivity(
                            Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.fromParts("package", packageName, null)
                            )
                        )
                    } else {
                        installApk(apkFile)
                    }
                }
            } catch (e: Exception) {
                Log.e("UpdateDownload", "Скачивание обновления не удалось", e)
                handler.post {
                    Toast.makeText(this@MainActivity, "Не удалось скачать обновление. Попробуйте позже.", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    /** Размер файла по URL (из Content-Length); 0 — если не получить. */
    private fun probeSize(url: String): Long {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20000
            readTimeout = 20000
        }
        return try {
            if (conn.responseCode == 200) conn.contentLength.toLong() else 0L
        } finally {
            conn.disconnect()
        }
    }

    /** Скачивает url в файл; onProgress — сколько байт уже скачано. */
    private fun downloadTo(file: File, url: String, onProgress: (Long) -> Unit) {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20000
            readTimeout = 60000
        }
        if (conn.responseCode != 200) {
            conn.disconnect()
            throw java.io.IOException("HTTP ${conn.responseCode} при скачивании APK")
        }
        var done = 0L
        conn.inputStream.use { input ->
            file.outputStream().use { out ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    done += n
                    onProgress(done)
                }
            }
        }
        conn.disconnect()
    }

    private fun installApk(file: File) {
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(this@MainActivity, "Не удалось запустить установку обновления", Toast.LENGTH_LONG).show()
        }
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

        /** Кнопка «🔄 Проверить обновление» в справке приложения. */
        @JavascriptInterface
        fun checkUpdate() {
            checkForUpdate(force = true)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Сначала просим приложение закрыть открытые оверлеи
        // (полноэкранный зум, карточку детали) — window.__onBackKey()
        webView.evaluateJavascript(
            "window.__onBackKey ? window.__onBackKey() : 'none'"
        ) { result ->
            runOnUiThread {
                if (result == "\"handled\"") return@runOnUiThread
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    super.onBackPressed()
                }
            }
        }
    }
}
