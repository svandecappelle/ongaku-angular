# ongaku-client

[![CI](https://github.com/svandecappelle/ongaku-angular/actions/workflows/ci.yml/badge.svg)](https://github.com/svandecappelle/ongaku-angular/actions/workflows/ci.yml)

## This project is yet a devlopment state
The aim is to migrate ongaku music stream application to new angular stack with nodejs es6 support and refractoring server side to new coding conventions.

**To test it:**
```
make dev
```

*The database of v1 ongaku is compatible with this one*

## Deploying on a server (Docker + nginx)

```
sudo make install DOMAIN=music.example.com MUSIC_DIR=/srv/music                  # containers + nginx site
sudo make install DOMAIN=music.example.com MUSIC_DIR=/srv/music HTTPS=1 EMAIL=you@example.com   # … with a Let's Encrypt certificate
```

Point the domain's DNS at the server and open ports 80 and 443 first. `make help` lists the other targets
(`make update`, `make status`, `make logs`, `sudo make https`, `sudo make uninstall`). The installer writes a
single dedicated nginx site, `ongaku.host.conf`, from the templates in [deploy/](deploy/), and never touches
other sites. Details, in French: [docs/docker.md](docs/docker.md).

Music and videos added, changed or deleted in the music folder show in the application by themselves, without
a rescan. On a network share (NFS, SMB), where the system tells no changes, set `watchLibrary: poll` in
`server/config/application.yml`; on Linux, a very large library may need a higher `fs.inotify.max_user_watches`.

### Android application

`make apk` builds an Android application in Docker (nothing else to install): it asks for the address of
the server once, then opens it full screen in Chrome, with the music playing on when the screen is off.
The server offers it for download on its "Android app" page (from the login page and the account menu),
and publishes `/.well-known/assetlinks.json` so Chrome shows it without its address bar (HTTPS needed).
The signing key is made once in `android/keystore/`: back it up, the next versions must be signed with it.
An APK built elsewhere is trusted by adding its key to `androidAppFingerprints` in `application.yml`.

For development, `make deps` installs the npm dependencies and `make dev` runs the server and the client in
watch mode.

## Releases

`make release VERSION=1.2.0` sets the version in `package.json`, commits it and tags `v1.2.0`, without pushing.
Pushing the tag (`git push origin master v1.2.0`) runs [.github/workflows/release.yml](.github/workflows/release.yml):
the checks of the CI, then the Docker image for x86 and ARM published to `ghcr.io/svandecappelle/ongaku`
(tags `1.2.0`, `1.2` and `latest`), the Android application signed with the key of the project, and a GitHub
release with notes made from the commits (`feat`, `fix`, other). A server installed with `make install` then
updates with `make update RELEASE=1.2.0` (or `RELEASE=latest`): its image is pulled instead of built.

The signing key of the APK comes from four repository secrets (Settings › Secrets and variables › Actions); use
the key made by `make apk` so that the APK of the releases and the one of a server update each other:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE` | `base64 -w0 android/keystore/ongaku.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | `storePassword` of `android/keystore/keystore.properties` |
| `ANDROID_KEY_ALIAS` | `ongaku` |
| `ANDROID_KEY_PASSWORD` | `keyPassword` of the same file |

Without them the release is published without its APK. The first image published on `ghcr.io` may be private:
make the package public (its page › Package settings) for the servers to pull it without logging in.

## Tests

```
make test        # API and browser tests (builds the client first if needed)
make test-api    # API tests only
```

The tests start a throw-away instance on port 4200 with the Redis database 14, which they flush: never use
that database for anything else (`ONGAKU_TEST_PORT` and `ONGAKU_TEST_REDIS_DB` change them). The music is
generated with ffmpeg in a temporary folder, removed afterwards (`node test/run.mjs --keep` keeps it, with the
server log). The browser tests use the Chromium headless shell of Playwright when it is installed, or the
browser given by `CHROME`; they are skipped otherwise. The tests are under [test/](test/): `api/` for the
HTTP and Socket.io API, `e2e/` for the pages.

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs them on every push and pull
request, with Redis, ffmpeg and Chrome; there nothing is skipped, and the server log of a failed run is kept as
an artifact. The same workflow builds the Docker image and the Android application (signed with a key made for
the run: to check the build only).
