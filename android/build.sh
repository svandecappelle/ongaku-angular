#!/bin/sh
# Builds the signed APK in the container of "make apk", into dist/:
#   dist/ongaku.apk   the application, served by the server at /download/ongaku.apk
#   dist/ongaku.json  its version and the fingerprint of its signing key: the server publishes
#                     it in /.well-known/assetlinks.json, so Chrome opens it full screen
set -eu
cd "$(dirname "$0")"

# The signing key, made the first time. Keep keystore/ safe: an update of the application
# must be signed with the same key, or the phones refuse to install it over the old one.
if [ ! -f keystore/keystore.properties ]; then
  mkdir -p keystore
  password="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
  keytool -genkeypair -noprompt -keystore keystore/ongaku.jks -alias ongaku -keyalg RSA -keysize 3072 \
    -validity 10000 -dname "CN=Ongaku" -storepass "$password" -keypass "$password" > /dev/null 2>&1
  cat > keystore/keystore.properties <<PROPERTIES
storeFile=keystore/ongaku.jks
storePassword=$password
keyAlias=ongaku
keyPassword=$password
PROPERTIES
  chmod 600 keystore/keystore.properties keystore/ongaku.jks
  echo "Signing key created in android/keystore/: back it up, updates need it."
fi

gradle --no-daemon --quiet --console=plain assembleRelease

apk=app/build/outputs/apk/release/app-release.apk
fingerprint="$(apksigner verify --print-certs "$apk" | sed -n 's/.*SHA-256 digest: *//p' | head -n 1 | tr 'a-f' 'A-F' | sed 's/../&:/g; s/:$//')"
[ -n "$fingerprint" ] || { echo "The APK is not signed" >&2; exit 1; }

mkdir -p dist
cp "$apk" dist/ongaku.apk.tmp
mv dist/ongaku.apk.tmp dist/ongaku.apk
cat > dist/ongaku.json <<JSON
{
  "package": "io.github.svandecappelle.ongaku",
  "versionName": "${ONGAKU_VERSION_NAME:-1.0.0}",
  "versionCode": ${ONGAKU_VERSION_CODE:-1},
  "size": $(wc -c < dist/ongaku.apk),
  "sha256": "$(sha256sum dist/ongaku.apk | cut -d' ' -f1)",
  "fingerprints": ["$fingerprint"],
  "built": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON
echo "APK ready: android/dist/ongaku.apk (version ${ONGAKU_VERSION_NAME:-1.0.0}, code ${ONGAKU_VERSION_CODE:-1})"
