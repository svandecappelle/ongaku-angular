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

For development, `make deps` installs the npm dependencies and `make dev` runs the server and the client in
watch mode.
