# Native Android starter — Stage 2

This directory is a **real Android application project**, separate from the existing HTML/WebView APK flow. It is the first native template for A.S. APP BUILDER and demonstrates working app logic rather than a visual mockup.

## Implemented template

- Native Android Activity and standard Android widgets (no WebView).
- Add notes, edit a note by tapping it, and delete a note by long-pressing it.
- Persist notes locally in app-private SharedPreferences as JSON.
- No network permission, account, paid API, or personal-data upload.
- Minimum Android API 21 (Android 5.0); compile/target SDK 35. The same APK is intended to run on Android 5.0+; features that depend on newer platform APIs must be guarded at runtime.

## Build locally

Use JDK 17, Android SDK platform 35, Build Tools 35.0.0, and Gradle 8.9:

```sh
gradle -p native-builder clean assembleDebug
gradle -p native-builder connectedDebugAndroidTest
```

The GitHub Actions workflow `.github/workflows/native-android-template.yml` performs the cloud build, installs the APK in an Android emulator, and runs the instrumentation smoke test.

## Important scope boundary

This is the first tested native template, **not yet** a general prompt-to-native-code generator and not yet wired to the public website or the production APK queue. The existing HTML-to-WebView mode remains separate and must not be described as native. Future templates should be selected from a validated app specification; untrusted prompts must never be allowed to inject arbitrary Gradle scripts or workflow commands into the build runner.
