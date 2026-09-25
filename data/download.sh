#!/usr/bin/env bash
# Fetch Natural Earth 50m country polygons (public domain).
set -euo pipefail
cd "$(dirname "$0")"

URL="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"

curl -fsSL "$URL" -o world.geojson
echo "downloaded: $(du -h world.geojson | cut -f1)"
