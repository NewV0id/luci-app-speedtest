# Changelog

Notable changes to this project. Newest first.

## 1.0.1

- Detect the WireGuard interface automatically when the configured `WG_IFACE`
  has no IPv4 address. The name varies across firmware (GL.iNet uses
  `wgclient1` on some builds and `wgclient2` on others), which made VPN tests
  fail out of the box on affected routers. `WG_IFACE` is now an override for
  multi-tunnel setups rather than something you must get right.
- Report a missing VPN address as what it is, instead of "server unreachable" —
  in that case the test never ran at all.

## 1.0.0

First public release.

- Broadband and WireGuard speedtests run from a **Status → Speedtest** LuCI page
- Persistent CSV history with charts for speed, latency/jitter and packet loss
- Failures recorded as rows rather than silently dropped, so a gap in the chart
  always has a stated reason
- All endpoints require a valid LuCI session
- Chart.js bundled locally, so charts render when the WAN or VPN is down
- Settings in `/etc/speedtest.conf`, preserved across upgrades
- Ships as `.ipk` (OpenWrt 21.02–24.10) and `.apk` (25.12+) from one source tree
