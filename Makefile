# Ongaku: install and run on a server with Docker, behind nginx (and development tasks).
#
#   sudo make install DOMAIN=music.example.com MUSIC_DIR=/srv/music            # containers + nginx site
#   sudo make install DOMAIN=music.example.com MUSIC_DIR=/srv/music HTTPS=1    # … and HTTPS (Let's Encrypt, webroot challenge)
#   make help                                                                  # everything else
#
# The nginx site is a single dedicated file, ongaku.host.conf. The installer only ever
# writes or removes that file (and its sites-enabled link): other sites are never touched.

SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.ONESHELL:
.DEFAULT_GOAL := help

# Settings of a previous install are read back from .env and config/application.yml,
# so "make update" or "sudo make https" don't need them again.
ENV_FILE := .env
CONFIG := config/application.yml
CONFIG_TEMPLATE := docker/application.yml
env_value = $(shell sed -n 's/^$(1)=//p' $(ENV_FILE) 2>/dev/null | tail -n 1)

DOMAIN ?= $(shell sed -n 's/^hostname: *//p' $(CONFIG) 2>/dev/null | grep -vx 'localhost\|music\.hostname\.com')
# Folder of the music on this server, mounted read only in the container.
MUSIC_DIR ?= $(call env_value,MUSIC_DIR)
# Host port the container listens on (127.0.0.1 only), proxied by nginx.
PORT ?= $(or $(call env_value,ONGAKU_PORT),3000)
# HTTPS=1: get a certificate with certbot (certonly --webroot: no certbot nginx plugin needed).
# EMAIL: account e-mail for Let's Encrypt (else certbot asks).
HTTPS ?= 0
EMAIL ?=
# FORCE=1: install even if another nginx site already uses DOMAIN.
FORCE ?= 0

SITE := ongaku.host.conf
TEMPLATE := deploy/$(SITE)
TEMPLATE_HTTPS := deploy/ongaku.host.https.conf
NGINX_ROOT ?= /etc/nginx
# Where certbot puts the challenge files, and where it keeps the certificate.
WEBROOT ?= /var/www/ongaku-acme
LETSENCRYPT ?= /etc/letsencrypt
# Uid of the "node" user of the image: it reads the music and the configuration.
CONTAINER_UID := 1000
# Commands, overridable (e.g. NGINX_RELOAD="nginx -s reload" without systemd).
SUDO ?= $(shell [ "$$(id -u)" = 0 ] || echo sudo)
COMPOSE ?= docker compose
NGINX_TEST ?= nginx -t
NGINX_DUMP ?= nginx -T
NGINX_RELOAD ?= systemctl reload nginx
CERTBOT ?= certbot

# Debian/Ubuntu layout (sites-available + sites-enabled link) when nginx.conf includes sites-enabled,
# conf.d otherwise (a sites-available folder alone is not loaded by every nginx package).
define nginx_paths
if [ -d "$(NGINX_ROOT)/sites-available" ] && grep -Eqs '^[[:space:]]*include[[:space:]]+[^;]*sites-enabled' "$(NGINX_ROOT)/nginx.conf"; then
  avail="$(NGINX_ROOT)/sites-available/$(SITE)"; enabled="$(NGINX_ROOT)/sites-enabled/$(SITE)"
else
  avail="$(NGINX_ROOT)/conf.d/$(SITE)"; enabled=""
fi
endef

.PHONY: help install app nginx https update uninstall status logs deps dev build clean gen-certificate

help:
	@cat <<'EOF'
	Ongaku server installer

	  sudo make install DOMAIN=music.example.com MUSIC_DIR=/srv/music [HTTPS=1] [EMAIL=you@example.com] [PORT=3000]
	      Configure, build and start the containers, install the nginx site $(SITE), reload nginx.
	  make app MUSIC_DIR=/srv/music [PORT=3000]   Configure, build and (re)start the containers only.
	  sudo make nginx DOMAIN=…                    Install or update the nginx site only.
	  sudo make https DOMAIN=… [EMAIL=…]          Get the HTTPS certificate (certbot, webroot) and switch the site to HTTPS.
	  make update                                 git pull, rebuild and restart the containers.
	  make status / make logs                     Containers state / follow the application logs.
	  sudo make uninstall                         Stop the containers and remove the nginx site (only $(SITE)).

	The settings of the first install are kept in .env and config/application.yml: the next
	commands don't need MUSIC_DIR, PORT or DOMAIN again.

	Development
	  make deps      Install the npm dependencies of the server and the client.
	  make dev       Run the server and the client in watch mode.
	  make build     Build the client and package dist.tar.gz.
	  make clean     Remove the dependencies and the builds.
	EOF

install: app nginx
	@if [ "$(HTTPS)" = 1 ]; then $(MAKE) --no-print-directory https; fi
	echo
	echo "Ongaku is installed: http$$([ "$(HTTPS)" = 1 ] && echo s)://$(DOMAIN)/"
	echo "Create the administrator account on the first visit, then turn on the required login"
	echo "in the administration if the server is reachable from the internet."

# ---------- Containers ----------

app:
	@command -v docker >/dev/null || { echo "Docker is not installed: https://docs.docker.com/engine/install/" >&2; exit 1; }
	$(COMPOSE) version >/dev/null || { echo "The Docker compose plugin is missing (package docker-compose-plugin)." >&2; exit 1; }
	[[ "$(PORT)" =~ ^[0-9]+$$ ]] || { echo "Invalid port: $(PORT)" >&2; exit 1; }
	# The music folder, mounted read only: the container reads it as uid $(CONTAINER_UID).
	[ -n "$(MUSIC_DIR)" ] || { echo "Set the music folder: make app MUSIC_DIR=/srv/music" >&2; exit 1; }
	[ -d "$(MUSIC_DIR)" ] || { echo "The music folder does not exist: $(MUSIC_DIR)" >&2; exit 1; }
	music="$$(cd "$(MUSIC_DIR)" && pwd)"
	if [ "$$(stat -c %u "$$music")" != $(CONTAINER_UID) ] && [ $$(( $$(stat -c %a "$$music") % 10 & 5 )) -ne 5 ]; then
	  echo "Warning: the container can't read $$music (uid $(CONTAINER_UID)): chmod -R o+rX \"$$music\"" >&2
	fi
	# Configuration: created once from the template, with a random secret; then only the host name is updated.
	if [ ! -f "$(CONFIG)" ]; then
	  mkdir -p "$$(dirname "$(CONFIG)")"
	  secret="$$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
	  sed -e "s/^hostname: .*/hostname: $(or $(DOMAIN),localhost)/" -e "s/^secret: .*/secret: $$secret/" "$(CONFIG_TEMPLATE)" > "$(CONFIG)"
	  # The file holds the secret: readable by the container user only, when possible.
	  if [ "$$(id -u)" = $(CONTAINER_UID) ]; then chmod 600 "$(CONFIG)"
	  elif [ "$$(id -u)" = 0 ]; then chown $(CONTAINER_UID) "$(CONFIG)"; chmod 600 "$(CONFIG)"
	  else chmod 644 "$(CONFIG)"; echo "Warning: $(CONFIG) is readable by every user of this server (it holds the secret)." >&2; fi
	  echo "Created $(CONFIG) (random secret). Add your Last.fm / Spotify API keys there for covers and biographies."
	elif [ -n "$(DOMAIN)" ] && ! grep -qx "hostname: $(DOMAIN)" "$(CONFIG)"; then
	  sed -i "s/^hostname: .*/hostname: $(DOMAIN)/" "$(CONFIG)"
	fi
	# Settings of docker-compose.yml, rewritten only when they change.
	settings="$$( { grep -vE '^(MUSIC_DIR|ONGAKU_PORT)=' "$(ENV_FILE)" 2>/dev/null || true; printf 'MUSIC_DIR=%s\nONGAKU_PORT=%s\n' "$$music" "$(PORT)"; } )"
	if [ "$$settings" != "$$(cat "$(ENV_FILE)" 2>/dev/null)" ]; then printf '%s\n' "$$settings" > "$(ENV_FILE)"; fi
	echo "Building and starting the containers on 127.0.0.1:$(PORT) (the first build takes a few minutes)…"
	$(COMPOSE) up -d --build
	for i in $$(seq 1 60); do
	  if curl -fsS -o /dev/null "http://127.0.0.1:$(PORT)/api/auth" 2>/dev/null; then echo "Ongaku answers on port $(PORT)."; exit 0; fi
	  sleep 3
	done
	echo "Ongaku does not answer on port $(PORT) yet: check 'make logs'." >&2
	exit 1

update:
	@git pull --ff-only
	$(MAKE) --no-print-directory app

status:
	@$(COMPOSE) ps

logs:
	@$(COMPOSE) logs -f --tail=100 ongaku

# ---------- nginx ----------

nginx:
	@[ -n "$(DOMAIN)" ] || { echo "Set the domain: make nginx DOMAIN=music.example.com" >&2; exit 1; }
	[[ "$(DOMAIN)" =~ ^[A-Za-z0-9.-]+$$ ]] || { echo "Invalid domain: $(DOMAIN)" >&2; exit 1; }
	[[ "$(PORT)" =~ ^[0-9]+$$ ]] || { echo "Invalid port: $(PORT)" >&2; exit 1; }
	[ -d "$(NGINX_ROOT)" ] || { echo "nginx is not installed ($(NGINX_ROOT) missing): sudo apt install nginx" >&2; exit 1; }
	$(nginx_paths)
	# Another site already serving this domain would conflict: stop unless FORCE=1.
	others=$$(grep -rlE "server_name[^;]*[[:space:]]$(subst .,\.,$(DOMAIN))([[:space:];]|$$)" "$(NGINX_ROOT)" 2>/dev/null | grep -v "$(SITE)" || true)
	if [ -n "$$others" ] && [ "$(FORCE)" != 1 ]; then
	  echo "Another nginx configuration already uses $(DOMAIN):" >&2; echo "$$others" >&2
	  echo "Nothing was changed. Use another domain, or FORCE=1 to install anyway." >&2; exit 1
	fi
	# HTTPS once a certificate exists for the domain (make https), plain HTTP before.
	cert="$(LETSENCRYPT)/live/$(DOMAIN)"
	if $(SUDO) test -f "$$cert/fullchain.pem"; then template="$(TEMPLATE_HTTPS)"; mode=https; else template="$(TEMPLATE)"; mode=http; fi
	$(SUDO) mkdir -p "$(WEBROOT)"
	rendered=$$(mktemp); trap 'rm -f "$$rendered"' EXIT
	sed -e "s/__DOMAIN__/$(DOMAIN)/g" -e "s/__PORT__/$(PORT)/g" -e "s|__WEBROOT__|$(WEBROOT)|g" -e "s|__CERT_DIR__|$$cert|g" "$$template" > "$$rendered"
	# Keep the previous version of our own file, to restore it if the new one is rejected.
	backup=""
	if [ -f "$$avail" ]; then
	  backup="$$avail.bak-$$(date +%Y%m%d%H%M%S)"
	  $(SUDO) cp -p "$$avail" "$$backup"
	fi
	$(SUDO) install -m 644 "$$rendered" "$$avail"
	if [ -n "$$enabled" ]; then $(SUDO) ln -sfn "$$avail" "$$enabled"; fi
	# Our own file in the other layout (left by an earlier install) would load the site twice: remove it.
	for old in "$(NGINX_ROOT)/sites-available/$(SITE)" "$(NGINX_ROOT)/sites-enabled/$(SITE)" "$(NGINX_ROOT)/conf.d/$(SITE)"; do
	  if [ "$$old" != "$$avail" ] && [ "$$old" != "$$enabled" ] && { [ -e "$$old" ] || [ -L "$$old" ]; }; then $(SUDO) rm -f "$$old"; echo "Removed the old copy $$old"; fi
	done
	echo "Installed $$avail"
	if ! $(SUDO) $(NGINX_TEST); then
	  echo "nginx rejected the configuration: restoring the previous state." >&2
	  if [ -n "$$backup" ]; then $(SUDO) cp -p "$$backup" "$$avail"
	  else $(SUDO) rm -f "$$avail"; if [ -n "$$enabled" ]; then $(SUDO) rm -f "$$enabled"; fi; fi
	  exit 1
	fi
	$(SUDO) $(NGINX_RELOAD)
	# Make sure nginx really loads the file (an include missing from nginx.conf would silently ignore it).
	if ! $(SUDO) $(NGINX_DUMP) 2>/dev/null | grep -q "^# configuration file .*$(SITE):"; then
	  echo "Warning: nginx does not load $$avail. Add an include for its folder to the http block of $(NGINX_ROOT)/nginx.conf." >&2
	  exit 1
	fi
	echo "nginx reloaded ($$mode): $$mode://$(DOMAIN)/ → 127.0.0.1:$(PORT)"

https:
	@[ -n "$(DOMAIN)" ] || { echo "Set the domain: make https DOMAIN=music.example.com" >&2; exit 1; }
	command -v $(firstword $(CERTBOT)) >/dev/null || { echo "certbot is not installed: sudo apt install certbot" >&2; exit 1; }
	# 1. The site must answer the challenge over HTTP: (re)install it (HTTP, or HTTPS if a certificate exists).
	$(MAKE) --no-print-directory nginx
	# 2. Get the certificate: certbot writes the challenge into the site's own folder, nothing else is touched.
	#    The deploy hook reloads nginx after each renewal (certbot renews automatically with its timer).
	$(SUDO) $(CERTBOT) certonly --webroot -w "$(WEBROOT)" -d "$(DOMAIN)" --cert-name "$(DOMAIN)" --keep-until-expiring \
	  --deploy-hook "$(NGINX_RELOAD)" $(if $(EMAIL),--non-interactive --agree-tos -m $(EMAIL),)
	# 3. Switch the site to HTTPS.
	$(MAKE) --no-print-directory nginx

uninstall:
	@$(nginx_paths)
	if [ -f "$$avail" ] || [ -L "$${enabled:-/nonexistent}" ]; then
	  $(SUDO) rm -f "$$avail"
	  if [ -n "$$enabled" ]; then $(SUDO) rm -f "$$enabled"; fi
	  if $(SUDO) $(NGINX_TEST); then $(SUDO) $(NGINX_RELOAD); fi
	  echo "Removed $$avail (backups $(SITE).bak-* are kept; the certificate, if any, too)."
	fi
	if command -v docker >/dev/null; then $(COMPOSE) down; fi
	echo "Ongaku is uninstalled. Its data stays in the Docker volumes (docker compose down -v deletes them)."

# ---------- Development ----------

deps:
	@npm install
	cd client && npm install --legacy-peer-deps

dev: deps
	@npm run watch

build: deps
	@cd client && npm run build && cd ..
	tar -zcvf dist.tar.gz client/dist server package.json LICENSE README.md

clean:
	@rm -rf node_modules client/node_modules client/dist dist.tar.gz

gen-certificate:
	@mkdir -p server/certificate
	openssl genrsa -des3 -passout pass:application -out server/certificate/server.key 1024
	openssl req -passin pass:application -new -key server/certificate/server.key -out server/certificate/server.csr -subj '/FR=localhost/O=OVH./C=FR'
	cp server/certificate/server.key server/certificate/server.key.tmp
	openssl rsa -passin pass:application -in server/certificate/server.key.tmp -out server/certificate/server.key
	openssl x509 -req -days 365 -in server/certificate/server.csr -signkey server/certificate/server.key -out server/certificate/server.crt
	rm server/certificate/server.key.tmp
