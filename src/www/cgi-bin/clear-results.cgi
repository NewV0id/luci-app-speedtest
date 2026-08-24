#!/bin/sh
LOG="/tmp/speedtest-cgi.log"
. /root/website/st-common.sh
st_headers
st_require_post
st_require_auth

HEADER="timestamp,server,latency_ms,jitter_ms,packet_loss,download_mbps,upload_mbps,result_url"

# Refuse while a test is in flight - truncating mid-run would drop the result.
for LF in /tmp/speedtest-bb.lock /tmp/speedtest-wg.lock; do
    [ -f "$LF" ] || continue
    PID=$(sed -n '1p' "$LF" 2>/dev/null)
    STARTED=$(sed -n '2p' "$LF" 2>/dev/null)
    AGE=$(( $(date +%s) - ${STARTED:-0} ))
    # Ignore locks older than 5 min: those are stale, not running.
    [ "$AGE" -lt 300 ] || continue
    if [ "$PID" = "0" ] || { [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; }; then
        st_deny "A test is currently running"
    fi
done

TARGET=$(st_query target)

case "$TARGET" in
    broadband)
        echo "$HEADER" > /root/website/speedtest-results.csv
        ;;
    vpn)
        echo "$HEADER" > /root/website/speedtest-wg-results.csv
        ;;
    both)
        echo "$HEADER" > /root/website/speedtest-results.csv
        echo "$HEADER" > /root/website/speedtest-wg-results.csv
        ;;
    *)
        st_deny "Invalid target"
        ;;
esac

printf '{"status":"ok","target":"%s"}\n' "$TARGET"
