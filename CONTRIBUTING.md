# Contributing

Thanks for improving ScholarLens.

## Before you commit

- Never commit API keys, cookies, browser profiles, Zotero databases, or personal screenshots.
- Do not commit `node_modules/`, `dist/`, `release/`, or `.xpi` build artifacts.
- For changes to formula extraction, selection cleanup, or prompts, describe the page/PDF types you tested.
- Update the README for user-facing behavior changes.

## Development

```bash
# Browser extension
npm ci
npm run build

# Zotero plugin
cd scholarlens-zotero
npm ci
npm run build
```

See the [main README](README.md) and [Zotero README](scholarlens-zotero/README.md).

## Pull requests

- Keep changes focused and explain the motivation, approach, and verification.
- Include screenshots for UI changes after removing any personal information.
- Do not mix unrelated formatting changes into a feature PR.
- By contributing, you agree that your contribution is released under the repository's MIT license.

## Security

Read [SECURITY.md](SECURITY.md). Do not paste API keys or sensitive data into a public issue.
