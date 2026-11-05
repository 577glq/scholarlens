# Privacy

ScholarLens is a local browser extension. It does not operate a relay server.

## Data the extension handles

- **Text and formulas you select** are sent to your configured model API only when you click Translate / Explain, use the context menu, or use a keyboard shortcut.
- **API settings** (Base URL, key, model, target language, terminology preferences, display options) are stored in `chrome.storage.local`.
- **Page content** is not uploaded in bulk, and browsing history is never sent anywhere.

## Where data goes

The destination is exactly the **API Base URL** you configure. Requests go directly from the extension service worker to that endpoint, without a ScholarLens relay.

The PDF reader downloads an online PDF only when you open it, or reads a local PDF you choose or drop, and renders it locally with PDF.js. Online PDFs require permission for that domain; local PDFs never leave your computer. PDF files are not sent to ScholarLens.

Your model provider may log requests under its own privacy policy. Review that provider's terms.

## What is not collected

- No analytics, telemetry, ads, profiling, or remote configuration.
- No browsing history, accounts, contacts, or clipboard contents.
- API keys are not sent anywhere except the API provider you configure.

## Permissions

- `storage` — save local settings.
- `contextMenus` — add the selection context menu.
- `activeTab` — communicate with the active tab after a user action.
- `https://api.deepseek.com/*` — default DeepSeek endpoint.
- Optional host permissions — requested only when you save another API base URL.
- `<all_urls>` content script — show the selection toolbar on paper pages.

## Deleting data

Removing the extension deletes its local storage. You can also clear the API key in Settings and save.

## Contact

This is a local open-source project. Report privacy issues through the repository issue tracker.
