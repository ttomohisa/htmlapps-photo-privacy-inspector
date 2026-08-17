# Reusable UI components

`components/` contains UI snippets that can be reused when creating a new single-HTML app from this template.

They are not automatically loaded by the builder. Copy or adapt the component into `src/index.template.html` so the release remains one self-contained HTML file.

## Confirmation dialog

`components/confirm-dialog.html` is the preferred replacement for `window.confirm()`. The starter's Clear action uses the same `AppConfirm.ask()` pattern.

- Centered modal on desktop
- Bottom-sheet presentation on smartphones
- Safe-area aware
- Cancel with `Esc`, the close button, or a backdrop tap
- Restores focus to the previous control
- `tone: 'danger'` for destructive actions
- Dependency-free and offline
- Returns `Promise<boolean>`

### Example

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

Finished apps should normally pass localized labels from their own translation object. Preserve `Esc`, backdrop cancellation, focus restoration, keyboard access, and smartphone safe-area handling when adapting the component.
