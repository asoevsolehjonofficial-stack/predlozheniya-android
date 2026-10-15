package tj.as.predlozheniya;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        webView.addJavascriptInterface(new DownloadsBridge(), "AndroidDownloads");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.startsWith("https://") || url.startsWith("http://"))) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                        return true;
                    } catch (Exception ignored) {
                        return false;
                    }
                }
                return false;
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    public class DownloadsBridge {
        @JavascriptInterface
        public String saveBase64(String filename, String mimeType, String base64) {
            OutputStream out = null;
            Uri itemUri = null;
            try {
                if (base64 == null || base64.length() > 12 * 1024 * 1024) {
                    throw new Exception("Файл слишком большой (максимум 8 МБ)");
                }
                String safeName = filename == null ? "as-app-download" : filename.replaceAll("[^A-Za-z0-9._-]", "_");
                if (safeName.isEmpty()) safeName = "as-app-download";
                if (safeName.length() > 100) safeName = safeName.substring(0, 100);
                String mime = (mimeType == null || mimeType.isEmpty()) ? "application/octet-stream" : mimeType;
                if (mime.length() > 120 || mime.contains("\\r") || mime.contains("\\n")) mime = "application/octet-stream";
                byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                if (bytes.length > 8 * 1024 * 1024) {
                    throw new Exception("Файл слишком большой (максимум 8 МБ)");
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    itemUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (itemUri == null) throw new Exception("Не удалось создать файл в папке Загрузки");
                    out = getContentResolver().openOutputStream(itemUri);
                    if (out == null) throw new Exception("Не удалось открыть файл для записи");
                    out.write(bytes);
                    out.flush();
                    out.close();
                    out = null;
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContentResolver().update(itemUri, done, null, null);
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null) throw new Exception("Папка загрузок недоступна");
                    if (!dir.exists() && !dir.mkdirs()) throw new Exception("Не удалось создать папку загрузок");
                    File file = new File(dir, safeName);
                    out = new FileOutputStream(file);
                    out.write(bytes);
                    out.flush();
                    out.close();
                    out = null;
                }
                final String msg = "Сохранено: " + safeName + " — папка Загрузки";
                runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
                return msg;
            } catch (Exception e) {
                try { if (out != null) out.close(); } catch (Exception ignored) {}
                final String msg = "Ошибка сохранения: " + e.getMessage();
                runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
                return msg;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
