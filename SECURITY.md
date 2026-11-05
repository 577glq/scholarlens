# Security Policy

## Reporting

Use GitHub **Private vulnerability reporting / Security Advisories**. Do not open a public issue containing:

- API keys, cookies, or tokens
- Unpublished papers or user data
- Browser profiles or Zotero databases
- Screenshots with personal information

If advisories are not enabled, open an issue that only asks for private contact; do not include sensitive details.

## Scope

ScholarLens sends the current selection to the OpenAI-compatible API configured by the user. API keys are stored in browser local storage or local Zotero preferences, not on a ScholarLens server.

Before publishing, run:

```bash
git grep -nE 'sk-[A-Za-z0-9]{12,}|ghp_|github_pat_|Bearer [A-Za-z0-9]'
```

Never commit `.env`, logs, browser profiles, Zotero profiles, or build caches.
