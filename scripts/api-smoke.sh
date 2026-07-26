#!/usr/bin/env bash
#
# End-to-end smoke test for the automation API (docs/API.md).
#
# Walks the full lifecycle — create project, add an image, read it back, create
# and revoke a share link, check the error cases — then deletes the project it
# created. Safe to run against production: it cleans up after itself.
#
#   ./scripts/api-smoke.sh                                  # production
#   BASE=http://127.0.0.1:3000 ./scripts/api-smoke.sh       # local dev server
#
# API_KEY defaults to the first key in .env (MARKUP_API_KEYS); override by
# exporting API_KEY yourself.

set -euo pipefail

BASE="${BASE:-https://revision.exposeprofi.de}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${API_KEY:-}" && -f "$ROOT/.env" ]]; then
  API_KEY=$(grep '^MARKUP_API_KEYS=' "$ROOT/.env" | cut -d= -f2 | cut -d, -f1)
fi
if [[ -z "${API_KEY:-}" ]]; then
  echo "API_KEY is not set and no MARKUP_API_KEYS found in $ROOT/.env" >&2
  exit 1
fi

H=(-H "Authorization: Bearer $API_KEY")
J=(-H "Content-Type: application/json")
jqp() { python3 -m json.tool; }

echo "Target: $BASE"
echo

echo "── 1. CREATE project (JSON + image URLs) ─────────────────────────"
RESP=$(curl -sS -X POST "$BASE/api/v1/projects" "${H[@]}" "${J[@]}" -d '{
  "name": "API smoke '"$RANDOM"'",
  "comment": "Full endpoint sweep",
  "images": [
    { "url": "https://placehold.co/1600x1000.png", "name": "Aussenperspektive 1" },
    { "url": "https://picsum.photos/1600/1000",   "name": "Innenperspektive 2" }
  ],
  "share": { "permissions": "comment" }
}')
echo "$RESP" | jqp
PID=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["project"]["id"])')
PNAME=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["project"]["name"])')

# Always clean up, even if a later step fails.
cleanup() {
  echo
  echo "── CLEANUP ───────────────────────────────────────────────────────"
  curl -sS -X DELETE "${H[@]}" "$BASE/api/v1/projects/$PID" | jqp || true
}
trap cleanup EXIT

echo; echo "── 2. ADD an image to that project ───────────────────────────────"
# Same shape the n8n "Upload one image" node sends, with url set to the
# SharePoint/Graph @microsoft.graph.downloadUrl.
curl -sS -X POST "$BASE/api/v1/projects/$PID/images" "${H[@]}" "${J[@]}" -d '{
  "images": [ { "url": "https://placehold.co/1200x900.png", "name": "Nachtrag 3" } ]
}' | jqp

echo; echo "── 3. GET project details ────────────────────────────────────────"
curl -sS "${H[@]}" "$BASE/api/v1/projects/$PID" | jqp

echo; echo "── 4. LIST projects ──────────────────────────────────────────────"
curl -sS "${H[@]}" "$BASE/api/v1/projects?page=1&search=API%20smoke" | jqp

echo; echo "── 5. CREATE a second share link (draw + comment) ────────────────"
SL=$(curl -sS -X POST "$BASE/api/v1/share-links" "${H[@]}" "${J[@]}" -d '{
  "projectId": "'"$PID"'",
  "permissions": "draw_and_comment",
  "createdBy": "smoke-test"
}')
echo "$SL" | jqp
SLID=$(echo "$SL" | python3 -c 'import sys,json;print(json.load(sys.stdin)["shareLink"]["id"])')

echo; echo "── 6. LIST share links ───────────────────────────────────────────"
curl -sS "${H[@]}" "$BASE/api/v1/share-links?projectId=$PID" | jqp

echo; echo "── 7. READ comments (empty until a client pins something) ────────"
curl -sS "${H[@]}" "$BASE/api/v1/projects/$PID/comments?status=active" | jqp

echo; echo "── 8. REVOKE the second share link ───────────────────────────────"
curl -sS -X DELETE "${H[@]}" "$BASE/api/v1/share-links/$SLID" | jqp

echo; echo "── 9. ERROR CASES ────────────────────────────────────────────────"
echo -n "-- bad key:            "
curl -s -o /dev/null -w "%{http_code} (expect 401)\n" \
  -H "Authorization: Bearer nope" "$BASE/api/v1/projects"

echo -n "-- duplicate name:     "
curl -s -o /dev/null -w "%{http_code} (expect 409)\n" \
  -X POST "$BASE/api/v1/projects" "${H[@]}" "${J[@]}" -d '{"name":"'"$PNAME"'"}'

echo -n "-- unreachable image:  "
curl -s -o /dev/null -w "%{http_code} (expect 422, project rolled back)\n" \
  -X POST "$BASE/api/v1/projects" "${H[@]}" "${J[@]}" \
  -d '{"name":"fail probe '"$RANDOM"'","images":[{"url":"https://example.com/nope.png"}]}'

echo -n "-- empty multipart:    "
EMPTY=$(mktemp /tmp/api-smoke-empty-XXXXXX.jpg)
curl -s -o /dev/null -w "%{http_code} (expect 422 empty_files)\n" \
  -X POST "$BASE/api/v1/projects" "${H[@]}" \
  -F "name=empty probe $RANDOM" -F "images=@$EMPTY"
rm -f "$EMPTY"
