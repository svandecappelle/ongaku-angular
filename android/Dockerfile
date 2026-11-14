# Build environment of the Android application ("make apk"): JDK 17, Gradle and the Android SDK.
# Nothing to install on the host but Docker.
FROM gradle:8.10.2-jdk17

ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=$PATH:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/build-tools/35.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip curl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p "$ANDROID_HOME/cmdline-tools" \
  && curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/tools.zip \
  && unzip -q /tmp/tools.zip -d "$ANDROID_HOME/cmdline-tools" \
  && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" \
  && rm /tmp/tools.zip \
  && yes | sdkmanager --licenses > /dev/null \
  && sdkmanager --install "platforms;android-35" "build-tools;35.0.0" "platform-tools" > /dev/null \
  && chmod -R a+rX "$ANDROID_HOME"

WORKDIR /project
