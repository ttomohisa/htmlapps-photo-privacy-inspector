# AGENTS.md

This repository is based on the current `ttomohisa/htmlapps-template`.

## Product rules

- Keep the deliverable a fully self-contained single HTML application.
- Never add runtime image upload, analytics, telemetry, tracking, remote map tiles, or CDN dependencies.
- Keep `connect-src 'none'`.
- Japanese and English UI must remain synchronized.
- Keep the light-only mobile-first design.
- Destructive clear actions must use the in-app dialog rather than `window.confirm()`.
- Update the in-app help whenever cleaning behavior or supported formats change.
- Never claim a cleaned file is safe without parsing the output and showing the verification result.
- Privacy Clean must not re-encode JPEG/PNG/WebP image payloads. Deep Clean must be clearly labeled as a re-encode.

## Build rules

- Keep exactly one copy of each template build placeholder in `src/index.template.html`.
- Dependencies stay pinned in `dependencies.json`.
- Preserve the template's portable .NET SHA-256 implementation; do not reintroduce `Get-FileHash`.
- Preserve exact-placeholder validation rather than generic `__UPPERCASE__` rejection.
- `scripts/build-self-extract.ps1` must remain ASCII-only.
