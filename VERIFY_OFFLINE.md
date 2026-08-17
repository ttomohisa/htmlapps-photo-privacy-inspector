# Offline verification

1. Run `build-standalone.bat`.
2. Disconnect from the network.
3. Open `dist/index.html` directly with `file://`.
4. Inspect a photo containing metadata.
5. Create a Privacy Clean copy and confirm the Before → After verification appears.
6. Repeat with multiple JPEG/PNG/WebP files and create a ZIP.
7. Confirm browser developer tools show no runtime network requests.
8. Repeat with `dist/index.self-extract.html`.
