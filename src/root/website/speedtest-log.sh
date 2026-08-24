#!/bin/sh
export HOME=/root
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:/root

# ── Settings ────────────────────────────────────────────────────────────────
# Defaults below are overridden by /etc/speedtest.conf, which is a conffile
# and therefore survives package upgrades. Edit that file, not this one.
BB_SERVERS=""
WG_SERVERS=""
WG_IFACE="wgclient1"
MAX_ROWS=200
MAX_LOG_LINES=200
BB_TIMEOUT=90
WG_TIMEOUT=120
[ -r /etc/speedtest.conf ] && . /etc/speedtest.conf

HEADER="timestamp,server,latency_ms,jitter_ms,packet_loss,download_mbps,upload_mbps,result_url"

WG=0
for arg in "$@"; do
    case "$arg" in --wg) WG=1 ;; esac
done

if [ "$WG" = "1" ]; then
    DATAFILE="/root/website/speedtest-wg-results.csv"
    LOG="/tmp/speedtest-wg-cgi.log"
    TIMEOUT="$WG_TIMEOUT"
    SERVER_LIST="$WG_SERVERS"
else
    DATAFILE="/root/website/speedtest-results.csv"
    LOG="/tmp/speedtest-cgi.log"
    TIMEOUT="$BB_TIMEOUT"
    SERVER_LIST="$BB_SERVERS"
fi

mkdir -p /root/website
[ -f "$DATAFILE" ] || echo "$HEADER" > "$DATAFILE"

log()    { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
record() { echo "$(date '+%Y-%m-%d %H:%M:%S'),$1,0,0,0,0,0," >> "$DATAFILE"; }

FIFO="/tmp/st_fifo_$$"
TMPFILE="/tmp/st_out_$$"
cleanup() { rm -f "$FIFO" "$TMPFILE" "${ST_CHILDFILE:-/dev/null}"; }
trap cleanup EXIT INT TERM

# ── Bind address (VPN only) ─────────────────────────────────────────────────
BIND_OPT=""
if [ "$WG" = "1" ]; then
    # Detect the WG client's actual local IP rather than assuming a fixed
    # address - this differs per router/VPN session. Ookla's CLI fails to
    # bind if the IP passed to -i isn't assigned to a local interface.
    WG_IP=$(ip -4 addr show "$WG_IFACE" 2>/dev/null | awk '/inet /{print $2; exit}' | cut -d/ -f1)
    if [ -z "$WG_IP" ]; then
        record "ERROR [no-wg-ip]"
        log "ERROR: $WG_IFACE has no IPv4 address (interface down or not configured)"
        exit 1
    fi
    BIND_OPT="-i $WG_IP"
fi

# ── Server selection ────────────────────────────────────────────────────────
# Seeded with the pid as well as the clock, so two runs inside the same
# second don't pick the same server.
if [ -n "$SERVER_LIST" ]; then
    RANDOM_ID=$(echo "$SERVER_LIST" | tr ' ' '\n' | \
        awk -v s=$$ 'BEGIN{srand(); srand(int(rand()*100000)+s)} NF{a[++n]=$0} END{if(n) print a[int(rand()*n)+1]}')
    SERVER_OPT="--server-id=$RANDOM_ID"
else
    SERVER_OPT=""
    RANDOM_ID="auto"
fi

[ -x /root/speedtest ] || {
    record "ERROR [svr:$RANDOM_ID]"
    log "ERROR: /root/speedtest not found or not executable"
    exit 1
}

log "starting: WG=$WG server=$RANDOM_ID timeout=${TIMEOUT}s"

# ── Run ─────────────────────────────────────────────────────────────────────
# The Ookla CLI aborts via SIGABRT after printing its result, so stdout is
# drained through a FIFO with an explicit reader that we kill ourselves.
rm -f "$FIFO"
if ! mkfifo "$FIFO" 2>/dev/null; then
    record "ERROR [svr:$RANDOM_ID]"
    log "ERROR: could not create FIFO $FIFO"
    exit 1
fi

cat < "$FIFO" > "$TMPFILE" &
READER=$!

/root/speedtest \
    --format=csv --accept-license --accept-gdpr --progress=no \
    $BIND_OPT $SERVER_OPT > "$FIFO" 2>>"$LOG" &
ST_PID=$!

# Publish the child pid so the CGI can reap it when clearing a stale lock.
[ -n "$ST_CHILDFILE" ] && echo "$ST_PID" > "$ST_CHILDFILE"

# Watchdog - shell-based, no reliance on the BusyBox timeout applet.
( sleep "$TIMEOUT"
  if kill -0 "$ST_PID" 2>/dev/null; then
      log "watchdog: killing $ST_PID after ${TIMEOUT}s"
      kill "$ST_PID" 2>/dev/null
  fi
) &
WD_PID=$!

wait "$ST_PID"
EXIT=$?
kill "$WD_PID" 2>/dev/null
wait "$WD_PID" 2>/dev/null

kill "$READER" 2>/dev/null
wait "$READER" 2>/dev/null

RAW=$(cat "$TMPFILE" 2>/dev/null)
log "exit=$EXIT raw=$RAW"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [ -z "$RAW" ]; then
    if [ "$EXIT" = "143" ] || [ "$EXIT" = "137" ]; then
        record "TIMEOUT [svr:$RANDOM_ID]"
        log "ERROR: timed out after ${TIMEOUT}s (server=$RANDOM_ID)"
    else
        record "ERROR [svr:$RANDOM_ID]"
        log "ERROR: no output (exit $EXIT, server=$RANDOM_ID)"
    fi
    exit 1
fi

# ── Parse ───────────────────────────────────────────────────────────────────
# One awk pass emits each field on its own line; a here-doc feeds them into
# read. Nothing is eval'd or sourced, so a hostile server name cannot inject
# shell code, and field values may contain spaces without special handling.
# The splitter is quote-aware: commas inside quoted fields are protected
# first (US separator \037), then folded to spaces so they cannot corrupt
# our own flat CSV.
PARSED=$(printf '%s\n' "$RAW" | tr -d '\r' | awk -F',' '
NR==1 {
    line=""; inq=0; n=length($0)
    for (i = 1; i <= n; i++) {
        c = substr($0, i, 1)
        if (c == "\"") { inq = 1 - inq; continue }
        if (c == "," && inq == 1) c = "\037"
        line = line c
    }
    split(line, f, ",")
    gsub(/\037/, " ", f[1]); gsub(/\037/, "", f[10])
    printf "%s\n%s\n%s\n%s\n%.2f\n%.2f\n%s\n",
        f[1], f[3], f[4],
        (length(f[5]) ? f[5] : "N/A"),
        (f[6] + 0) / 125000, (f[7] + 0) / 125000,
        f[10]
    exit
}')

{ IFS= read -r SERVER
  IFS= read -r LATENCY
  IFS= read -r JITTER
  IFS= read -r PKT_LOSS
  IFS= read -r DL_MBPS
  IFS= read -r UL_MBPS
  IFS= read -r RESULT_URL
} <<PARSE_EOF
$PARSED
PARSE_EOF

if [ -z "$SERVER" ]; then
    record "ERROR [svr:$RANDOM_ID]"
    log "ERROR: unparseable output (server=$RANDOM_ID)"
    exit 1
fi

echo "$TIMESTAMP,$SERVER,$LATENCY,$JITTER,$PKT_LOSS,$DL_MBPS,$UL_MBPS,$RESULT_URL" >> "$DATAFILE"
log "OK: $SERVER DL=${DL_MBPS} UL=${UL_MBPS} lat=${LATENCY} loss=${PKT_LOSS}"

# ── Trim ────────────────────────────────────────────────────────────────────
trim() {  # trim <file> <max-data-rows> <keep-header:0|1>
    _lines=$(wc -l < "$1")
    _limit=$(( $2 + $3 ))
    [ "$_lines" -gt "$_limit" ] || return 0
    _tmp="$1.tmp"
    [ "$3" = "1" ] && head -n 1 "$1" > "$_tmp" || : > "$_tmp"
    tail -n "$2" "$1" >> "$_tmp"
    mv "$_tmp" "$1"
}

trim "$DATAFILE" "$MAX_ROWS" 1
trim "$LOG" "$MAX_LOG_LINES" 0
