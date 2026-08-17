# 再利用UIコンポーネント

`components/` には、このテンプレートから新しい単一HTMLアプリを作るときに再利用できるUI部品を置きます。

これらはビルダーが自動で読み込むライブラリではありません。必要な部品を `src/index.template.html` にコピーまたは組み込み、アプリの翻訳・状態・操作へ合わせて調整してください。最終成果物はこれまでどおり1つのHTMLです。

## 確認ダイアログ

`components/confirm-dialog.html` は、`window.confirm()` の代わりに使う自前の確認UIです。スターター本体の「消去」でも同じ考え方の `AppConfirm.ask()` を使用しています。

- PCでは中央のモーダル
- スマートフォンでは下から出るボトムシート風
- `env(safe-area-inset-bottom)` 対応
- `Esc`、閉じるボタン、背景タップでキャンセル
- 実行後に元のフォーカスへ戻す
- 削除などの破壊的操作は `tone: 'danger'`
- 外部依存・外部通信なし
- `Promise<boolean>` を返す

### 使用例

```js
const ok = await AppConfirm.ask({
  title: language === 'ja' ? '確認' : 'Confirm',
  message: language === 'ja'
    ? 'この履歴を削除しますか？'
    : 'Delete this history item?',
  confirmLabel: language === 'ja' ? '削除する' : 'Delete',
  cancelLabel: language === 'ja' ? 'キャンセル' : 'Cancel',
  tone: 'danger'
});

if (!ok) return;
deleteHistoryItem();
```

### オプション

| 項目 | 内容 |
| --- | --- |
| `title` | ダイアログのタイトル |
| `message` | 確認本文 |
| `confirmLabel` | 実行ボタンの文言 |
| `cancelLabel` | キャンセルボタンの文言 |
| `tone` | `'default'` または `'danger'` |

完成したアプリでは、アプリ自身の翻訳オブジェクトからタイトル・本文・ボタン文言を渡すことを推奨します。

## 実装ルール

- 削除・全消去・上書きなどユーザー影響の大きい操作では、`window.confirm()` よりこの部品か同等の自前UIを優先します。
- 確認本文へHTML文字列を差し込まず、テキストとして渡します。
- スマートフォンでは48px程度のタップ領域とSafe Areaを維持します。
- アプリ固有の見た目に変更しても、`Esc`、背景タップ、フォーカス復帰、キーボード操作を維持します。
- `components/` の部品を変更した場合は、スターター本体に組み込まれた同等実装とドキュメントも同期します。
