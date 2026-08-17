# Photo Privacy Inspector

[![GitHub Pages](https://github.com/ttomohisa/htmlapps-photo-privacy-inspector/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/htmlapps-photo-privacy-inspector/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-0ea5e9)](https://ttomohisa.github.io/htmlapps-photo-privacy-inspector/)

[日本語版 README](README.ja.md)

A privacy-focused single-HTML app that inspects GPS, capture time, device identifiers, creator fields, editing software, and other hidden photo metadata without uploading your images.

Unlike a basic EXIF viewer, it explains **what a recipient could learn**, assigns an exposure score, removes metadata into share-ready copies, and then re-scans the output to verify what was actually removed.

## 🚀 Live demo

### [Open Photo Privacy Inspector on GitHub Pages](https://ttomohisa.github.io/htmlapps-photo-privacy-inspector/)

After the initial HTML is loaded, metadata parsing, hashing, cleaning, verification, and ZIP creation run locally on your device. Selected images and GPS coordinates are not sent by the app.

## Features

- Inspect GPS, timestamps, camera/phone model, serial IDs, creator/owner, software, comments, unique IDs, and thumbnails
- Plain-language “What this photo can reveal” summary
- 0–100 exposure score and pre-share checklist
- Offline coordinate visualization with no map-tile requests
- Lossless Privacy Clean for JPEG / PNG / WebP
- Canvas-based Deep Clean fallback
- Automatic post-clean re-inspection with Before → After verification
- Batch analysis and risk triage
- Batch Privacy Clean to ZIP
- Per-photo and batch JSON privacy reports
- Local SHA-256 fingerprinting
- Metadata inspection for JPEG / PNG / WebP / TIFF / HEIC / AVIF / GIF
- Japanese / English UI
- Responsive mobile-first layout

## Quick start

Run `build-standalone.bat` on Windows. The first build downloads the exact dependency versions pinned in `dependencies.json`; later builds reuse the package cache. The generated `dist/index.html` can be opened directly with `file://` and needs no local server, Python, or Node.js.

## Cleaning modes

**Privacy Clean** edits JPEG/PNG/WebP container metadata without recompressing the encoded image payload. Common EXIF, GPS, XMP, IPTC, text, and comment metadata is removed while color-management data is preserved where possible. The output is always parsed again to report any remaining sensitive fields.

**Deep Clean** redraws the image through Canvas and exports a fresh image. This is more aggressive but can recompress JPEG/WebP data and depends on browser decoding support.

## Privacy and runtime network protection

The generated HTML contains a Content Security Policy with `connect-src 'none'`. ExifReader and fflate are embedded at build time, with no runtime CDN. GPS visualization is an offline coordinate grid rather than an external map.

## Dependencies

| Library | Version | License | Purpose |
| --- | ---: | --- | --- |
| ExifReader | 4.41.3 | MPL-2.0 | EXIF / GPS / IPTC / XMP / ICC parsing |
| fflate | 0.8.3 | MIT | ZIP creation for batch cleaned files |

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Limitations

Metadata removal cannot hide information visible in the pixels themselves, such as faces, addresses, signs, plates, or recognizable locations. Lossless cleaning is limited to JPEG/PNG/WebP. Deep Clean depends on browser decoding support. Proprietary metadata may not always be recognized, which is why post-clean verification is part of the workflow.

## License

Copyright © 2026 ttomohisa

Licensed under the [MIT License](LICENSE).
