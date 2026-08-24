# Shared helpers for luci-app-speedtest CGI endpoints.
# Sourced, not executed.

ST_CONF="/etc/speedtest.conf"
[ -r "$ST_CONF" ] && . "$ST_CONF"

st_headers() {
    echo "Content-Type: application/json"
    echo "Cache-Control: no-store"
    echo ""
}

st_deny() {
    printf '{"status":"error","message":"%s"}\n' "$1"
    exit 0
}

# A LuCI session id is exactly 32 hex characters.
st_valid_sid() {
    [ ${#1} -eq 32 ] || return 1
    case "$1" in
        *[!a-fA-F0-9]*) return 1 ;;
    esac
    return 0
}

# Pull a named cookie value out of the request.
st_cookie() {
    printf '%s' "$HTTP_COOKIE" | tr ';' '\n' | \
        sed -n "s/^[[:space:]]*$1=\\([a-fA-F0-9]\\{32\\}\\)[[:space:]]*\$/\\1/p" | head -n 1
}

# Locate the caller's LuCI session id, setting ST_SID_SRC to the channel used.
#
# uhttpd exports only a fixed whitelist of request headers to CGI processes
# (proc_header_env[] in uhttpd/proc.c) - a custom header such as X-LuCI-Session
# is silently discarded and never reaches us. Authorization and Cookie are on
# that list, so those are the only two channels available.
#
# LuCI's own sysauth cookie cannot be used on its own: it is scoped to
# Path=/cgi-bin/luci and marked HttpOnly, so the browser never sends it to a
# sibling script and page JS cannot read it either. The view therefore sets a
# separate st_sid cookie scoped to /cgi-bin, and also sends the token as a
# bearer credential. Both are SameSite=Strict / preflight-protected, so the
# CSRF property the cookie check was meant to provide is preserved.
st_locate_sid() {
    _sid=$(printf '%s' "$HTTP_AUTHORIZATION" | sed -n 's/^[Bb]earer[[:space:]]\{1,\}\([a-fA-F0-9]\{32\}\)[[:space:]]*$/\1/p')
    if [ -n "$_sid" ]; then ST_SID_SRC="authorization"; return 0; fi

    _sid=$(st_cookie st_sid)
    if [ -n "$_sid" ]; then ST_SID_SRC="st_sid cookie"; return 0; fi

    _sid=$(st_cookie 'sysauth[[:alnum:]_]*')
    if [ -n "$_sid" ]; then ST_SID_SRC="sysauth cookie"; return 0; fi

    ST_SID_SRC="none"
    return 1
}

# Session check as a predicate: returns 0 when the caller holds a valid,
# unexpired LuCI session, otherwise 1 with the reason in $ST_AUTH_ERR.
# Set ST_AUTH=0 in /etc/speedtest.conf to bypass.
st_authorised() {
    ST_AUTH_ERR=""
    ST_SID_SRC="none"
    [ "${ST_AUTH:-1}" = "1" ] || return 0

    if ! command -v ubus >/dev/null 2>&1; then
        ST_AUTH_ERR="Session check unavailable (ubus missing)"
    else
        if ! st_locate_sid; then
            ST_AUTH_ERR="No session token presented - reload the Speedtest page"
        elif ! st_valid_sid "$_sid"; then
            ST_AUTH_ERR="Malformed session token"
        elif [ "$_sid" = "00000000000000000000000000000000" ]; then
            # LuCI's placeholder for "not logged in".
            ST_AUTH_ERR="Not logged in to LuCI"
        elif ! ubus -S call session get "{\"ubus_rpc_session\":\"$_sid\"}" 2>/dev/null | grep -q '"values"'; then
            ST_AUTH_ERR="Session expired - log in to LuCI again"
        fi
    fi

    [ -z "$ST_AUTH_ERR" ] && return 0
    echo "[$(date)] auth: $ST_AUTH_ERR (token source: $ST_SID_SRC)" >> "${LOG:-/dev/null}"
    return 1
}

# Fail-closed wrapper for the JSON endpoints.
st_require_auth() {
    st_authorised || st_deny "$ST_AUTH_ERR"
}

# State-changing endpoints must not be reachable from a plain GET
# (an <img src=...> on any page the admin visits would otherwise fire them).
st_require_post() {
    [ "$REQUEST_METHOD" = "POST" ] || st_deny "POST required"
}

# Read a whitelisted key=value pair out of QUERY_STRING.
# Anchored so that e.g. "foo_type=wg" cannot satisfy a lookup for "type".
st_query() {
    printf '%s' "$QUERY_STRING" | tr '&' '\n' | \
        sed -n "s/^$1=\([A-Za-z0-9_-]*\)\$/\1/p" | head -n 1
}
