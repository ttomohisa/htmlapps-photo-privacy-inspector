# Photo Privacy Inspector

[![GitHub Pages](https://github.com/ttomohisa/htmlapps-photo-privacy-inspector/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/htmlapps-photo-privacy-inspector/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-0ea5e9)](https://ttomohisa.github.io/htmlapps-photo-privacy-inspector/)

[English README](README.md)

写真に隠れているGPS・撮影日時・端末情報・シリアル・作者名・編集ソフトなどを、**外部へアップロードせずブラウザ内だけで確認・除去**できる単一HTMLアプリです。

単なるEXIF Viewerではなく、「この写真を共有すると何が分かるか」を露出スコアと平易な説明で整理し、Clean後にもう一度解析して**本当に消えたか**まで確認します。

## 🚀 デモ

### [GitHub PagesでPhoto Privacy Inspectorを開く](https://ttomohisa.github.io/htmlapps-photo-privacy-inspector/)

GitHub Pagesから最初のHTMLを読み込んだ後、写真の解析・ハッシュ計算・メタデータ除去・ZIP生成は端末内で処理されます。選択した写真やGPS座標がアプリから外部へ送信されることはありません。

## AI・来歴の埋め込み記録

JPEG・PNG・WebPの対応するメタデータから、AI生成・編集の宣言、生成ツール名、生成設定を確認します。C2PAの来歴情報はAI記録とは分けて表示します。画像の見た目でAI判定する機能や、署名の暗号学的な検証ではありません。記録は書き換え可能で、見つからなくても実写とは断定できません。

Cleanは保存するコピーから対応する埋め込み記録を削除し、再検査します。**C2PAの署名・来歴・編集履歴も失われます。** SynthIDなど画素内の不可視の透かしの除去は保証しません。独自メタデータが残る可能性はあります。元ファイルは変更しません。

## HDR・追加画像を含むJPEG

MPF/HDRゲインマップなど、完全なJPEG画像が連結されたファイルは画像ごとにメタデータを検査し、追加画像の情報も結果へ反映します。この形式のCleanは**「SDRの静止画として保存」**から明示的に行います。主画像を再圧縮するため、HDRの明るさ表現と追加画像は失われます。元ファイルは変更せず、保存する単一画像を再検査します。HDRの参照関係を壊さないよう、再圧縮なしのCleanは無効になります。一括ZIPでは自動変換せず対象から除外して名前を表示します。警告を確認して個別に書き出してください。JPEG以外の末尾データや破損した追加画像は未対応です。

## 主な機能

- GPS・撮影日時・端末名・レンズ・シリアル・作者/所有者・編集ソフト・コメント・一意IDなどを解析
- 「この写真から分かること」を優先度順に表示
- 0〜100の**露出スコア**と共有前チェック
- 地図タイルを使わないオフラインGPS座標プレビュー
- JPEG / PNG / WebPの**再圧縮なし Privacy Clean**
- Canvas再描画によるDeep Clean
- Clean後のメタデータを自動で再解析し、Before → Afterで検証
- 複数写真をまとめて解析し、危険な写真をすぐ発見
- JPEG / PNG / WebPをまとめてCleanしZIP保存
- 写真ごとのJSONプライバシーレポート、全体レポート
- SHA-256をブラウザ内で計算
- JPEG / PNG / WebP / TIFF / HEIC / AVIF / GIFのメタデータ解析
- 日本語 / English切替
- PC・スマートフォン対応
- PDF Organizer系と同じ、外部通信を遮断した単一HTMLビルド

## すぐに使う

### Webで使う

[デモを開く](https://ttomohisa.github.io/htmlapps-photo-privacy-inspector/)だけで使えます。アカウント・インストールは不要です。

### 完全オフラインで使う

1. このリポジトリをダウンロードまたはクローンします。
2. Windowsで `build-standalone.bat` を実行します。
3. 初回だけ、`dependencies.json` で固定されたnpmパッケージを取得します。
4. 生成された `dist/index.html` を任意の場所へコピーします。
5. 以降はそのHTML単体を `file://` で開いて利用できます。

Python、Node.js、ローカルWebサーバーは不要です。Windows PowerShellと標準の `tar.exe` を使用します。

## 使い方

1. 写真を選択、ドロップ、またはクリップボードから貼り付けます。
2. 露出スコアと「この写真から分かること」を確認します。
3. 下部のメタデータ一覧でGPS、EXIF、XMP、IPTCなどの詳細を確認します。
4. 公開前に不要な情報があれば **メタデータを削除して保存** を選びます。
5. Privacy CleanまたはDeep Cleanを実行します。
6. Clean後の再検査で、要注意メタデータが残っていないか確認して保存します。

## Privacy Clean と Deep Clean

### Privacy Clean（推奨）

JPEG / PNG / WebPをファイル構造レベルで処理し、画像本体を再エンコードせずに一般的なプライバシーメタデータを除去します。

- JPEG: EXIF / XMP / IPTC / コメント
- PNG: eXIf / tEXt / zTXt / iTXt / tIME
- WebP: EXIF / XMP

色管理用ICCなど、画質に必要な領域は可能な限り残します。特殊な独自メタデータが残る可能性があるため、**出力後に必ず自動再検査**します。

### Deep Clean

ブラウザのCanvasへ画像を描画して新しい画像として保存します。メタデータをより徹底して落とせる一方、JPEG / WebPでは再圧縮が行われます。

## GitHub Pagesで公開する

1. リポジトリを `htmlapps-photo-privacy-inspector` としてGitHubへプッシュします。
2. **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選択します。
3. `main` へpushします。
4. Workflowが単一HTMLをビルド・検証し、GitHub Pagesへ公開します。

Pages未設定の初回実行では、ビルド成果物を作成した上でデプロイだけをスキップするテンプレート仕様です。

## 開発とビルド

```text
.
├─ src/index.template.html       # アプリ本体
├─ app.config.json               # アプリ名・バージョン・出力設定
├─ dependencies.json             # 固定依存バージョン
├─ build-standalone.bat          # Windows用ビルド入口
├─ build-standalone.ps1          # 単一HTMLビルダー
├─ scripts/                      # ビルド/自己解凍/検証
└─ dist/
   ├─ index.html                 # 生成される単一HTML
   └─ index.self-extract.html    # gzip自己解凍版
```

キャッシュを破棄して依存を再取得する場合：

```bat
build-standalone.bat -ForceDownload
```

## プライバシーと通信防止

生成HTMLには `connect-src 'none'` を含むContent Security Policyがあります。ExifReaderとfflateもビルド時にHTMLへ内包し、実行時CDNは使用しません。

位置情報プレビューも外部地図を使用せず、経緯度をローカルの座標グリッド上へ表示するだけです。

## 開発時の検証

Node.js 20以降を用意し、`scripts/check-repository.ps1` で両方のHTMLをビルドして、ソース・通常版・自己展開版の復元内容に対する解析失敗と写真の削除・中断の回帰テストを実行します。ビルド後の固定依存キャッシュを使い、 `node --test scripts/test-metadata-failures.cjs scripts/test-photo-lifecycle.cjs` を実行すると、合成画像によるソースの回帰テストを再実行できます。Node.jsはこの開発テストだけに必要です。

## 制限事項

- 写真そのものに写った住所、顔、表札、車のナンバーなどはメタデータ除去では消えません。
- HEIC / AVIF / TIFF / GIFは解析できますが、再圧縮なしPrivacy CleanはJPEG / PNG / WebPのみです。
- Deep Cleanはブラウザが元画像をデコードできる場合のみ利用できます。
- 独自MakerNoteや未知のメタデータは解析できない場合があります。
- 解析失敗時はファイル名と判定不能のメッセージを表示し、低リスクのスコアは付けません。Clean後の解析に失敗したコピーは保存できず、ZIPからも除外して対象ファイル名を表示します。
- C2PA等の真正性検証ツールではありません。
- 大量・高解像度の写真を同時に処理するとブラウザのメモリを多く使用します。

## 使用ライブラリ

| ライブラリ | バージョン | ライセンス | 用途 |
| --- | ---: | --- | --- |
| ExifReader | 4.41.3 | MPL-2.0 | EXIF / GPS / IPTC / XMP / ICC等の解析 |
| fflate | 0.8.3 | MIT | 複数Clean画像のZIP生成 |

詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を確認してください。

## ライセンス

Copyright © 2026 ttomohisa

このプロジェクトは [MIT License](LICENSE) で公開されています。

## 写真を取り除く・処理を中止する

**その他 → この写真を取り除く** で選択中の写真と解析結果だけを取り除けます。確認ダイアログにはファイル名を表示します。キャンセルやEscでは変更しません。確認後は次の写真、末尾なら前の写真を選択します。元ファイルは変更しません。

取り除く操作や **すべて消去** を確認すると、処理中の読み込み・Clean・ZIP作成を中止し、一時的な検証結果と進捗表示をリセットします。不要なプレビューURLも解放します。中断した一部のZIPは保存しません。残った写真の解析結果は保持され、引き続きCleanやレポート保存ができます。Cleanのダイアログを閉じた場合も、処理中の検証を中止します。

## 向き情報とCleanの検証

Privacy Cleanでは再圧縮せず、JPEG/WebPの表示方向に必要な場合だけ、向き情報だけの最小EXIFを新しく生成します。元のEXIFは破棄します。向きの表示は閲覧ソフトの対応によります。PNGのeXIfは向き情報も含めてすべて削除します。JFIFサムネイルの幅・高さが0の場合は埋め込み画像がないため、要注意情報に数えません。実際のサムネイルや正の寸法は引き続き報告します。

`scripts/check-repository.ps1`は向き1〜8、WebPのアルファ・アニメーション・sRGBプロファイル、JPEG/PNG対照を含むClean回帰テストを、ソースと両方の生成HTMLで実行します。独立した画素検証は、開発環境にPillowを用意し、`PHOTO_CLEAN_OUTPUT_DIR=./test-output node --test scripts/test-photo-clean.cjs`、続けて`python scripts/verify-photo-pixels.py ./test-output`を実行します（PowerShellではNode実行前に`$env:PHOTO_CLEAN_OUTPUT_DIR="./test-output"`を設定）。向きを適用した全フレームの寸法とRGBA画素を比較します。実ブラウザーでの保存・再表示確認とは別の検証です。

Node環境にはDOMParserがないため、EXIFは実際の解析エンジンで確認し、XMPはチャンクが除去されたことを検証します。sRGB対照ではICCの既存警告が残ることも確認し、メタデータがすべて消えたとは扱いません。

ヘルプ表示中は背景ページのスクロールを止めます。狭いヘッダーでもバージョンと言語・ヘルプ操作を表示します。
