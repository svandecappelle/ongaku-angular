# ongaku-client

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

For development, `make deps` installs the npm dependencies and `make dev` runs the server and the client in
watch mode.

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
