"""Adds the permissions the reminders need to the generated Android manifest."""
p = 'android/app/src/main/AndroidManifest.xml'
s = open(p).read()
perms = ''.join('    <uses-permission android:name="android.permission.%s" />\n' % n for n in
    ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'RECEIVE_BOOT_COMPLETED', 'VIBRATE', 'WAKE_LOCK'])
if 'POST_NOTIFICATIONS' not in s:
    s = s.replace('</manifest>', perms + '</manifest>')
open(p, 'w').write(s)
print('manifest patched')
