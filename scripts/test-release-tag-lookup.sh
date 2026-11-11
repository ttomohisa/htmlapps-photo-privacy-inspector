#!/usr/bin/env bash
set -euo pipefail
script="scripts/release-tag-sha.sh"
export GITHUB_REPOSITORY="ttomohisa/htmlapps-photo-privacy-inspector"
expected="2ebb3fca8fe7672b70d5ccb1071b00fccb7472db"
export expected

# Inherited shell function mocks the exact success and failure shapes from gh api.
gh() {
  [[ "$1" == "api" ]] || return 2
  case "$MOCK_CASE" in
    missing-json)
      printf '%s\n' '{"message":"Not Found","documentation_url":"https://docs.github.com/rest/git/refs#get-a-reference","status":"404"}'
      return 1
      ;;
    missing-http)
      printf 'gh: Not Found (HTTP 404)\n' >&2
      return 1
      ;;
    present)
      printf '%s\n' "$expected"
      return 0
      ;;
    denied)
      printf '%s\n' '{"message":"Resource not accessible by integration","status":"403"}'
      return 1
      ;;
    malformed)
      printf 'unexpected output\n'
      return 0
      ;;
    *)
      printf 'Unknown mock case\n' >&2
      return 2
      ;;
  esac
}
export -f gh

for case_name in missing-json missing-http; do
  actual="$(MOCK_CASE="$case_name" bash "$script" v1.1.0)"
  [[ -z "$actual" ]] || { echo "FAIL $case_name: lookup must return empty" >&2; exit 1; }
done
actual="$(MOCK_CASE=present bash "$script" v1.1.0)"
[[ "$actual" == "$expected" ]] || { echo "FAIL present: returned $actual" >&2; exit 1; }
for case_name in denied malformed; do
  if MOCK_CASE="$case_name" bash "$script" v1.1.0 >/dev/null 2>&1; then
    echo "FAIL $case_name: must stop release instead of assuming missing tag" >&2
    exit 1
  fi
done
if MOCK_CASE=missing-json bash "$script" not-a-tag >/dev/null 2>&1; then
  echo "FAIL invalid version tag should be rejected" >&2
  exit 1
fi
echo "PASS release tag lookup: HTTP 404, valid SHA, denied access and invalid values"
