# Changelog

## Unreleased

- Treat metadata parser failures as unavailable analysis instead of assigning a low-risk score; show the affected file names in Japanese and English.
- Block successful post-clean verification and saving when parsing fails, clear stale verification results, and omit unverified outputs from ZIPs with a visible failure list.
- Added synthetic regressions for unreadable inputs, valid images without EXIF, failed verification, and mixed batch outputs.
- メタデータ解析失敗時に低リスクと判定せず、判定不能として日本語・英語で対象ファイル名を表示します。
- Clean後の解析失敗時は検証成功や保存を許可せず、古い検証結果を破棄します。ZIPから未検証の出力を除外して失敗したファイル名を表示します。
- 破損入力、EXIFのない正常画像、検証失敗、混在する一括出力の合成回帰テストを追加しました。

## 1.0.0 - 2026-08-17

- Reworked the mobile workspace with app-like grouped cards, bottom-sheet dialogs, a compact action sheet, and a focused fixed batch action bar.
- Renamed the primary cleaning action to make metadata removal explicit instead of using the ambiguous “share-safe copy” wording.
- Moved privacy-report and verification-JSON downloads into secondary / technical menus.
- Added an editable output filename field before saving a cleaned image while keeping the generated clean name as the default.
- Improved the mobile summary strip so the main privacy warning stays readable on narrow screens.
- Added local EXIF/GPS/IPTC/XMP/ICC inspection with privacy-sensitive field classification.
- Added exposure scoring, plain-language leak explanations, and a pre-share checklist.
- Added an offline GPS coordinate preview with no map-tile requests.
- Added lossless Privacy Clean for JPEG, PNG, and WebP.
- Added Canvas-based Deep Clean.
- Added automatic post-clean re-inspection and Before → After verification.
- Added batch analysis, ZIP cleaning, privacy reports, and SHA-256 fingerprints.
- Based on the latest `ttomohisa/htmlapps-template` portable PowerShell and self-extract build pipeline.
