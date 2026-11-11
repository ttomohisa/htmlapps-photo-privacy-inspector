#!/usr/bin/env bash
# Print a verified tag SHA, or nothing when GitHub explicitly returns HTTP 404.
# Other API failures stop release rather than being mistaken for an absent tag.
set -euo pipefail
: "$GITHUB_REPOSITORY"
tag="$1"
if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid release tag: $tag" >&2
  exit 1
fi
response=""
if response="$(gh api "repos/$GITHUB_REPOSITORY/git/ref/tags/$tag" --jq '.object.sha' 2>&1)"; then
  if [[ ! "$response" =~ ^[[:xdigit:]]{40}$ ]]; then
    echo "GitHub returned an invalid tag SHA: $response" >&2
    exit 1
  fi
  printf '%s\n' "$response"
elif grep -Eq 'HTTP[[:space:]]*404|"status"[[:space:]]*:[[:space:]]*"?404"?' <<< "$response"; then
  exit 0
else
  echo "Unable to check tag $tag: $response" >&2
  exit 1
fi
