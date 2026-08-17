# Architecture

## Overview

The repository separates editable source from the release artifact:

```text
app.config.json              Product metadata
APP_SPEC.md                  Product behavior and acceptance contract
dependencies.json            Exact npm packages and files to embed
components/                   Reusable source snippets copied/adapted into apps
src/index.template.html      Editable application source
build-standalone.ps1         Dependency fetch, hash, embed, and build
scripts/verify-standalone.ps1 Static release checks
dist/index.html              Generated readable release artifact
dist/index.self-extract.html Generated gzip self-extracting artifact
```

`dist/index.html` and `dist/index.self-extract.html` are generated and must not be edited manually.


## Reusable component layer

`components/` contains dependency-free source snippets for common UI patterns. These files are not loaded at runtime and are not a separate bundle layer. An app copies or adapts the needed CSS, HTML, and JavaScript into `src/index.template.html`, preserving the one-file runtime model.

The starter includes `components/confirm-dialog.html` and exposes the matching `window.AppConfirm` API in the default source. It is intended to replace native `window.confirm()` for delete, clear-all, overwrite, and similar user-visible destructive flows. See `docs/COMPONENTS.md`.

## Build pipeline

1. Read `app.config.json` and `dependencies.json`.
2. Resolve each exact npm version through the npm registry.
3. Cache and extract each tarball.
4. Validate the package's own version.
5. Read only the explicitly listed asset files.
6. Calculate SHA-256 hashes for the package tarball and every embedded asset.
7. Store assets as Base64 in an embedded JSON bundle.
8. Replace the three source placeholders exactly once.
9. Write and verify `dist/index.html`.
10. Gzip that HTML, embed it into a small ASCII-only native `DecompressionStream` loader, inherit the readable HTML favicon, and write `dist/index.self-extract.html`.
11. Verify that the loader stays ASCII-only and embedded-only, the favicon matches the readable HTML, and the gzip payload restores byte-for-byte.
12. Write both manifests plus `dist/.nojekyll`.
13. Reject the declared unresolved build placeholders and common external runtime resource references.

## Build placeholders

The source template contains exactly one of each:

- `__APP_CONFIG_JSON__`
- `__BUILD_MANIFEST_JSON__`
- `__EMBEDDED_ASSET_BUNDLE_BASE64__`

Do not rename or duplicate them without changing the builder and verifier. Other runtime identifiers that happen to use a `__NAME__` convention are allowed and must not be rejected as build placeholders.

## Embedded asset API

The generated page exposes `window.StandaloneAssets`:

```js
StandaloneAssets.list();
StandaloneAssets.has('library-id', 'asset-key');
StandaloneAssets.bytes('library-id', 'asset-key');
StandaloneAssets.text('library-id', 'asset-key');
StandaloneAssets.blobUrl('library-id', 'asset-key');
await StandaloneAssets.loadClassicScript('library-id', 'main', 'ExpectedGlobal');
const module = await StandaloneAssets.importModule('library-id', 'main');
```

Blob URLs are revoked after script/module loading and on page exit.

### Important limitation

`importModule` does not rewrite relative imports inside a module. Choose a self-contained browser bundle, list every required file and implement a package-specific loader, or bundle the library before embedding.

## Runtime security boundary

The default Content Security Policy blocks all network connections with `connect-src 'none'`. It also blocks frames, objects, forms, and external base URLs. Inline CSS and JavaScript are allowed because the release is intentionally one HTML document. Embedded scripts and workers may be loaded through `blob:` URLs.

Static scanning is a guardrail, not a proof. Browser developer tools should still be used to verify that the generated app makes no unexpected request.

## Large applications

Keep source in one HTML while it remains understandable. When an app grows substantially, development files may be split under `src/` and assembled by the build script. Preserve these properties:

- Two generated one-file release variants.
- Pinned and auditable dependencies.
- No runtime external resource.
- Clear state ownership.
- A build that fails on missing input.
