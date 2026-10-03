# Security Policy

Photo Privacy Inspector is designed to process image bytes locally. The built artifact blocks runtime network connections with CSP (`connect-src 'none'`).

Please do not attach private photos or GPS-bearing files to public bug reports. Report security problems privately when possible.

Metadata parser failures are treated as unavailable analysis, never as absent sensitive data. Failed post-clean parsing blocks successful verification and saving; batch ZIPs omit unverified outputs and report their names. Successful parsing still cannot prove that every proprietary metadata field or visible privacy clue is absent.

メタデータの解析失敗は判定不能として扱い、要注意情報がないとは判断しません。Clean後の解析失敗時は検証成功や保存を許可せず、ZIPから未検証の出力を除外してファイル名を表示します。解析成功も、独自メタデータや画像内のプライバシー情報がすべてないことを保証するものではありません。
