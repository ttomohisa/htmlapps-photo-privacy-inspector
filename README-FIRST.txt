Photo Privacy Inspector
=======================

1. Read README.ja.md (or README.md).
2. Edit application behavior in src\index.template.html.
3. Keep app metadata in app.config.json and pinned packages in dependencies.json.
4. Run build-standalone.bat on Windows.
5. Test dist\index.html and dist\index.self-extract.html with the network disabled.
6. Do not edit generated files in dist manually.

The app must keep photo bytes local and preserve `connect-src 'none'`.
