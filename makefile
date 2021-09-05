$(eval USER := $(shell whoami))
$(eval VERSION := $(shell project version))

ifeq ($(shell id -u),0)
	as_root = 
else
	as_root = sudo
endif

helm-amd64:
	@echo $(VERSION)
helm-amd64: reset lint log paths package build helm-amd64.yaml
	time nice $(as_root) vmdb2 --verbose cache/amd64.yaml --rootfs-tarball=cache/amd64.tar.gz --output=cache/amd64.img --log build.log
	$(as_root) chown ${USER}:${USER} cache/amd64.tar.gz
	$(as_root) chown ${USER}:${USER} builds/helm-${VERSION}-hoobs-amd64.deb
	dpkg-sig --sign builder builds/helm-${VERSION}-hoobs-amd64.deb
helm-amd64: reset

helm-arm64:
	@echo $(VERSION)
helm-arm64: reset lint log paths package build helm-arm64.yaml
	time nice $(as_root) vmdb2 --verbose cache/arm64.yaml --rootfs-tarball=cache/arm64.tar.gz --output=cache/arm64.img --log build.log
	$(as_root) chown ${USER}:${USER} cache/arm64.tar.gz
	$(as_root) chown ${USER}:${USER} builds/helm-${VERSION}-hoobs-arm64.deb
	dpkg-sig --sign builder builds/helm-${VERSION}-hoobs-arm64.deb
helm-arm64: reset

helm-armhf:
	@echo $(VERSION)
helm-armhf: reset lint log paths package build helm-armhf.yaml
	time nice $(as_root) vmdb2 --verbose cache/armhf.yaml --rootfs-tarball=cache/armhf.tar.gz --output=cache/armhf.img --log build.log
	$(as_root) chown ${USER}:${USER} cache/armhf.tar.gz
	$(as_root) chown ${USER}:${USER} builds/helm-${VERSION}-hoobs-armhf.deb
	dpkg-sig --sign builder builds/helm-${VERSION}-hoobs-armhf.deb
helm-armhf: reset

helm-amd64.yaml:
	cat build.yaml | \
	sed "s/__RELEASE__/bullseye/" | \
	sed "s/__VERSION__/${VERSION}/" | \
	sed "s/__SECURITY_SUITE__/bullseye-security/" | \
	sed "s/__ARCH__/amd64/" | \
	sed "s/__LINUX_IMAGE__/linux-image-amd64/" | \
	sed "s/__NODE_REPO__/$(shell project version nodesource)/" > cache/amd64.yaml
	cat control | \
	sed "s/__VERSION__/$(VERSION)/" | \
	sed "s/__DEPENDS__/nodejs (>= 14.15.0), libpam-dev, python3, make, gcc, g++/" | \
	sed "s/__ARCH__/amd64/" > cache/control

helm-arm64.yaml:
	cat build.yaml | \
	sed "s/__RELEASE__/bullseye/" | \
	sed "s/__VERSION__/${VERSION}/" | \
	sed "s/__SECURITY_SUITE__/bullseye-security/" | \
	sed "s/__ARCH__/arm64/" | \
	sed "s/__LINUX_IMAGE__/linux-image-arm64/" | \
	sed "s/__NODE_REPO__/$(shell project version nodesource)/" > cache/arm64.yaml
	cat control | \
	sed "s/__VERSION__/$(VERSION)/" | \
	sed "s/__DEPENDS__/nodejs (>= 14.15.0), libpam-dev, python3, make, gcc, g++/" | \
	sed "s/__ARCH__/arm64/" > cache/control

helm-armhf.yaml:
	cat build.yaml | \
	sed "s/__RELEASE__/bullseye/" | \
	sed "s/__VERSION__/${VERSION}/" | \
	sed "s/__SECURITY_SUITE__/bullseye-security/" | \
	sed "s/__ARCH__/armhf/" | \
	sed "s/__LINUX_IMAGE__/linux-image-armmp/" | \
	sed "s/__NODE_REPO__/$(shell project version nodesource)/" > cache/armhf.yaml
	cat control | \
	sed "s/__VERSION__/$(VERSION)/" | \
	sed "s/__DEPENDS__/nodejs (>= 14.15.0), libpam-dev, python3, make, gcc, g++/" | \
	sed "s/__ARCH__/armhf/" > cache/control

lint:
	./node_modules/.bin/eslint 'src/**/*.ts'

log:
	touch build.log
	truncate -s 0 build.log

paths:
	mkdir -p builds
	mkdir -p cache

package:
	node -e 'const pjson = require("./package.json"); delete pjson.scripts; delete pjson.devDependencies; delete pjson.engines; require("fs").writeFileSync("cache/package.json", JSON.stringify(pjson, null, 4));'

build:
	./node_modules/.bin/tsc
	cp -R var cache/helm/static

reset:
	rm -fR cache/helm
	rm -f cache/package.json
	rm -f cache/control
	rm -f cache/amd64.yaml
	rm -f cache/arm64.yaml
	rm -f cache/armhf.yaml
	rm -f cache/amd64.img
	rm -f cache/arm64.img
	rm -f cache/armhf.img

clean:
	rm -fR cache
