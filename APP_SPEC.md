# APP_SPEC.md

## 1. Product identity

- **Name:** Photo Privacy Inspector
- **Purpose:** Reveal privacy-sensitive metadata in photos, explain what it can expose, and create verified share-safe copies locally.
- **Primary users:** Anyone sharing phone/camera photos publicly, especially photos from home, travel, work sites, children, events, or confidential projects.
- **Release artifacts:** `dist/index.html` and `dist/index.self-extract.html`

## 2. Differentiated outcome

The app is not only an EXIF viewer. It converts hidden fields into an exposure score and plain-language privacy findings, offers batch triage, creates clean copies, and re-inspects the result so the user can verify what actually disappeared.

## 3. Core flow

1. Drop one or many photos, or paste an image.
2. Parse EXIF/GPS/IPTC/XMP/ICC/file metadata locally.
3. Prioritize exact location, timestamps, serial IDs, identities, unique IDs, comments, software, device model, and thumbnails.
4. Show an exposure score and pre-share checklist.
5. Optionally create a lossless Privacy Clean copy (JPEG/PNG/WebP) or a Canvas-based Deep Clean copy.
6. Re-scan the cleaned bytes and show before/after verification.
7. Download the clean image, JSON report, batch report, or ZIP of cleaned files.
8. If metadata parsing fails, show an unavailable-analysis error naming the file and do not assign a risk score. Failed output verification prevents successful download/verification; batch ZIPs omit outputs that cannot be parsed and identify the skipped files.

## 4. Privacy and network

- Photo bytes remain in browser memory.
- No runtime network access, analytics, telemetry, accounts, uploads, or map tiles.
- GPS visualization uses a local coordinate grid only.
- Built artifacts must contain `connect-src 'none'`.

## 5. Cleaning behavior

- JPEG Privacy Clean removes APP1 (EXIF/XMP), APP13 (IPTC/Photoshop), APP12 and COM segments while preserving encoded image scan data and common color/application segments.
- PNG Privacy Clean removes eXIf, tEXt, zTXt, iTXt and tIME chunks.
- WebP Privacy Clean removes EXIF/XMP chunks and clears their VP8X flags.
- Deep Clean redraws the image through Canvas; it can change compression and file bytes.
- Every clean result is parsed again and the remaining sensitive metadata is shown.

## 6. Non-goals

- Face/address/plate detection in visible pixels.
- Forensic authenticity or C2PA verification.
- Metadata editing/writing.
- Cloud backup or sharing.

## 7. UX

- Mobile-first from 320px.
- Light-only UI matching `htmlapps-template`.
- Japanese/English.
- Batch list, current-photo detail, sticky bulk actions on mobile.
- Destructive clear uses an in-app dialog.
