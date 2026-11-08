[← Back](../README.md) | [English](README-en.md) | [Japanese](README.md)

# Stockpile Burn-down Chart
A site that charts, per category, how your stockpile of canned food, retort pouches, water and so on runs down along its best-before dates.

Site: https://koteitan.github.io/stock-burn-down/

## Usage
### Enter stock and targets
1. In "Add", enter Category, Content, Qty and Best before, then press [Add].
   - An empty Qty counts as 1.
   - Category may be empty (the chart shows it as "(no category)").
2. In the form below "Target list", enter Category and Target, then press [Add]. There is one target per category; adding an existing category overwrites its target.
3. When you use one item, press [Consume 1] in the stock list.
   - The quantity in the stock list drops by 1. A row that reaches 0 is removed.
   - One row (consumed at, category, content, qty, best before) is added to the consumption history.
4. [Edit] turns the row into input fields, and its buttons become [Done] [Cancel] [Delete] (in the stock list, target list and consumption history alike).
   - [Done]: overwrite the row with the input.
   - [Cancel]: close without changing anything.
   - [Delete]: delete the row. Deleting a history row does not put the quantity back in the stock list.
5. [Delete history before the chart start] deletes, after a confirmation, all consumption records made before the chart start date.

### Reading the charts
One chart per category is drawn from the "Chart start" date (start) above the charts. The most recently updated category comes first. The vertical axis is the stock count, and every line falls monotonically from (start, N), where N is the stock at start (current stock + quantity consumed since start).

- Blue line (Consumed): the actual stock.
  - (start, N) -- (t₁, N-c₁) -- (t₂, N-c₁-c₂) -- ... -- (now, N-C)
  - t_i is the consumption time, c_i its quantity, and C the total consumed since start.
  - The slope is your consumption pace. Extending it predicts when the stock will fall below the target.
- Green line (Best before): the stock if every item is consumed exactly on its best-before date. It drops by one at each best-before date.
  - (start, N) -- (e₁, N-1) -- (e₂, N-2) -- ... -- (e_N, 0)
  - e_k is the k-th best-before date in ascending order. Dates before start are placed at start.
  - Consuming does not move this line. On dates where the blue line is above it, the difference has passed its best-before date.
- Orange dashed line (Target): the target quantity.
- The small text beside a green point is the item's content. It is omitted when the content is empty or equal to the category. The last blue point shows the current stock N-C.
- Hovering over a chart shows the consumed, best-before and target values and the items for that date (tapping or the ← → keys also work).
- The stock list marks items past their best-before date as "expired" and items within 30 days as "soon".

### Menu (≡ at the top right)
- Theme: Dark / Light / System
- Language: Japanese / English
- Storage:
  - Browser: saved to this browser's localStorage.
  - nostr network (encrypted): encrypted and signed with a NIP-07 browser extension (nos2x, Alby, etc.) and saved to nostr relays. Other devices with the same key see the same data.
- github / License

When the storage is nostr, a status is shown next to the title.

| Status | Meaning |
|---|---|
| Not signed in to nostr. Connect with a nostr browser extension. | No NIP-07 extension was found, or it refused to give the public key |
| Loading from nostr | Fetching from relays (editing is disabled until loading finishes) |
| No nostr events found | You have no kind:30078 events |
| No stock list found | You have kind:30078 events, but none from this site |
| Received | Loading finished |
| Saving to nostr / Saved to nostr / Failed to save to nostr | Save state (after a failure, the next change retries) |

## Site maintenance
### Requirements
- Node.js 22 or later, npm

### Build and test
```sh
npm ci
npm run build      # output to dist/
npm test           # unit tests (vitest)
npm run typecheck  # type check
npm run dev        # development server
```
`dist/` is built with relative paths (`base: './'`), so it works under any path.

### Deployment
Pushing to the main branch makes GitHub Actions (`.github/workflows/deploy.yml`) build the site and publish it to GitHub Pages. CI only builds and uploads; it runs no lint or tests. In the repository settings, Settings → Pages → Source must be "GitHub Actions".

### Structure
- TypeScript + Vite + React
- [rx-nostr](https://github.com/penpenpng/rx-nostr) (nostr I/O), [react-i18next](https://github.com/i18next/react-i18next) (Japanese / English)
- `src/chart.ts`: chart points (consumed, best before) and axis ticks
- `src/components/`: UI parts (charts, add form, stock list, target list, consumption history, menu)
- `src/useStore.ts`: settings and list state, switching storage
- `src/storage.ts`: localStorage read/write
- `src/nostr/`: relay discovery, NIP-07, loading and saving

### Storage format
#### localStorage
The key `stock-burn-down` holds this JSON:

```json
{
  "version": 1,
  "settings": { "theme": "dark", "lang": "ja", "storage": "browser", "chartStart": "2026-11-01" },
  "stocks": [
    {
      "id": "8f0c…",
      "addedDate": "2026-11-08",
      "category": "缶詰",
      "content": "シーチキン",
      "count": 3,
      "expiry": "2027-06-01"
    }
  ],
  "targets": [{ "id": "1b2e…", "addedDate": "2026-11-08", "category": "缶詰", "count": 5 }],
  "history": [
    {
      "id": "c7d1…",
      "at": 1794096000000,
      "category": "缶詰",
      "content": "サバ",
      "count": 1,
      "expiry": "2027-02-15"
    }
  ],
  "updatedAt": { "缶詰": 1794096000000 }
}
```

- `settings.chartStart` is the chart start date. It is kept in localStorage even when the storage is nostr (it is not saved to nostr).
- `history` is the consumption history. `at` is the consumption time (Unix milliseconds).
- `updatedAt` is the last update time per category (Unix milliseconds) and decides the chart order.
- When the storage is nostr, only `settings` is stored. After switching from browser to nostr, however, the browser's data stays in `pendingUpload` until it has been saved to nostr.

#### nostr
- One kind:30078 event per category. Each event holds that category's stock list, target and consumption history.
- The `d` tag is `stock-burn-down/<random UUID>`. The d tag is not encrypted, so it does not contain the category name.
- The content is the following JSON encrypted to yourself with NIP-44 (NIP-04 if the extension lacks NIP-44):

```json
{
  "v": 1,
  "category": "缶詰",
  "updatedAt": 1794096000000,
  "stocks": [
    { "id": "8f0c…", "addedDate": "2026-11-08", "content": "シーチキン", "count": 3, "expiry": "2027-06-01" }
  ],
  "targets": [{ "id": "1b2e…", "addedDate": "2026-11-08", "count": 5 }],
  "history": [
    { "id": "c7d1…", "at": 1794096000000, "content": "サバ", "count": 1, "expiry": "2027-02-15" }
  ]
}
```

- Loading: `{"kinds":[30078],"authors":[<your pubkey>]}` is fetched with rx-nostr's backward strategy from your kind:10002 write relays (or the kind:3 relays, or default relays if neither exists). Each event is shown as soon as it arrives, without waiting for the rest.
- Saving: one second after a change, only the categories whose content changed are published. An emptied category is overwritten with empty lists.

## License
MIT License. See [LICENSE](LICENSE).
