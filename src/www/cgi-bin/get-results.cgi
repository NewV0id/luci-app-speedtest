#!/bin/sh
# Serves both result CSVs behind a LuCI session check, replacing the
# world-readable /www symlinks the earlier versions relied on.
#
# Both files come back in one response so a refresh costs one fork rather
# than two. Read-only, so GET is fine: an attacker can trigger the request
# cross-origin but cannot read the reply.
LOG="/tmp/speedtest-cgi.log"
. /root/website/st-common.sh

if ! st_authorised; then
    echo "Status: 403 Forbidden"
    echo "Content-Type: application/json"
    echo "Cache-Control: no-store"
    echo ""
    printf '{"status":"error","message":"%s"}\n' "$ST_AUTH_ERR"
    exit 0
fi

echo "Content-Type: text/plain; charset=utf-8"
echo "Cache-Control: no-store"
echo ""

HEADER="timestamp,server,latency_ms,jitter_ms,packet_loss,download_mbps,upload_mbps,result_url"

emit() {  # emit <marker> <file>
    echo "$1"
    if [ -f "$2" ]; then
        cat "$2"
    else
        echo "$HEADER"
    fi
}

emit '#ST#BB#' /root/website/speedtest-results.csv
emit '#ST#WG#' /root/website/speedtest-wg-results.csv
