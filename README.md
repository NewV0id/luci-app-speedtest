# luci-app-speedtest

A LuCI dashboard for OpenWrt that runs the Ookla Speedtest CLI against your
broadband connection **and** through a WireGuard tunnel, logs every result to
CSV, and plots the history — download, upload, latency, jitter and packet loss —
so you can see what your line actually does over time rather than at the moment
you happened to run a test.

Adds a **Status → Speedtest** page. No other LuCI pages are modified.

---

## Features

- One-click broadband and WireGuard tests from the LuCI status page
- Persistent CSV history with charts for speed, latency/jitter and packet loss
- Separate history and statistics for each connection, side by side
- Live progress ring while a test runs, with a server-side watchdog so a hung
  test can't wedge the UI
- Failures are recorded, not silently dropped — timeouts and errors appear as
  rows with the server that was tried, so a gap in the chart always has a reason
- Chart.js is bundled locally, so the dashboard still renders when the WAN or
  the VPN is down — which is exactly when you want to look at it
- All endpoints require a valid LuCI session

## Requirements

| | |
|---|---|
| OpenWrt | 21.02 – 24.10 (`.ipk`) or 25.12+ (`.apk`) |
| Web server | `uhttpd` (the OpenWrt default) |
| Packages | `luci-base`, `rpcd`, `ubus` |
| Ookla CLI | installed separately at `/root/speedtest` — see below |
| WireGuard | optional; only needed for the VPN half of the dashboard |

Architecture-independent — the package is all shell, JavaScript and JSON.

**Tested only on GL.iNet routers** — one running OpenWrt 21.02 (`.ipk`) and one
running 25.12 (`.apk`). It uses nothing GL.iNet-specific and should work on any
OpenWrt build with uhttpd and LuCI, but that is reasoning rather than evidence.
Reports from other hardware are welcome.

## Installing

Download the file matching your OpenWrt version from
[Releases](../../releases), copy it to the router, and install:

```sh
# OpenWrt 21.02 - 24.10
opkg install ./luci-app-speedtest_1.0.0_all.ipk

# OpenWrt 25.12 and newer
apk add --allow-untrusted ./luci-app-speedtest-1.0.0-r1.apk
```

`--allow-untrusted` is needed because the package isn't signed with a key your
router trusts. Inspect it first if you'd rather not take that on faith.

### Install the Ookla CLI

The package deliberately doesn't bundle the Speedtest binary — it's
closed-source, architecture-specific, and comes with its own licence terms.
Install it yourself, picking the right architecture:

```sh
cd /root
wget -qO st.tgz https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-aarch64.tgz
tar -xzf st.tgz speedtest
chmod +x /root/speedtest
rm st.tgz

# accept the licence once, interactively
HOME=/root /root/speedtest --accept-license --accept-gdpr
```

Swap `aarch64` for `armhf`, `x86_64` or `mips` (see
[speedtest.net/apps/cli](https://www.speedtest.net/apps/cli)). Run it once by
hand before using the dashboard — the first run prints licence text that would
otherwise confuse the parser.

## Configuration

Everything lives in `/etc/speedtest.conf`. Your edits survive package upgrades:
on `.ipk` it's registered as a conffile, and on `.apk` the package owns
`speedtest.conf.default` and only seeds the live file when it's missing.

```sh
BB_SERVERS=""              # Ookla server IDs; empty "" = auto-select
WG_SERVERS=""              # same, for tests through the tunnel
WG_IFACE="wgclient1"       # your WireGuard interface name
MAX_ROWS=200               # CSV rows kept per connection
MAX_LOG_LINES=200
BB_TIMEOUT=90              # seconds before a broadband test is killed
WG_TIMEOUT=120
ST_AUTH=1                  # 1 = require a LuCI session on all endpoints
```

Both server lists default to empty, which lets the CLI pick the nearest server
automatically. That's the right choice for most setups. Pinning IDs is worth
doing if auto-selection keeps landing on a congested server, or if you want a
consistent reference point across months of history — one ID is picked at random
per run, which spreads load and stops a single busy server from skewing the
picture. List candidates with:

```sh
HOME=/root /root/speedtest --servers   # older builds: -L
```

Note that `--servers` only lists the closest handful. A server missing from that
list may still be reachable and fast, so it's worth testing IDs directly before
ruling them out.

For the VPN half, auto-selection is usually the better choice regardless: VPN
providers often block or throttle specific Ookla endpoints, and a pinned ID that
stops responding shows up as repeated timeouts rather than an obvious error.

After editing, reload the page — the config is read at the start of each test.

## How it works

The LuCI view is a client-side JavaScript page that talks to three CGI scripts
under `/www/cgi-bin`. Those scripts validate the caller's LuCI session, then
hand off to `speedtest-log.sh`, which runs the Ookla binary, parses its CSV
output and appends a row.

```
LuCI view (speedtest.js)
    │  fetch() + session token
    ▼
/www/cgi-bin/{run-speedtest,clear-results,get-results}.cgi
    │  st-common.sh: session check, POST enforcement, input whitelisting
    ▼
/root/website/speedtest-log.sh
    │  named FIFO (the CLI exits via SIGABRT after printing)
    ▼
/root/website/speedtest-{,wg-}results.csv
```

A few implementation details that are less obvious than they look:

- **The Ookla CLI aborts via `SIGABRT` after printing its result**, so naive
  command substitution or a plain redirect loses the output. Results are drained
  through a named FIFO with an explicit reader.
- **Its throughput fields are bytes per second**, not bits — divide by 125000
  for Mbps, not 1000000.
- **Tests outlive the CGI process** that started them. uhttpd reaps CGI children
  quickly, so the worker is detached and tracked through a lock file, with the
  Ookla process's own PID recorded separately so a stale lock can reap it.
- **Results are never served from `/www` directly.** They're read back through
  an authenticated endpoint, so your history isn't world-readable on the LAN.

### Authentication

All three endpoints require a valid LuCI session, checked with
`ubus call session get`. The two that change state also require `POST`.

Getting a session token to a bare CGI script under uhttpd is more awkward than
it looks: LuCI's `sysauth` cookie is scoped to `Path=/cgi-bin/luci` and marked
`HttpOnly`, so it is neither sent to sibling scripts nor readable from page
JavaScript; and uhttpd forwards only a fixed whitelist of request headers to CGI
processes, so a custom header never arrives. The view therefore sends the
session id as `Authorization: Bearer` with a `SameSite=Strict` cookie as a
second channel — both are on uhttpd's whitelist, and both keep the CSRF
protection that the original cookie provided.

If session validation misbehaves on your build, `ST_AUTH=0` disables it. Check
`/tmp/speedtest-cgi.log` first — it records why each rejection happened and
which channel the token arrived on.

## Building from source

```sh
git clone https://github.com/YOUR-USERNAME/luci-app-speedtest.git
cd luci-app-speedtest
./build.sh          # or: ./build.sh ipk   /   ./build.sh apk
```

Both packages land in `dist/`. The `.apk` build needs `python3`; the `.ipk`
build needs only a POSIX shell and `tar`. Builds are reproducible — timestamps
are pinned to `SOURCE_DATE_EPOCH`, so the same source always yields
byte-identical output.

To build with your own server IDs baked in, so a fresh install comes up
pre-configured:

```sh
ST_LOCAL_CONF=~/speedtest-local.conf ./build.sh
```

Keep that file **outside** the repository. `.gitignore` covers the obvious
names, but GitHub's web upload page ignores `.gitignore` entirely — anything
sitting inside the folder when you drag it in gets published.

```
src/                    files as installed on the router
packaging/ipk/          control, conffiles, postinst, prerm
packaging/apk/          post-install, post-upgrade, pre-deinstall
tools/mkapk.py          apk writer (format notes are in the docstring)
```

Both formats install the same `src/` tree; only the config-preservation
mechanism differs, because apk has no direct equivalent of opkg's `conffiles`.

The apk lifecycle scripts are stored without their leading dot and renamed
during the build. apk requires them dotted inside the package, but hidden files
are invisible to most file pickers and get dropped by GitHub's web uploader,
which produces a package that installs without ever running its scripts.

## Troubleshooting

**Buttons do nothing, or "session may have expired"** — hard-reload the page
(`Ctrl-Shift-R`); a cached copy of `speedtest.js` won't send the session token.
Then check `/tmp/speedtest-cgi.log`.

**Every test records `ERROR`** — check the CLI works standalone:
`HOME=/root /root/speedtest --accept-license --accept-gdpr`. Nine times out of
ten the licence hasn't been accepted, or the binary is the wrong architecture.

**VPN tests record `ERROR [no-wg-ip]`** — the interface named in `WG_IFACE`
has no IPv4 address. Confirm with `ip -4 addr show wgclient1`.

**VPN tests time out against specific servers** — many VPN providers block or
throttle particular Ookla endpoints. Set `WG_SERVERS=""` to auto-select.

**Charts are blank but the table has rows** — the browser failed to load
Chart.js. It's bundled at
`/www/luci-static/resources/speedtest/chart.umd.min.js`; check it exists.

Logs: `/tmp/speedtest-cgi.log` and `/tmp/speedtest-wg-cgi.log`.
Data: `/root/website/speedtest-results.csv` and `speedtest-wg-results.csv`.
Both CSVs survive package removal.

## Licence

GPL-2.0. Chart.js is bundled under the MIT licence.

The Ookla Speedtest CLI is **not** included and is not covered by this licence —
it's proprietary software with its own terms, which you accept when you run it.

<img width="879" height="1188" alt="Screenshot 2026-08-24 162255" src="https://github.com/user-attachments/assets/9b7a02a4-1256-4928-b108-04585244e186" />

