# Site rules

Each site you add gets a rule, editable under **Settings → Sites**. The popup's **Test rule** button shows what a rule extracts from the current page.

```json
{
  "id": "example.com",
  "match": "(?:chapter|ch)[-_/. ]*\d",
  "series":  { "from": "title", "re": "^(.+?)\s*[-–|:]?\s*(?:chapter|ch\.?)\s*\d" },
  "chapter": { "from": "url",   "re": "(?:chapter|ch)[-_/. ]*(\d+(?:\.\d+)?)" }
}
```

- `match`: regex tested against the page URL (case-insensitive). The rule only runs on matching pages.
- `series` / `chapter`: where to read the value and how.
  - `from`: `"url"`, `"title"` (the page title), or `"selector"` (use `sel` and optionally `attr`, default `textContent`).
  - `re`: regex; capture group 1 is used.
- `origin`: the permission pattern granted for the site. Set automatically.
