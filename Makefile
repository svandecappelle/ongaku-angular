#### SYSTEM COMMAND ####
NODE=node
NPM=npm
GIT=git
CD=cd
ECHO=@echo
TAR=tar -zcvf
DEL=rm -rf
MAKE=make
MV=mv
RSYNC=rsync -av --delete --exclude=".git"

CERTIFICATE_PASS=application
CERTIFICATE_INFO='/FR=localhost/O=OVH./C=FR'
CERTIFICATE_KEY=server/certificate/server.key
CERTIFICATE_TMP_KEY=$(CERTIFICATE_KEY).tmp
CERTIFICATE_CSR_FILE=server/certificate/server.csr
CERTIFICATE_CRT_FILE=server/certificate/server.crt

#### FOLDERS ####
NODE_DIR=node_modules
DIST_DIR=client/dist

#### FILES ####
DIST_TAR=dist.tar.gz

#### MACRO ####
NAME=`grep -Po '(?<="name": ")[^"]*' package.json`

help:
	$(ECHO) "$(NAME)"
	$(ECHO) "_____________________________"
	$(ECHO) " -- AVAILABLE TARGETS --"
	$(ECHO) "make clean                                                         => clean the sources"
	$(ECHO) "make gen-certificate                                               => generate certificate"
	$(ECHO) "make install                                                       => install deps"
	$(ECHO) "make dev                                                           => launch the project (development)"
	$(ECHO) "make build                                                         => build the project and generate dist"
	$(ECHO) "_____________________________"

clean:
	$(DEL) $(NODE_DIR)
	$(DEL) $(DIST_DIR)
	$(DEL) $(DIST_TAR)

gen-certificate:
	mkdir -p server/certificate
	openssl genrsa -des3 -passout pass:$(CERTIFICATE_PASS) -out $(CERTIFICATE_KEY) 1024
	openssl req -passin pass:$(CERTIFICATE_PASS) -new -key $(CERTIFICATE_KEY) -out $(CERTIFICATE_CSR_FILE) -subj $(CERTIFICATE_INFO)
	cp $(CERTIFICATE_KEY) $(CERTIFICATE_TMP_KEY)
	openssl rsa -passin pass:$(CERTIFICATE_PASS) -in $(CERTIFICATE_TMP_KEY) -out $(CERTIFICATE_KEY)
	openssl x509 -req -days 365 -in $(CERTIFICATE_CSR_FILE) -signkey $(CERTIFICATE_KEY) -out $(CERTIFICATE_CRT_FILE)
	rm $(CERTIFICATE_TMP_KEY)

install:
	$(NPM) install

build: install
	$(CD) client && npm run build
	$(TAR) $(DIST_TAR) client/dist server package.json LICENCE README.md

dev: install
	$(NPM) run watch

#############
# Sub tasks #
#############

$(NODE_DIR)/%:
	$(MAKE) install
