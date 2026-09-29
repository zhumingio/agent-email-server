#!/usr/bin/env bash
# 本地构建 zmail Android APK（使用 .build 下的 JDK21 + Android SDK）
# 用法: ./build-apk.sh            # 构建 release（需 keystore）
#       ./build-apk.sh debug      # 构建 debug
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$ROOT/.build"
MODE="${1:-release}"

export HOME="$BUILD/home"
export JAVA_HOME="$BUILD/jdk21/$(ls "$BUILD/jdk21" | grep '^jdk-' | head -1)"
export ANDROID_HOME="$BUILD/android-sdk"
export ANDROID_SDK_ROOT="$BUILD/android-sdk"
export ANDROID_USER_HOME="$BUILD/android-user-home"
export GRADLE_USER_HOME="$BUILD/gradle-home"

if [ "$MODE" = "release" ]; then
  export ZMAIL_KEYSTORE="${ZMAIL_KEYSTORE:-$ROOT/apps/mobile/keystore/zmail-release.jks}"
  export ZMAIL_KEY_ALIAS="${ZMAIL_KEY_ALIAS:-zmail}"
  if [ -z "$ZMAIL_KEYSTORE_PASSWORD" ] && [ -f "$ROOT/apps/mobile/keystore/KEYSTORE_PASSWORD.txt" ]; then
    export ZMAIL_KEYSTORE_PASSWORD="$(cat "$ROOT/apps/mobile/keystore/KEYSTORE_PASSWORD.txt")"
  fi
  export ZMAIL_KEY_PASSWORD="$ZMAIL_KEYSTORE_PASSWORD"
fi

mkdir -p "$HOME" "$ANDROID_USER_HOME"

cd "$ROOT/apps/mobile"
npx cap sync android
cd android

if [ "$MODE" = "release" ]; then
  ./gradlew assembleRelease --no-daemon -Duser.home="$HOME"
  echo "release APK: $ROOT/apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
else
  ./gradlew assembleDebug --no-daemon -Duser.home="$HOME"
  echo "debug APK: $ROOT/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
fi
