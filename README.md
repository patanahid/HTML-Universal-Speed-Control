# HTML Universal Speed Controller

[Firefox Add-on Store link](https://addons.mozilla.org/en-US/firefox/addon/universal-speed-control/)

A Firefox extension that speeds up (or slows down) web pages by scaling the
browser's timing primitives. Version 3.2 is a ground-up rewrite of the timing
engine: everything is driven by one coherent virtual clock, settings are applied
on every page load, and the injected script is no longer blocked by a page's
Content Security Policy.

## Requirements

- **Firefox 128 or newer** (Desktop and Android). The MAIN execution world,
  added in Firefox 128, is what lets the page script run without being blocked
  by the page's CSP. `browser_specific_settings.gecko.strict_min_version`
  enforces this.
- Manifest V2. Chromium no longer loads MV2 extensions, so this is a
  Firefox-only build.

## Features

- Speed multiplier from **0** (all timing overrides off — native browser speed)
  to **1000**, including fractional values.
- Independent toggles for:
  - `setInterval`
  - `setTimeout`
  - `performance.now()`
  - `Date.now()`
  - `requestAnimationFrame`
- **Auto-speed sites**: store a speed per exact hostname and have it applied
  automatically on every visit.
- **Auto-click close**: clicks `.close-btn` elements, including ones that appear
  dynamically or are initially hidden.
- Configurable speed-step buttons and quick-add presets.
- Optional notification when auto-speed activates.
- Developer settings that are actually wired into the engine (see below).

## Architecture

| File | World | Job |
|---|---|---|
| `shared/settings.js` | all | One source of truth for defaults, validation and hostname parsing. No `browser.*` calls. |
| `page/page.js` | **MAIN** (page) | The timing engine. Overrides `setInterval`, `setTimeout`, `clearInterval`, `performance.now`, `Date.now`, `requestAnimationFrame`; owns the auto-click observer. |
| `content.js` | isolated | Reads settings from `browser.storage`, resolves auto-speed, and pushes the config to the page script with `window.postMessage`. |
| `background.js` | extension | Seeds default settings and shows notifications. |
| `popup/` | extension | Speed buttons, toggles, auto-speed control. |
| `options/` | extension | Speed steps, presets, auto-speed site list, developer settings. |

### CSP-safe injection

`manifest.json` declares `page/page.js` with `"world": "MAIN"` and
`"run_at": "document_start"`. Firefox 128+ executes that script in the page's
own world **before** any page script, and — unlike `window.eval` or an inline
`<script>` tag — it is not blocked by the page's CSP.

`content.js` also has a guarded fallback: if the MAIN-world script did not mark
itself ready (older or non-conforming engines), it injects the same file with a
`<script src=moz-extension://…>` tag. `page/page.js` is listed in
`web_accessible_resources` for that case and guards against double installation.

The two worlds communicate through `window.postMessage` on a private channel.
The page script rejects messages from any other window and ignores malformed or
unrecognised payloads. Because MAIN-world code is by definition visible to the
page, a hostile site can always undo these overrides; the channel check exists
to stop accidental cross-talk and third-party frames, not to provide a security
boundary.

### The virtual clock

One anchor (`{realPerf, realDate, virtPerf, virtDate, speed}`) drives both
`performance.now()` and `Date.now()`:

```
virtual(x) = anchor.virtual + (x - anchor.real) * speed
```

On a speed change the anchor is recomputed from the current virtual value, so
the clock is **continuous** (no jumps) and both clock APIs stay in agreement.
There is no throttling, no `Math.floor` on every read, and no device-specific
cap — the old mobile code silently limited virtual time to about 3×.

`setInterval` calls are tracked so every live interval can be rescheduled when
the speed or the `setInterval` toggle changes. `clearInterval` accepts any id
ever returned for that interval, including ids from before a reschedule.

`requestAnimationFrame` runs **one** callback per real frame and passes a
coherent virtual timestamp. It never replays a callback with an identical
timestamp, and it returns the browser's own handle, so the native
`cancelAnimationFrame()` keeps working.

> **Known limitation:** `Date.now()` is overridden, but the `Date` constructor
> is not. `new Date()` therefore still reads real wall-clock time while
> `Date.now()` reads virtual time. Code that mixes the two can disagree; this is
> inherent to overriding `Date.now` without replacing the whole `Date` object.

### Developer settings

| Setting | Effect |
|---|---|
| Tick Rate (Hz) | Grid size (`1000 / tickRate` ms) for Legacy Mode and Battery Saver. |
| Use High Precision Timer | Return the raw virtual timestamp; otherwise round to microsecond resolution (sub-millisecond precision is always preserved). |
| Legacy Mode | Floor virtual time to the tick grid and round timer delays up to a whole tick. |
| Optimize for Battery Life | Quantise virtual timestamps to the tick grid. |

## Auto-speed sites

1. Open the extension's **Settings** page.
2. In *Website Speed Settings*, add one `domain:speed` entry per line, or use
   the quick-add presets.
3. Click **Save All Changes**.

Full URLs, ports and credentials are accepted and normalised to a bare
hostname. Matching is **exact** (`window.location.hostname`), so include
`www.` if the site uses it. Wildcards and subdomain patterns are not supported.
All open tabs react immediately through `storage.onChanged`.

You can also toggle auto-speed from the popup: clicking the auto-speed button
saves the currently selected speed for the current host; clicking it again with
the same selected speed removes the entry.

## Auto-click close

Enable the toggle in the popup. A single `MutationObserver` watches the whole
document. Added nodes are checked both for descendants with `.close-btn` **and**
for nodes that are themselves `.close-btn`. Buttons are remembered in a
`WeakSet`, and visibility is retried with a native (unscaled) timer before
clicking, so buttons that appear hidden are still handled. Disabling the toggle
disconnects the observer.

## Installation (development)

1. Clone the repository.
2. Open Firefox and go to `about:debugging`.
3. Click **This Firefox** → **Load Temporary Add-on**.
4. Select `manifest.json`.

To build a distributable archive (`web-ext-config.cjs` excludes docs, tests and
source artwork automatically):

```sh
npx web-ext build --source-dir . --artifacts-dir web-ext-artifacts
```

To run the dependency-free engine tests:

```sh
node tests/smoke.js
```

## Verification performed

- `node --check` on every JavaScript file — clean.
- ESLint (`no-undef`, `no-unused-vars`, `no-dupe-*`, …) — clean.
- `web-ext lint` — **0 errors, 0 warnings, 0 notices**.
- `node tests/smoke.js` — 17 behavioural checks on a fake clock.

A full record of the defects found in v3.1 and how they were resolved is in
[`ERROR_REPORT.md`](ERROR_REPORT.md).

## Privacy / security

- No data collection, no network requests, no telemetry.
  `data_collection_permissions.required` is `["none"]`.
- All settings are stored locally with `browser.storage.local`.
- All dynamically generated UI uses `textContent` / `createElement`; there is
  no `innerHTML` anywhere in the extension.

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Commit your changes and push.
4. Open a pull request.

## License

MIT — see [LICENSE](LICENSE).
