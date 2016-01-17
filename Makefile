clean:
	-rm -rf packages/*/lib

build: clean
	./scripts/build.sh

watch-core: clean
	scripts/build.sh --watch --notools

watch: clean
	scripts/build.sh --watch

bootstrap:
	# npm install
	node scripts/bootstrap.js
	scripts/build.sh

ready:
	git pull --rebase

patch: ready
	node scripts/release.js --patch

patch-tools:
	node scripts/release.js --patch tools

patch-cli:
	node scripts/release.js --patch cli

patch-runner:
	node scripts/release.js --patch runner

patch-flint.js:
	node scripts/release.js --patch flint.js

patch-transform:
	node scripts/release.js --patch transform

patch-nice-styles:
	node scripts/release.js --patch nice-styles