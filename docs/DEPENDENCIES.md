# Adding Embedded Dependencies

## Configuration

Add a package to `dependencies.json`:

```json
{
  "dependencies": [
    {
      "id": "dayjs",
      "package": "dayjs",
      "version": "1.11.13",
      "license": "MIT",
      "homepage": "https://day.js.org/",
      "assets": [
        {
          "key": "main",
          "path": "dayjs.min.js",
          "mime": "text/javascript",
          "stripSourceMapComment": true
        }
      ]
    }
  ]
}
```

A complete example is available at `examples/dependencies.dayjs.json`.

## Runtime loading

For a classic browser bundle:

```js
await StandaloneAssets.loadClassicScript('dayjs', 'main', 'dayjs');
console.log(window.dayjs().format('YYYY-MM-DD'));
```

For a self-contained ES module:

```js
const library = await StandaloneAssets.importModule('library-id', 'main');
```

For a worker or WASM asset:

```js
const workerUrl = StandaloneAssets.blobUrl('library-id', 'worker');
const worker = new Worker(workerUrl, { type: 'module' });

const wasmBytes = StandaloneAssets.bytes('library-id', 'wasm');
const wasm = await WebAssembly.instantiate(wasmBytes, imports);
```

Revoke long-lived asset URLs after the consumer is finished:

```js
URL.revokeObjectURL(workerUrl);
```

## Checklist

- Pin an exact package version.
- List every runtime support file.
- Confirm the chosen bundle has no unresolved relative import.
- Update `THIRD_PARTY_NOTICES.md` with the required copyright and license text.
- Rebuild with `-ForceDownload` after changing versions.
- Inspect the generated manifest and app size.
- Test with the network disabled.
