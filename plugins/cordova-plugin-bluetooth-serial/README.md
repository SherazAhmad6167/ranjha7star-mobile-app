# cordova-plugin-bluetooth-serial (patched copy)

Local copy of [don/BluetoothSerial](https://github.com/don/BluetoothSerial)
0.4.7, the last release, which predates Android 12. Installed through
`"cordova-plugin-bluetooth-serial": "file:plugins/cordova-plugin-bluetooth-serial"`
in the app's `package.json`. Android only; the JavaScript API
(`window.bluetoothSerial`) is unchanged.

Changes from 0.4.7:

- **The link outlives the screen.** One connection per process, shared by
  every plugin instance. Leaving the app (back button / `App.exitApp()`) no
  longer closes it; only `disconnect` or the process dying does.
- **No crashes from the Bluetooth threads.** Runtime errors (a missing
  Android 12+ permission, a socket that could not be created, a stream that
  returns -1) used to be thrown on a background thread and kill the app. They
  now fail the call or count as a lost connection.
- **No self-sabotage on reconnect.** A link or connect attempt that was
  cancelled on purpose used to report "connection lost" late and cancel the
  *new* connect attempt. Cancelled threads now exit quietly.
- **`write` fails when nothing was sent** instead of reporting success.
- Handler messages run on the main looper, so they still arrive after the
  activity (and its plugin thread) is recreated.
