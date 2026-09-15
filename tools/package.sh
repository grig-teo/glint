#!/usr/bin/env bash
#
# Build a distributable Glint zip.
#
#   ./tools/package.sh
#
# Produces dist/glint-<version>.zip containing a top-level glint-<version>/
# folder. Unzipping it gives a directory with manifest.json at its root, ready
# for "Load unpacked" — or for uploading to the Chrome Web Store.
#
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(python3 -c "import json,sys; print(json.load(open('manifest.json'))['version'])")"
NAME="glint-${VERSION}"
DIST="dist"
STAGE="${DIST}/${NAME}"

# Everything the browser actually loads. Dev tooling stays out of the package.
RUNTIME=(manifest.json background.js content.js popup.html popup.css popup.js icons)

rm -rf "${STAGE}" "${DIST}/${NAME}.zip"
mkdir -p "${STAGE}"

for item in "${RUNTIME[@]}"; do
  cp -R "${item}" "${STAGE}/"
done
cp README.md LICENSE "${STAGE}/"

# -X strips extra file attributes so two runs of the same source produce
# byte-identical zips.
(cd "${DIST}" && zip -qrX "${NAME}.zip" "${NAME}" -x '*.DS_Store')

echo "packaged dist/${NAME}.zip"
echo
unzip -l "${DIST}/${NAME}.zip" | sed 's/^/  /'
