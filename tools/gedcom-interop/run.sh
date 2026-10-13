#!/bin/sh
set -eu
GW_BIN=$(find /opt/geneweb -type f -name gwc -print -quit)
GW_DIR=$(dirname "$GW_BIN")
dpkg-query -W gramps libgmp10 libpcre2-8-0 > /work/package-versions.txt
gramps --version > /work/gramps-version.txt 2>&1
gramps -i /input/project-551.ged -e /work/gramps-5.1.5.ged > /work/gramps-roundtrip.log 2>&1
cp /tools/geneweb-demo.gw /work/geneweb-demo.gw
"$GW_DIR/gwc" -bd /work -o geneweb-native /work/geneweb-demo.gw > /work/geneweb-compile.log 2>&1
"$GW_DIR/gwb2ged" geneweb-native -charset UTF-8 -o /work/geneweb-7.1.0-beta2.ged > /work/geneweb-export.log 2>&1
"$GW_DIR/ged2gwb" /input/project-551.ged -o project-roundtrip > /work/geneweb-import.log 2>&1
"$GW_DIR/gwb2ged" project-roundtrip -charset UTF-8 -o /work/geneweb-project-roundtrip.ged > /work/geneweb-roundtrip.log 2>&1
sha256sum /work/*.ged > /work/artifact-sha256.txt
