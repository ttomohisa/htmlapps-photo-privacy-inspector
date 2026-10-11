const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let html = fs.readFileSync(path.resolve(__dirname, '..', process.env.APP_HTML || 'src/index.template.html'), 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
if (payload) html = require('node:zlib').gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8');
// Contracts catch deletion of the scoped fixes; native QA establishes actual geometry.
test('Help alone locks document scrolling while modal', () => {
  assert.match(html, /html:has\(#helpDialog:modal\),body:has\(#helpDialog:modal\)\{overflow:hidden\}/);
});
test('narrow title and version stay visible without shrinking utility controls', () => {
  const narrow = html.slice(html.indexOf('@media(max-width:430px)'));
  assert.doesNotMatch(narrow, /\.version-badge\{display:none\}/);
  assert.match(narrow, /\.brand-name\{[^}]*display:flex[^}]*flex-wrap:wrap[^}]*white-space:normal[^}]*overflow:visible/);
  assert.match(narrow, /\.version-badge\{[^}]*flex:0 0 auto[^}]*margin-left:0/);
  assert.match(narrow, /\.header-actions\{flex-shrink:0\}/);
});
test('existing dialog allocation and offline policy remain intact', () => {
  assert.match(html, /dialog\[open\]\{display:flex;flex-direction:column\}/);
  assert.match(html, /\.dialog-body\{flex:1 1 auto;min-height:0;[^}]*overflow:auto;overscroll-behavior:contain/);
  assert.match(html, /connect-src 'none'/);
});
