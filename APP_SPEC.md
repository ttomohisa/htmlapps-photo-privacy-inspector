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
- JPEG and WebP Privacy Clean retain only a newly generated minimal EXIF Orientation tag (values 2–8) when needed; all original EXIF is discarded. This preserves display orientation in viewers that support it without recompressing pixels. PNG eXIf is removed entirely, including orientation.
- WebP Privacy Clean removes XMP, rebuilds the optional Orientation-only EXIF chunk, and updates both metadata flags while preserving image, color and animation chunks.
- Zero-valued JFIF thumbnail width/height describe absence and are not sensitive tags. Real thumbnail entries and positive dimensions remain classified and reported, including after cleaning.
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
- A concise sharing headline, plain drop-panel background, and green SVG exposure icons keep the interface consistent.
- Metadata search and filters stay in normal document flow on mobile so they never cover the first result.
- Photo and batch More menus dismiss on outside click or Escape; Escape restores trigger focus, and only one menu stays open.
- Batch list, current-photo detail, sticky bulk actions on mobile.
- Destructive clear uses an in-app dialog.

## 8. Photo removal and interrupted work

- “Remove this photo” opens an in-app confirmation naming the selected photo and explaining that the original file is unchanged. Cancel and Esc do not alter photos or ongoing work.
- Confirm removes only that photo and its preview URL. Keep the other photos and their analyses. Select the next photo, or the previous one when removing the last; removing the only photo returns to the empty state.
- Confirmed removal and Clear All invalidate pending imports, clean verification and batch work, reset progress, close obsolete dialogs and discard transient clean results. Old success/error callbacks must not restore photos, results, names, dialogs or downloads, or alter a newer operation.
- Interrupted batches never download a partial ZIP. This differs from ordinary per-file verification failure, which still excludes only failed outputs and reports their names.
- Superseded imports discard and revoke late preview URLs. Repeated single cleans and batches publish only their latest operation; dismissing the clean dialog cancels its pending verification.

## 9. Embedded AI and provenance records

- Inspect supported JPEG, PNG and WebP structures and parsed metadata for AI generation/editing declarations, generation settings and recognized tool records.
- Report C2PA provenance separately: its presence is not evidence of AI generation, and signatures are not cryptographically verified.
- Absence of records does not prove real photography. Do not classify image pixels or make authenticity claims. Unknown formats and damaged records must not be presented as an absence.
- Privacy Clean removes recognized C2PA containers as well as existing EXIF/XMP/text metadata without recompressing image payloads. Reinspect both individual and batch output and block unverified saving.
- Explain before cleaning that C2PA signatures, provenance and edit history are lost. Pixel-based invisible watermarks (including SynthID) are not guaranteed to be removed. Original files remain unchanged.
- Include before/after record findings in JSON reports. The module is inlined at build time; the release remains one HTML file with no network connections.
