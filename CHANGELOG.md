# Changelog

Notable changes to this project. Newest first.

## 1.0.6

- Fix the "Clear both" button rendering as solid red with invisible text on
  some themes. Seven class names (`danger`, `cancel`, `dl`, `ul`, `lat`,
  `jit`, `srv`) were generic enough for a LuCI theme's own CSS to match them.
  All are now `st-` prefixed, and the modal buttons pin their background so no
  outside rule can repaint them.

## 1.0.5

- Reclaim wasted space in the chart panels. The series legend now sits on the
  panel's title line instead of inside the canvas, where Chart.js was reserving
  about a quarter of the plot area for it. Charts that plot a single series
  drop the legend entirely, since the panel title already names it. Net effect:
  plots are ~18% taller while each panel is 16px shorter.

## 1.0.4

- Fix the action buttons disappearing behind the new header on some themes.
  The header used a `<header>` element, and LuCI themes style bare semantic
  tags for their own page chrome — on the GL.iNet theme that gave it fixed
  positioning, covering the button row. It's a plain div now, with the
  properties that matter pinned so no theme can restyle it.

## 1.0.3

- Add a page header with a title and icon. The action buttons previously sat
  flush against the theme's navigation bar with nothing identifying the page.
- Move the last-run timestamps into the header, so the button row holds only
  actions.

## 1.0.2

- Fix unreadable text on dark LuCI themes. Theme detection relied on the
  `data-darkmode` attribute, which the stock OpenWrt dark theme doesn't set, so
  the light palette (near-black text) was rendering on a dark background.
  Detection now measures the page's actual background luminance and falls back
  to the OS preference, so it works whatever the theme does, and follows a
  theme switch without a reload.
- Raise contrast of muted and secondary text. Three colours were below the
  WCAG AA 4.5:1 threshold — worst was 2.29:1 — in both palettes.

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
