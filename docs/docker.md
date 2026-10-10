# Déployer Ongaku sur un serveur (Docker + nginx)

Ongaku tourne dans Docker (l'application et sa base Redis) et nginx le publie
sur un nom d'hôte, par exemple `https://music.example.com`. Le `Makefile` fait
toute l'installation.

```
navigateur ──https──▶ nginx (443) ──http──▶ 127.0.0.1:3000 ──▶ conteneur ongaku ──▶ conteneur redis
                                                                   │
                                                                   └── /music (votre musique, lecture seule)
```

## Prérequis

- Docker Engine avec le plugin Compose (`docker compose version`).
- nginx, et certbot pour HTTPS (`sudo apt install nginx certbot`).
- Un enregistrement DNS `A` (et `AAAA` en IPv6) du nom d'hôte vers le serveur,
  et les ports 80 et 443 ouverts.

## Installer

```sh
sudo make install DOMAIN=music.example.com MUSIC_DIR=/srv/musique                  # conteneurs + site nginx
sudo make install DOMAIN=music.example.com MUSIC_DIR=/srv/musique HTTPS=1 EMAIL=vous@exemple.fr   # … avec un certificat Let's Encrypt
```

`make help` liste les autres cibles :

| Commande | Effet |
|---|---|
| `make app MUSIC_DIR=…` | Configure, construit et (re)démarre les conteneurs seulement. |
| `sudo make nginx DOMAIN=…` | Installe ou met à jour le site nginx seulement. |
| `sudo make https DOMAIN=… [EMAIL=…]` | Obtient le certificat et passe le site en HTTPS. |
| `make update` | `git pull`, reconstruit et redémarre les conteneurs. |
| `make status` / `make logs` | État des conteneurs / journaux de l'application. |
| `sudo make uninstall` | Arrête les conteneurs et supprime le site nginx (uniquement le sien). |

Options : `PORT=` (port local, 3000 par défaut), `FORCE=1` (voir plus bas).

Les réglages de la première installation sont gardés : `MUSIC_DIR` et `PORT`
dans `.env`, le nom d'hôte dans `config/application.yml`. Les commandes
suivantes (`make update`, `sudo make https`…) n'en ont plus besoin.

Au premier accès, créez le compte administrateur. La bibliothèque est
consultable sans connexion par défaut : activez **Administration › connexion
obligatoire** si le serveur est accessible depuis Internet.

### Ce que fait `make app`

- Crée `config/application.yml` depuis [`docker/application.yml`](../docker/application.yml)
  avec un secret aléatoire (une seule fois : il est ensuite conservé ; seul le
  nom d'hôte est mis à jour). Ajoutez-y vos clés d'API Last.fm / Spotify pour
  les pochettes, photos et biographies, puis `make app`.
- Génère un mot de passe Redis (une seule fois, y compris pour une installation
  plus ancienne qui n'en avait pas) : il est gardé dans `config/application.yml`.
- Écrit `MUSIC_DIR`, `ONGAKU_PORT` et `REDIS_PASSWORD` dans `.env` (lisible par
  son propriétaire seulement), lu par `docker-compose.yml`.
- Construit l'image et démarre les conteneurs, puis attend que l'application
  réponde sur `127.0.0.1:PORT`.

Le conteneur lit la musique et la configuration avec l'uid 1000 : le dossier
de musique doit être lisible par tous (`chmod -R o+rX /srv/musique`), sinon
`make app` le signale. La musique est montée en lecture seule ; les fichiers
envoyés depuis l'application vont dans un volume Docker.

### Ce que fait l'installeur à nginx

Il installe **un seul fichier dédié**, `ongaku.host.conf`, depuis le modèle
[`deploy/ongaku.host.conf`](../deploy/ongaku.host.conf) : dans
`/etc/nginx/sites-available/` avec un lien dans `sites-enabled/`
(Debian/Ubuntu, quand `nginx.conf` inclut `sites-enabled`), dans
`/etc/nginx/conf.d/` sinon. Les autres sites ne sont jamais modifiés :

- il s'arrête sans rien changer si une autre configuration déclare déjà
  `server_name DOMAIN` (`FORCE=1` pour continuer quand même) ;
- la variable `map`, l'`upstream` et le cache SSL du modèle ont des noms
  préfixés par `ongaku` pour ne pas entrer en conflit avec d'autres
  configurations ;
- la version précédente de son fichier est gardée en
  `ongaku.host.conf.bak-<date>` (non chargée par nginx) ;
- il lance `nginx -t` avant de recharger ; si nginx refuse la configuration,
  l'état précédent est rétabli ;
- il vérifie avec `nginx -T` que nginx charge vraiment le fichier ;
- `sudo make uninstall` ne supprime que ce fichier et son lien (le certificat,
  les sauvegardes et les données restent).

`HTTPS=1` (ou `sudo make https` plus tard) obtient un certificat Let's Encrypt
avec `certbot certonly --webroot` : le site répond au challenge depuis son
propre dossier (`/var/www/ongaku-acme`), donc le plugin nginx de certbot n'est
pas nécessaire et aucun autre site n'est modifié. Le site passe ensuite à son
modèle HTTPS ([`deploy/ongaku.host.https.conf`](../deploy/ongaku.host.https.conf)) :
le port 80 redirige vers 443, qui sert l'application avec ce certificat.
Relancer `make install` garde HTTPS tant que le certificat existe ; les
renouvellements (timer de certbot) rechargent nginx par le *deploy hook*.

Sans son propre serveur 443, une requête `https://` pour le domaine reçoit la
réponse du serveur HTTPS par défaut de nginx, c'est-à-dire d'un autre site de
la machine : activez HTTPS dès que d'autres sites du serveur l'utilisent.

### Configurer nginx à la main

Pour écrire votre propre configuration (ou utiliser Caddy, Traefik…),
l'essentiel est dans les modèles :

- **Tout relayer vers `127.0.0.1:3000`.** Le serveur Node sert le client et
  renvoie `index.html` pour les routes du client (`/album/…`, `/artist/…`) :
  pas besoin de `root` ni de `try_files`.
- **WebSocket sur `/socket.io/`** (notifications) : `proxy_http_version 1.1`
  et les en-têtes `Upgrade` / `Connection: upgrade`.
- **Flux audio `/api/audio/stream/` sans tampon** (`proxy_buffering off`) :
  la lecture démarre tout de suite et l'avance rapide (requêtes `Range`)
  atteint le serveur.
- **Envois** : `client_max_body_size` assez grand (2 Go dans le modèle) et
  `proxy_request_buffering off` sur `/api/audio/upload` et `/api/uploader`.
- **En-têtes `X-Forwarded-*`** : le serveur fait confiance au proxy en production.

Sans nginx, pour un essai : `make app MUSIC_DIR=…`, puis depuis votre poste
`ssh -L 3000:127.0.0.1:3000 utilisateur@serveur` et `http://localhost:3000`.

## Données et sauvegarde

| Volume | Contenu |
|---|---|
| `redis-data` | Base Redis : comptes, playlists, statistiques, réglages et sessions (on reste connecté après un redémarrage). |
| `ongaku-users` | Avatars, fonds d'écran et fichiers envoyés par les utilisateurs. |
| `ongaku-covers` | Photos d'artistes enregistrées. |

```sh
docker compose exec redis redis-cli BGSAVE
docker run --rm -v ongaku-angular_redis-data:/data -v ongaku-angular_ongaku-users:/users \
  -v "$PWD":/backup alpine tar czf /backup/ongaku-$(date +%F).tar.gz /data /users
```

Le préfixe des volumes (`ongaku-angular_`) est le nom du dossier du projet :
vérifiez-le avec `docker volume ls`.

## Dépannage

| Symptôme | Piste |
|---|---|
| `502 Bad Gateway` | Le conteneur ne répond pas : `make status`, `make logs`. |
| Bibliothèque vide | Vérifier `MUSIC_DIR` et les droits pour l'uid 1000 : `docker compose exec ongaku ls /music`. |
| `413 Request Entity Too Large` à l'envoi | Augmenter `client_max_body_size` dans le modèle, puis `sudo make nginx`. |
| `nginx does not load …` | `nginx.conf` n'inclut pas le dossier du site : ajouter l'`include` dans son bloc `http`. |
| certbot échoue | Le DNS du domaine doit pointer sur le serveur et le port 80 être ouvert. |
| `NOAUTH Authentication required` dans les journaux | Le mot de passe Redis de `config/application.yml` et celui de `.env` diffèrent : relancer `make app`. |

## Limites de l'image

- Les dépendances optionnelles ne sont pas installées : `nodegit` (mise à jour
  depuis Git, désactivée), `node-wave` (formes d'onde des morceaux, dépôt
  privé) et `identicon` (avatars générés). L'application fonctionne sans.
- Les formats que les navigateurs ne lisent pas sont convertis à la volée par
  ffmpeg, inclus dans l'image ; l'avance rapide n'est pas possible pendant ces
  conversions.
