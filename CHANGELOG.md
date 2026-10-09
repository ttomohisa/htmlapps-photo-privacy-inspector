# Changelog

## [1.0.3] - 2026-10-09

### Added
- Add an optional unfiltered Choose files input while keeping photo selection and existing supported-image validation; preserve the filename supplied by the device/provider.
- Inspect embedded AI generation/editing and C2PA provenance records locally, without claiming image authenticity or signature verification.
- Remove recognized C2PA containers during Privacy Clean, verify output records, and include before/after findings in reports.
- Explain provenance loss and invisible-pixel-watermark limitations before saving a cleaned copy.

### Fixed
- Distinguish original-image findings from the verified cleaned copy, including a persistent per-photo notice and bilingual output-scope explanation.
- Avoid false privacy warnings for exact standard Canvas sRGB profile fields while retaining warnings for custom ICC values; do not suggest repeating Deep Clean after it has already run.
- Inspect appended HDR/MPF JPEG images instead of rejecting every valid secondary JPEG as trailing data.
- Offer an explicitly warned SDR still-image export; preserve the original, inspect auxiliary metadata, and never silently convert batch files or claim HDR cleanup is lossless.
- Correct the unique-ID icon stroke clipping and replace the editing-software glyph with an editor window.

### Improved
- Use neutral creation/editing headings and explicitly distinguish provenance-only records from AI-generation information.
- Simplify the AI output result label by removing the parenthetical recheck wording; preserve explicit original/copy scope and output verification.
- Refresh the Japanese and English sharing headline and remove the decorative drop-area circle.
- Replace exposure emojis with consistent accessible green line icons.
- Keep mobile metadata filters above their results without overlap.
- Dismiss photo and batch More menus on outside click or Escape, with one menu open at a time.

## 1.0.2 - 2026-10-09

- Add a genuine English screenshot for the app catalog and documentation.
- Regenerate the root standalone download from the existing current source, including previously committed lifecycle and metadata-error fixes.

## 1.0.1 - 2026-10-06

- Preserve WebP display orientation with newly generated Orientation-only EXIF while keeping encoded image, alpha, color and animation data unchanged; remove all original EXIF and XMP.
- Explain the retained JPEG/WebP orientation and unchanged PNG eXIf limitation in Japanese and English.
- Do not report zero-valued JFIF thumbnail dimensions as an embedded thumbnail; retain warnings for actual thumbnail information.
- Add real-parser, encoded-payload, single/batch verification and independent decoder regressions.
- WebPの向き情報だけを最小EXIFに残し、再圧縮せず表示方向を保持します。元のEXIF/XMPは削除します。
- JPEG/WebPの向き保持とPNGのeXIf削除の制限を日英で明記し、JFIFのサムネイル寸法0の誤検出を修正しました。

## Previously unreleased

- Add a named, cancellable in-app confirmation for removing just the selected photo, preserving the remaining analyses and original files.
- Cancel stale import, clean verification and ZIP callbacks after confirmed removal or Clear All; dispose discarded previews, reset transient UI and suppress partial ZIP downloads.
- Add operation-ownership regressions for repeated work and cancellation, run against source and both generated release forms.
- 選択中の写真だけを取り除く、ファイル名付きの確認ダイアログを追加しました。残った写真の解析結果と元ファイルは保持します。
- 取り除く操作や全消去後に古い読み込み・Clean検証・ZIP処理が結果を復元しないようにし、不要なプレビューを解放します。中断した一部のZIPは保存しません。

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
