#!/bin/sh
# Build luci-app-speedtest as both .ipk (opkg, OpenWrt 21.02-24.10) and
# .apk (apk-tools, OpenWrt 25.12+) from the single tree in src/.
#
#   ./build.sh          build both
#   ./build.sh ipk      build only the .ipk
#   ./build.sh apk      build only the .apk
#
# Output lands in dist/. Builds are reproducible: all timestamps are pinned
# to SOURCE_DATE_EPOCH, so rebuilding the same commit gives identical files.
set -e

VERSION=$(sed -n 's/^Version: *//p' packaging/ipk/control)
[ -n "$VERSION" ] || { echo "cannot read Version from packaging/ipk/control" >&2; exit 1; }

: "${SOURCE_DATE_EPOCH:=1756000000}"
STAMP=$(date -u -d "@$SOURCE_DATE_EPOCH" '+%Y-%m-%d %H:%M:%S' 2>/dev/null \
        || date -u -r "$SOURCE_DATE_EPOCH" '+%Y-%m-%d %H:%M:%S')

# Optional private config: if set, this file is shipped in place of the neutral
# src/etc/speedtest.conf.default, so a fresh install comes up pre-configured
# with your own server IDs. Keep it OUTSIDE the repo - see README.
#
#   ST_LOCAL_CONF=~/speedtest-local.conf ./build.sh
CONF_SRC="src/etc/speedtest.conf.default"
if [ -n "$ST_LOCAL_CONF" ]; then
    [ -r "$ST_LOCAL_CONF" ] || { echo "ST_LOCAL_CONF not readable: $ST_LOCAL_CONF" >&2; exit 1; }
    CONF_SRC="$ST_LOCAL_CONF"
    echo "==> using private config: $ST_LOCAL_CONF"
fi

BUILD=build
DIST=dist
rm -rf "$BUILD"
mkdir -p "$BUILD" "$DIST"

# ── ipk ─────────────────────────────────────────────────────────────────────
# The live config ships in the payload and is registered in conffiles, so opkg
# preserves local edits and writes any new default alongside as .conf-opkg.
build_ipk() {
    echo "==> ipk $VERSION"
    root="$BUILD/ipk"
    mkdir -p "$root/data" "$root/ctl"
    cp -a src/. "$root/data/"
    rm -f "$root/data/etc/speedtest.conf.default"
    cp "$CONF_SRC" "$root/data/etc/speedtest.conf"
    cp packaging/ipk/control packaging/ipk/conffiles \
       packaging/ipk/postinst packaging/ipk/prerm "$root/ctl/"
    sed -i "s/@VERSION@/$VERSION/g" "$root/ctl/postinst"

    size=$(du -sb "$root/data" | cut -f1)
    sed -i "s/^Installed-Size: .*/Installed-Size: $size/" "$root/ctl/control"

    chmod 755 "$root/ctl/postinst" "$root/ctl/prerm" \
              "$root/data/root/website/speedtest-log.sh" "$root/data/www/cgi-bin/"*.cgi
    chmod 644 "$root/data/root/website/st-common.sh" "$root/data/etc/speedtest.conf"

    find "$root" -exec touch -d "$STAMP" {} +
    tar czf "$root/data.tar.gz"    --owner=0 --group=0 --numeric-owner --format=gnu -C "$root/data" ./
    tar czf "$root/control.tar.gz" --owner=0 --group=0 --numeric-owner --format=gnu -C "$root/ctl" ./
    printf '2.0\n' > "$root/debian-binary"
    touch -d "$STAMP" "$root/data.tar.gz" "$root/control.tar.gz" "$root/debian-binary"

    out="$PWD/$DIST/luci-app-speedtest_${VERSION}_all.ipk"
    ( cd "$root" && tar czf "$out" --owner=0 --group=0 --numeric-owner --format=gnu \
        ./debian-binary ./data.tar.gz ./control.tar.gz )
    echo "    $DIST/luci-app-speedtest_${VERSION}_all.ipk"
}

# ── apk ─────────────────────────────────────────────────────────────────────
# apk has no conffiles equivalent that we rely on, so the package owns
# speedtest.conf.default and .post-install seeds the live file only when absent.
build_apk() {
    echo "==> apk ${VERSION}-r1"
    command -v python3 >/dev/null 2>&1 || { echo "python3 required for the apk build" >&2; exit 1; }
    root="$BUILD/apk"
    mkdir -p "$root/data" "$root/ctl"
    cp -a src/. "$root/data/"
    cp "$CONF_SRC" "$root/data/etc/speedtest.conf.default"
    # apk expects the lifecycle scripts to be dotfiles inside the package.
    # They are stored undotted in the repo: hidden files are invisible to most
    # file pickers and are silently dropped by GitHub's web upload page.
    for script in post-install post-upgrade pre-deinstall; do
        cp "packaging/apk/$script" "$root/ctl/.$script"
        sed -i "s/@VERSION@/$VERSION/g" "$root/ctl/.$script"
    done

    chmod 755 "$root/ctl/".* 2>/dev/null || true
    chmod 755 "$root/data/root/website/speedtest-log.sh" "$root/data/www/cgi-bin/"*.cgi
    chmod 644 "$root/data/root/website/st-common.sh" "$root/data/etc/speedtest.conf.default"

    find "$root" -exec touch -d "$STAMP" {} +
    ( cd "$root" && python3 "$OLDPWD/tools/mkapk.py" \
        --version "${VERSION}-r1" --data data --control ctl \
        --output "$OLDPWD/$DIST/luci-app-speedtest-${VERSION}-r1.apk" )
    echo "    $DIST/luci-app-speedtest-${VERSION}-r1.apk"
}

# Guard: an unsubstituted placeholder means a script would ship the literal
# text @VERSION@ to users. Catch it here rather than in the wild.
check_placeholders() {
    if grep -rl '@VERSION@' "$BUILD" >/dev/null 2>&1; then
        echo "ERROR: unsubstituted @VERSION@ in:" >&2
        grep -rl '@VERSION@' "$BUILD" >&2
        exit 1
    fi
}

case "${1:-both}" in
    ipk)  build_ipk; check_placeholders ;;
    apk)  build_apk; check_placeholders ;;
    both) build_ipk; build_apk; check_placeholders ;;
    *)    echo "usage: $0 [ipk|apk|both]" >&2; exit 1 ;;
esac
