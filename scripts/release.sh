#!/bin/sh

# exit on error
set -e

if [ $# -eq 0 ]; then
  echo 'Please specify package to release'
  exit 0
fi

doPatch=false
if [ "$2" = "--patch" ]; then
  doPatch=true
fi

release_package() {
  cd $1
  echo $1

  if [ -f "webpack.config.release.js" ]; then
    node ../../node_modules/webpack/bin/webpack --config webpack.config.release.js
    echo "building webpack"
  fi

  # prune and shrinkwrap before to detect errors before patching version
  npm prune
  npm shrinkwrap --dev --loglevel=error

  if [ "$doPatch" = true ]; then
    npm version patch
    # catch up to patch
    npm shrinkwrap --dev --loglevel=error
  fi

  npm publish --tag=latest
  cd ../..
}

release_tools() {
  echo "Tools"
  cd apps/tools/.flint

  # prune and shrinkwrap before to detect errors before patching version
  npm prune
  npm shrinkwrap --dev --loglevel=error

  if [ "$doPatch" = true ]; then
    npm version patch
    # catch up to patch
    npm shrinkwrap --dev --loglevel=error
  fi

	npm publish --tag=latest
  cd ../../..
}

release_all() {
  for pkg in packages/*; do
    [ -d "${pkg}" ] || continue # if not a directory, skip
    release_package ${pkg}
  done
  release_tools
}

if [ $1 = "all" ]; then
  release_all
elif [ $1 = "tools" ]; then
  release_tools
else
  release_package packages/$1
fi