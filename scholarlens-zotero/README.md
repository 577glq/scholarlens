# ScholarLens for Zotero

The **Zotero 7+ plugin** for ScholarLens: select text in Zotero's built-in PDF reader, then translate or explain it with an OpenAI-compatible model.

Current version: **0.1.4**

The browser extension lives at the repository root. See the [main README](../README.md).

## Features

- Translate / explain from the Zotero reader selection popup.
- Floating panel with streaming output, stop, and retry.
- Formula placeholders preserved and restored with KaTeX.
- Formula reference list with copyable LaTeX.
- Markdown copy with `$...$` / `$$...$$` formulas.
- Missing-formula warning with source formulas appended to copied Markdown.
- Settings for API Base, key, model, target language, temperature, and terminology preferences.
- DeepSeek / OpenAI / local Ollama presets.
- Works alongside other reader plugins such as Translate for Zotero.

## Install

### From a release

1. Download `scholarlens-zotero-0.1.4.xpi` from [GitHub Releases](https://github.com/577glq/scholarlens/releases).
2. In Zotero: **Tools → Add-ons → gear → Install Add-on From File**.
3. Select the `.xpi` and restart Zotero.

### From source

```bash
npm install
npm run build              # writes release/scholarlens-zotero-0.1.4.xpi
npm run install-plugin     # Windows helper: build and copy into the Zotero profile
```

`install-plugin` is a Windows convenience script. On other platforms, use **Install Add-on From File**.

## Usage

1. Open a paper in Zotero's PDF reader and select text.
2. Click **ScholarLens translate** or **ScholarLens explain** in the selection popup.
3. The panel can be dragged; press `Esc` to close; streaming can be stopped at any time.
4. First-time setup: **Zotero Settings → ScholarLens**, add an API key, and test the connection.

## Configuration

| Service | API Base | Model example |
|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Local Ollama | `http://localhost:11434/v1` | a locally installed model |

The API key is stored in the local Zotero preference `extensions.zotero.scholarlens.apiKey` and is never committed to this repository.

## Limitations

- Zotero reader selections are plain text. PDF formulas are usually Unicode, not structured LaTeX; formula fidelity is better on HTML pages with the browser extension.
- Scanned PDFs without a text layer cannot be selected.
- The reader popup buttons are not clickable in some Zotero versions; use `Alt+T` / `Alt+Shift+E`.
- No OCR.

## Structure

```text
src/
  manifest.json        # Zotero add-on manifest
  bootstrap.js         # lifecycle + reader selection buttons
  panel.js             # floating panel, streaming, KaTeX, copy
  prefs.xhtml/css      # settings page
  prefs-pane.js        # settings logic
  lib/
    api.js             # SSE Chat Completions
    prompt.js          # translation / explanation prompts
    extract.js         # formula placeholder pipeline
    markdown.js        # KaTeX renderer
    prefs.js           # Zotero.Prefs access
```

## Build notes

- `build.mjs` bundles `src/panel.js` with esbuild, copies the manifest and static assets, then packages a `.xpi` with fflate.
- KaTeX fonts are copied from `node_modules/katex/dist/fonts`.
- `npm run install-plugin` targets the default Windows Zotero profile path.

## License

MIT. See [LICENSE](LICENSE). Third-party notices are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
