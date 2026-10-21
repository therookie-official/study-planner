"""Replaces MainActivity with a version that remembers a crash and shows it on the next launch."""
import os
d = 'android/app/src/main/java/com/studyplanner/app'
os.makedirs(d, exist_ok=True)
open(d + '/MainActivity.java', 'w').write('''package com.studyplanner.app;

import android.app.AlertDialog;
import android.os.Bundle;
import android.widget.ScrollView;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        final File f = new File(getFilesDir(), "last-crash.txt");
        final Thread.UncaughtExceptionHandler old = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                FileWriter w = new FileWriter(f);
                w.write(sw.toString());
                w.close();
            } catch (Throwable ignored) { }
            if (old != null) old.uncaughtException(t, e);
        });
        super.onCreate(savedInstanceState);
        try {
            if (f.exists()) {
                char[] buf = new char[2500];
                FileReader r = new FileReader(f);
                int n = r.read(buf);
                r.close();
                f.delete();
                TextView tv = new TextView(this);
                tv.setText(new String(buf, 0, Math.max(n, 0)));
                tv.setTextSize(11);
                tv.setPadding(32, 24, 32, 24);
                ScrollView sv = new ScrollView(this);
                sv.addView(tv);
                new AlertDialog.Builder(this).setTitle("Last crash (send a screenshot)").setView(sv).setPositiveButton("OK", null).show();
            }
        } catch (Throwable ignored) { }
    }
}
''')
print('MainActivity patched')
