# Security Policy

Photo Privacy Inspector is designed to process image bytes locally. The built artifact blocks runtime network connections with CSP (`connect-src 'none'`).

Please do not attach private photos or GPS-bearing files to public bug reports. Report security problems privately when possible.

Metadata parser failures are treated as unavailable analysis, never as absent sensitive data. Failed post-clean parsing blocks successful verification and saving; batch ZIPs omit unverified outputs and report their names. Successful parsing still cannot prove that every proprietary metadata field or visible privacy clue is absent.

メタデータの解析失敗は判定不能として扱い、要注意情報がないとは判断しません。Clean後の解析失敗時は検証成功や保存を許可せず、ZIPから未検証の出力を除外してファイル名を表示します。解析成功も、独自メタデータや画像内のプライバシー情報がすべてないことを保証するものではありません。

Embedded AI findings describe editable metadata records, not image authenticity. C2PA detection does not validate a signature or trust chain. Structural inspection errors or supported records remaining in a clean output block verification and saving. Removing C2PA containers destroys the copy's embedded signed provenance/edit history. Pixel watermarks and unknown proprietary metadata are outside this guarantee.

AI関連の表示は書き換え可能な記録を示すもので、画像の真偽判定ではありません。C2PAの署名や信頼チェーンは検証しません。構造解析の失敗や対応する記録の残存時はClean後の検証・保存を中止します。C2PA格納領域を削除するとコピーの署名付き来歴・編集履歴も失われます。画素内の透かしや独自メタデータは保証対象外です。
