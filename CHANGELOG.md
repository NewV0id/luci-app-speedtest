# Changelog

Notable changes to this project. Newest first.

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
