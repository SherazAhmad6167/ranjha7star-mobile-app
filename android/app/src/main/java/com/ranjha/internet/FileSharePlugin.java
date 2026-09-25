package com.ranjha.internet;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Saves the receipts / forms the app renders and hands them to WhatsApp.
 * The WebView can do neither on its own: it ignores <a download> and has
 * no Web Share support, so both used to silently do nothing.
 */
@CapacitorPlugin(
    name = "FileShare",
    permissions = {
        // Only Android 9 and older need it; newer versions write through MediaStore.
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class FileSharePlugin extends Plugin {

    private static final String FOLDER = "Ranjha7star";
    private static final String[] WHATSAPP_PACKAGES = { "com.whatsapp", "com.whatsapp.w4b" };

    /** Images land in Pictures/Ranjha7star (visible in the gallery), anything else in Download/Ranjha7star. */
    @PluginMethod
    public void saveFile(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        writeToPublicStorage(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            writeToPublicStorage(call);
        } else {
            call.reject("Storage permission denied");
        }
    }

    private void writeToPublicStorage(PluginCall call) {
        String data = call.getString("data");
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "image/png");
        if (data == null || fileName == null) {
            call.reject("data and fileName are required");
            return;
        }

        boolean isImage = mimeType.startsWith("image/");
        String baseDir = isImage ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS;
        String folder = baseDir + "/" + FOLDER;

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, folder);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                Uri collection = isImage
                    ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                Uri uri = resolver.insert(collection, values);
                if (uri == null) throw new IOException("Could not create " + fileName);

                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IOException("Could not open " + fileName);
                    out.write(bytes);
                }

                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(baseDir), FOLDER);
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("Could not create " + dir);

                File file = new File(dir, fileName);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                MediaScannerConnection.scanFile(
                    getContext(),
                    new String[] { file.getAbsolutePath() },
                    new String[] { mimeType },
                    null
                );
            }

            JSObject result = new JSObject();
            result.put("folder", folder);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not save file: " + e.getMessage(), e);
        }
    }

    /**
     * Opens a WhatsApp chat with the message typed in. A wa.me link opened in
     * the browser on phones with only WhatsApp Business; whatsapp:// is
     * handled by both apps, so whichever is installed opens directly (Android
     * asks once, with "Always", when both are). Falls back to wa.me when
     * neither is installed.
     */
    @PluginMethod
    public void openWhatsApp(PluginCall call) {
        String phone = call.getString("phone", "");
        String text = call.getString("text", "");

        Uri.Builder chat = new Uri.Builder().scheme("whatsapp").authority("send");
        if (phone != null && !phone.isEmpty()) chat.appendQueryParameter("phone", phone);
        if (text != null && !text.isEmpty()) chat.appendQueryParameter("text", text);

        JSObject result = new JSObject();
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, chat.build()));
            result.put("app", "whatsapp");
        } catch (ActivityNotFoundException notInstalled) {
            Uri.Builder web = Uri.parse("https://wa.me/" + (phone == null ? "" : phone)).buildUpon();
            if (text != null && !text.isEmpty()) web.appendQueryParameter("text", text);
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW, web.build()));
                result.put("app", "browser");
            } catch (ActivityNotFoundException noBrowser) {
                call.reject("WhatsApp is not installed");
                return;
            }
        }
        call.resolve(result);
    }

    /**
     * Sends the file straight into WhatsApp (or WhatsApp Business). With a
     * phone number the customer's chat opens directly; without one, or when
     * WhatsApp ignores it, WhatsApp shows its own contact picker. Falls back
     * to the system share sheet when neither app is installed.
     */
    @PluginMethod
    public void shareToWhatsApp(PluginCall call) {
        String data = call.getString("data");
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "image/png");
        String text = call.getString("text", "");
        String phone = call.getString("phone", "");
        if (data == null || fileName == null) {
            call.reject("data and fileName are required");
            return;
        }

        try {
            File dir = new File(getContext().getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("Could not create " + dir);

            File file = new File(dir, fileName);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }

            // Authority matches the <provider> in AndroidManifest.xml; cache-path is in file_paths.xml.
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, text);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent whatsapp = new Intent(intent);
            // Undocumented but long-standing: jumps to this number's chat instead of the contact picker.
            if (phone != null && !phone.isEmpty()) whatsapp.putExtra("jid", phone + "@s.whatsapp.net");

            for (String pkg : WHATSAPP_PACKAGES) {
                whatsapp.setPackage(pkg);
                try {
                    getActivity().startActivity(whatsapp);
                    JSObject result = new JSObject();
                    result.put("app", pkg);
                    call.resolve(result);
                    return;
                } catch (ActivityNotFoundException ignored) {
                    // Not installed - try the next one.
                }
            }

            getActivity().startActivity(Intent.createChooser(intent, "Share"));
            JSObject result = new JSObject();
            result.put("app", "chooser");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not share file: " + e.getMessage(), e);
        }
    }
}
