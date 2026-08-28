#!/usr/bin/env python3
"""Build an OpenWrt .apk (apk-tools tar-segment layout).

Layout: concatenated gzip streams.
  segment 1 = control tar  (.PKGINFO + lifecycle scripts), NO end-of-archive
              marker - apk stops parsing at the first EOA, so a terminated
              control segment hides the data segment entirely.
  segment 2 = data tar, normally terminated, every regular file carrying a
              PAX header record APK-TOOLS.checksum.SHA1.

.PKGINFO must carry `datahash`: the SHA-256 of the *compressed* data segment,
hex encoded. It is not optional - apk's install path (APK_SIGN_VERIFY_AND_GENERATE
in extract_v2.c) derives the package identity from it and returns
APKE_V2PKG_FORMAT, reported as "v2 package format error", when it is absent.
Hashing the uncompressed tar instead yields "v2 package integrity error".
"""
import argparse, gzip, hashlib, io, os, sys, tarfile

PKG = "luci-app-speedtest"
MAINTAINER = "Void"
ARCH = "noarch"

DEPENDS = ["uhttpd", "luci-base", "rpcd", "ubus"]
DESC = ("Speedtest dashboard for LuCI - Ookla CLI over broadband and WireGuard, "
        "logged to CSV with download, upload, latency, jitter and packet loss charts")


def walk(root):
    """Yield (abs_path, archive_name) depth-first, dirs before their contents."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        rel = os.path.relpath(dirpath, root)
        if rel != ".":
            yield dirpath, rel
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            yield full, os.path.relpath(full, root)


def installed_size(root):
    total = 0
    for full, _ in walk(root):
        if os.path.isfile(full):
            # apk accounts in whole 512-byte blocks, like du
            total += (os.path.getsize(full) + 511) // 512 * 512
    return total


def build_data():
    buf = io.BytesIO()
    tar = tarfile.open(fileobj=buf, mode="w", format=tarfile.PAX_FORMAT)
    for full, name in walk(DATA):
        info = tar.gettarinfo(full, arcname=name)
        info.uid = info.gid = 0
        info.uname = info.gname = "root"
        info.mtime = 0
        if info.isfile():
            with open(full, "rb") as fh:
                payload = fh.read()
            info.pax_headers = {
                "APK-TOOLS.checksum.SHA1": hashlib.sha1(payload).hexdigest()
            }
            tar.addfile(info, io.BytesIO(payload))
        else:
            tar.addfile(info)
    tar.close()
    return buf.getvalue()


def build_control(size, datahash):
    lines = [
        f"pkgname = {PKG}",
        f"pkgver = {VER}",
        f"pkgdesc = {DESC}",
        "url = https://openwrt.org/",
        f"arch = {ARCH}",
        "license = GPL-2.0",
        f"origin = {PKG}",
        f"maintainer = {MAINTAINER}",
        f"size = {size}",
        f"datahash = {datahash}",
    ] + [f"depend = {d}" for d in DEPENDS]
    pkginfo = ("\n".join(lines) + "\n").encode()

    buf = io.BytesIO()
    tar = tarfile.open(fileobj=buf, mode="w", format=tarfile.USTAR_FORMAT)

    def add(name, payload, mode):
        info = tarfile.TarInfo(name)
        info.size = len(payload)
        info.mode = mode
        info.mtime = 0
        info.uid = info.gid = 0
        info.uname = info.gname = "root"
        tar.addfile(info, io.BytesIO(payload))

    add(".PKGINFO", pkginfo, 0o644)
    for script in sorted(os.listdir(CTL)):
        if not script.startswith("."):
            continue
        with open(os.path.join(CTL, script), "rb") as fh:
            add(script, fh.read(), 0o755)
    tar.close()

    raw = buf.getvalue()
    # Strip the end-of-archive marker and its padding.
    while raw.endswith(b"\0" * 512):
        raw = raw[:-512]
    return raw


def gz(payload):
    out = io.BytesIO()
    with gzip.GzipFile(fileobj=out, mode="wb", compresslevel=9, mtime=0) as fh:
        fh.write(payload)
    return out.getvalue()


def main():
    ap = argparse.ArgumentParser(description="Build an OpenWrt .apk package.")
    ap.add_argument("--version", required=True, help="e.g. 1.0.6-r1")
    ap.add_argument("--data", default="data", help="payload tree")
    ap.add_argument("--control", default="ctl", help="lifecycle scripts")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    global VER, DATA, CTL, OUT
    VER, DATA, CTL, OUT = args.version, args.data, args.control, args.output

    size = installed_size(DATA)
    data_seg = gz(build_data())
    datahash = hashlib.sha256(data_seg).hexdigest()
    ctl_seg = gz(build_control(size, datahash))
    with open(OUT, "wb") as fh:
        fh.write(ctl_seg)
        fh.write(data_seg)
    print(f"{OUT}: {os.path.getsize(OUT)} bytes "
          f"(control {len(ctl_seg)}, data {len(data_seg)}, installed {size})")
    print(f"datahash = {datahash}")


if __name__ == "__main__":
    main()
