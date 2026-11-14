package io.github.svandecappelle.ongaku;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;

import com.google.androidbrowserhelper.trusted.TwaLauncher;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Asks once for the address of the Ongaku server, checks it, then opens it in Chrome as a
 * Trusted Web Activity: the web application, full screen, with its background playback and
 * its media controls. The next launches open the server at once.
 *
 * The setup comes back from the "Change the server" shortcut of the launcher icon, and from
 * ongaku://setup?server=… links (the download page of a server gives one).
 */
public class MainActivity extends Activity {

    static final String ACTION_SETUP = "io.github.svandecappelle.ongaku.SETUP";
    private static final String PREFERENCES = "ongaku";
    private static final String KEY_SERVER = "server";
    private static final int TIMEOUT = 10000;
    private static final int MAX_REDIRECTS = 5;
    private static final int BACKGROUND = 0xFF0F1115;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private TwaLauncher launcher;
    /** The server was opened: coming back here (back from it) closes the application */
    private boolean launched;

    private EditText server;
    private TextView message;
    private Button connect;
    private ProgressBar progress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String saved = preferences().getString(KEY_SERVER, null);
        if (saved != null && !wantsSetup(getIntent())) {
            open(saved);
            return;
        }
        showSetup(suggestedServer(getIntent(), saved));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (wantsSetup(intent)) {
            launched = false;
            showSetup(suggestedServer(intent, preferences().getString(KEY_SERVER, null)));
        }
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        if (launched) {
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
        if (launcher != null) {
            launcher.destroy();
        }
    }

    private SharedPreferences preferences() {
        return getSharedPreferences(PREFERENCES, MODE_PRIVATE);
    }

    private static boolean wantsSetup(Intent intent) {
        return intent != null && (ACTION_SETUP.equals(intent.getAction()) || isSetupLink(intent.getData()));
    }

    private static boolean isSetupLink(Uri data) {
        return data != null && "ongaku".equals(data.getScheme()) && "setup".equals(data.getHost());
    }

    /** The server of an ongaku://setup?server=… link, else the one saved */
    private static String suggestedServer(Intent intent, String saved) {
        Uri data = intent != null ? intent.getData() : null;
        if (isSetupLink(data) && data.getQueryParameter("server") != null) {
            return data.getQueryParameter("server");
        }
        return saved != null ? saved : "";
    }

    private void showSetup(String suggestion) {
        setContentView(R.layout.activity_setup);
        server = findViewById(R.id.server);
        message = findViewById(R.id.message);
        connect = findViewById(R.id.connect);
        progress = findViewById(R.id.progress);
        server.setText(suggestion);
        server.setSelection(server.getText().length());
        connect.setOnClickListener((view) -> check());
        server.setOnEditorActionListener((view, action, event) -> {
            if (action == EditorInfo.IME_ACTION_GO) {
                check();
                return true;
            }
            return false;
        });
    }

    private void check() {
        String typed = server.getText().toString().trim();
        if (typed.isEmpty()) {
            showMessage(getString(R.string.error_empty));
            return;
        }
        setBusy(true);
        executor.execute(() -> {
            String found = null;
            String failure = null;
            for (String candidate : candidates(typed)) {
                try {
                    found = findOngaku(candidate);
                    if (found != null) {
                        break;
                    }
                    failure = getString(R.string.error_not_ongaku);
                } catch (IOException err) {
                    if (failure == null) {
                        failure = getString(R.string.error_unreachable, String.valueOf(err.getMessage()));
                    }
                }
            }
            final String address = found;
            final String error = failure;
            main.post(() -> {
                if (isFinishing()) {
                    return;
                }
                setBusy(false);
                if (address == null) {
                    showMessage(error);
                    return;
                }
                preferences().edit().putString(KEY_SERVER, address).apply();
                open(address);
            });
        });
    }

    /** "music.example.com": https first, then http (a server of the local network) */
    static List<String> candidates(String typed) {
        String address = typed.replaceAll("/+$", "");
        List<String> list = new ArrayList<>();
        if (address.matches("(?i)^https?://.*")) {
            list.add(address);
        } else {
            list.add("https://" + address);
            list.add("http://" + address);
        }
        return list;
    }

    /**
     * The address of the Ongaku server at `base` (after its redirections, http to https for
     * example), or null when another site answers. Its web manifest tells it.
     */
    static String findOngaku(String base) throws IOException {
        String url = base + "/manifest.webmanifest";
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(TIMEOUT);
            connection.setReadTimeout(TIMEOUT);
            connection.setRequestProperty("Accept", "application/manifest+json, application/json");
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400 && connection.getHeaderField("Location") != null) {
                    url = new URL(new URL(url), connection.getHeaderField("Location")).toString();
                    continue;
                }
                if (status != 200) {
                    return null;
                }
                JSONObject manifest = new JSONObject(read(connection.getInputStream()));
                if (!"Ongaku".equals(manifest.optString("name"))) {
                    return null;
                }
                return url.substring(0, url.length() - "/manifest.webmanifest".length());
            } catch (org.json.JSONException err) {
                return null;
            } finally {
                connection.disconnect();
            }
        }
        return null;
    }

    private static String read(InputStream input) throws IOException {
        try (InputStream in = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            // A manifest is small: a large answer is not one
            while ((count = in.read(buffer)) != -1 && out.size() < 256 * 1024) {
                out.write(buffer, 0, count);
            }
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    /** The server in Chrome, full screen; a Custom Tab where a Trusted Web Activity is not possible */
    private void open(String address) {
        setContentView(new View(this));
        CustomTabColorSchemeParams colours = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(BACKGROUND)
                .setNavigationBarColor(BACKGROUND)
                .setNavigationBarDividerColor(BACKGROUND)
                .build();
        TrustedWebActivityIntentBuilder builder = new TrustedWebActivityIntentBuilder(Uri.parse(address + "/"))
                .setDefaultColorSchemeParams(colours);
        if (launcher != null) {
            launcher.destroy();
        }
        launcher = new TwaLauncher(this);
        launcher.launch(builder, null, null, () -> launched = true, TwaLauncher.CCT_FALLBACK_STRATEGY);
    }

    private void setBusy(boolean busy) {
        connect.setEnabled(!busy);
        server.setEnabled(!busy);
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        if (busy) {
            message.setVisibility(View.GONE);
        }
    }

    private void showMessage(String text) {
        message.setText(text);
        message.setVisibility(View.VISIBLE);
    }
}
