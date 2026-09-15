#!/usr/bin/env bash
#
# Build the distributable Glint zips.
#
#   ./tools/package.sh
#
# Produces two artifacts:
#
#   dist/glint-<version>.zip        for "Load unpacked": unzipping gives a
#                                   glint-<version>/ folder with manifest.json
#                                   inside it, plus README and LICENSE.
#   dist/glint-<version>-store.zip  for the Chrome Web Store upload, which
#                                   requires manifest.json at the ROOT of the
#                                   archive and ignores documentation files.
#
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(python3 -c "import json,sys; print(json.load(open('manifest.json'))['version'])")"
NAME="glint-${VERSION}"
DIST="dist"
STAGE="${DIST}/${NAME}"

# Everything the browser actually loads. Dev tooling stays out of the package.
RUNTIME=(manifest.json background.js content.js popup.html popup.css popup.js icons)

rm -rf "${STAGE}" "${DIST}/${NAME}.zip" "${DIST}/${NAME}-store.zip"
mkdir -p "${STAGE}"

for item in "${RUNTIME[@]}"; do
  cp -R "${item}" "${STAGE}/"
done
cp README.md LICENSE "${STAGE}/"

# -X strips extra file attributes so two runs of the same source produce
# byte-identical zips.
(cd "${DIST}" && zip -qrX "${NAME}.zip" "${NAME}" -x '*.DS_Store')

# Store upload: manifest.json first-class at the archive root.
(cd "${STAGE}" && zip -qrX "../${NAME}-store.zip" "${RUNTIME[@]}" -x '*.DS_Store')

echo "packaged dist/${NAME}.zip"
unzip -l "${DIST}/${NAME}.zip" | tail -3 | sed 's/^/  /'
echo
echo "packaged dist/${NAME}-store.zip  (Chrome Web Store upload)"
unzip -l "${DIST}/${NAME}-store.zip" | sed 's/^/  /'
