#!/bin/sh
. /root/website/st-common.sh
st_headers

TYPE=$(st_query type)

# Whitelist: only accept known type values
case "$TYPE" in
    wg)
        LOCKFILE="/tmp/speedtest-wg.lock"
        CHILDFILE="/tmp/speedtest-wg.child"
        LOG="/tmp/speedtest-wg-cgi.log"
        SCRIPT_ARG="--wg"
        MAX_AGE=$(( ${WG_TIMEOUT:-120} + 30 ))
        ;;
    ""|bb)
        LOCKFILE="/tmp/speedtest-bb.lock"
        CHILDFILE="/tmp/speedtest-bb.child"
        LOG="/tmp/speedtest-cgi.log"
        SCRIPT_ARG=""
        MAX_AGE=$(( ${BB_TIMEOUT:-90} + 30 ))
        ;;
    *)
        st_deny "Invalid type"
        ;;
esac

st_require_post
st_require_auth

# Atomic lock creation via noclobber - two concurrent requests cannot both win.
# Line 1 holds the worker pid ("0" while it is still being spawned),
# line 2 the start time.
acquire_lock() {
    ( set -C; printf '0\n%s\n' "$(date +%s)" > "$LOCKFILE" ) 2>/dev/null
}

if ! acquire_lock; then
    PID=$(sed -n '1p' "$LOCKFILE" 2>/dev/null)
    STARTED=$(sed -n '2p' "$LOCKFILE" 2>/dev/null)
    AGE=$(( $(date +%s) - ${STARTED:-0} ))

    if [ "$AGE" -lt "$MAX_AGE" ] && { [ "$PID" = "0" ] || kill -0 "$PID" 2>/dev/null; }; then
        printf '{"status":"already_running","age":%s}\n' "$AGE"
        exit 0
    fi

    # Stale lock. Kill the worker and, separately, the speedtest binary it
    # spawned - killing the wrapper alone would orphan the child.
    [ -n "$PID" ] && [ "$PID" != "0" ] && kill "$PID" 2>/dev/null
    CHILD=$(cat "$CHILDFILE" 2>/dev/null)
    [ -n "$CHILD" ] && kill "$CHILD" 2>/dev/null
    rm -f "$LOCKFILE" "$CHILDFILE"
    echo "[$(date)] cleared stale lock pid=$PID child=$CHILD age=${AGE}s" >> "$LOG"

    acquire_lock || st_deny "Could not acquire lock"
fi

echo "[$(date)] CGI fired: type=${TYPE:-bb}" >> "$LOG"

(
    ST_CHILDFILE="$CHILDFILE" /root/website/speedtest-log.sh $SCRIPT_ARG >> "$LOG" 2>&1
    rm -f "$LOCKFILE" "$CHILDFILE"
) < /dev/null > /dev/null 2>&1 &

BGPID=$!
printf '%s\n%s\n' "$BGPID" "$(date +%s)" > "$LOCKFILE"
echo '{"status":"started"}'
