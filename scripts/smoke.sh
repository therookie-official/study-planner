#!/bin/bash
# Installs the APK on an emulator, launches it, and prints what happened.
adb install -r StudyPlanner.apk
adb logcat -c
adb shell monkey -p com.studyplanner.app -c android.intent.category.LAUNCHER 1
sleep 25
echo "=== PROCESS ==="
adb shell pidof com.studyplanner.app || echo "NOT RUNNING (app closed)"
echo "=== LOG ==="
adb logcat -d -v time | grep -E "AndroidRuntime|FATAL|Capacitor|studyplanner|chromium|Console" | head -200
