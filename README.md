# Manga Tracker

A browser extension that remembers which manga chapter you're on, flags new chapters, and does it all on your own computer: no account, no server, no subscription.

## Features

- **Automatic progress.** On a site you've added, the series and chapter are saved as you read.
- **Library.** A full-page cover grid with New / Reading / Plan / Completed / Dropped tabs, search, and sorting. The toolbar popup shows what to resume next.
- **New-chapter alerts.** An hourly check against the public MangaDex API drives a toolbar badge and one notification per series.
- **Import.** MyAnimeList (`.xml` / `.xml.gz` export), AniList (by public username), or a backup file from this extension.
- **Export.** One JSON file holds your library, site rules and settings. A monthly reminder nudges you to back up.
- **Editable site rules.** Each site is a small JSON rule you can fix yourself. See [docs/rules.md](docs/rules.md).

## Install (developer mode)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open a chapter on the site you read, click the toolbar icon, and press **+ Add this site**.

## Privacy

Library, progress and settings stay in the browser's storage. There are no analytics. The only network requests are to AniList (covers, descriptions, list import) and MangaDex (chapter checks), and they send a series title or ID. You can turn lookups off in Settings. Sites are only read after you approve them.

## Limits

- Checks run only while the browser is open (hourly by default). There is no push.
- New-chapter alerts only cover series MangaDex lists.
- Requests are throttled to one per second per host, with backoff on HTTP 429/403.

## Development

No build step. Run `node test.js` for the helper tests.

## License

MIT
