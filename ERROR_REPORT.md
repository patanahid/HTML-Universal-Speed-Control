# Error audit — Universal Speed Controller (v3.1)

Audited on 2026-10-26 on branch `arena/ebdb8458-html-universal-speed-control` (HEAD `e935276`).

> ## Status: RESOLVED in v3.2
>
> This document is kept as the historical record of the v3.1 audit. **All 46
> findings (E01–E46) were addressed** in the v3.2 rewrite. Verification after
> the fix: `web-ext lint` → **0 errors / 0 warnings / 0 notices**; ESLint →
> clean; `node --check` on all six JS files → clean; `node tests/smoke.js` →
> **17/17 behavioural checks pass**.
>
> | Group | Findings | Resolution |
> |---|---|---|
> | Core / CSP | E01, E02, E07, E31 | `page/page.js` declared with `world: "MAIN"` at `document_start` (Firefox 128+); `content.js` loads **all** settings from storage on every page load; private `postMessage` channel with source/type guards plus a guarded external-script fallback. |
> | Timing engine | E04, E05, E08, E09, E16, E22–E29 | Rewritten around a single continuous virtual clock. Mobile batch code deleted. Toggles now restore native functions. rAF uses scaled virtual timestamps, one callback per frame; native `cancelAnimationFrame` works. All four developer settings are implemented. |
> | Messaging / background | E03, E10, E11, E12, E13, E18, E20 | `notifications` permission + real icon added; duplicate `tabs.onUpdated` check removed; no `async` listener / no `return true`; auto-speed only overrides `speed`, not other settings; `storage.onChanged` keeps every tab in sync. |
> | Popup | E14, E15, E19, E21, E32–E35 | Single `DOMContentLoaded` handler, live DOM queries, all six toggles restored, `Number()` for fractional speeds, guarded `sendMessage`, one event type per control, CSS classes aligned. |
> | Options | E06, E36–E40, E42 | Zero `innerHTML` (all DOM-built), real hostname validation, `lastIndexOf(':')` parsing, complete reset, preset UI unhidden. |
> | Manifest / assets | E03, E17 | Correctly sized square PNG icons (48/96/128/256), monotone SVG made square, `data_collection_permissions.required: ["none"]`, `strict_min_version: "128.0"`. |
> | Docs / hygiene | E41, E43–E46 | README rewritten, MIT `LICENSE` added, `.gitignore` added, zips untracked, `<center>` removed, dead variables deleted, `white-space: pre-line` for multi-line errors. |
>
> See `README.md` for the new architecture and `tests/smoke.js` for the
> regression checks.

## Method

| Check | Result |
|---|---|
| `python -m json.tool manifest.json` | valid JSON |
| `node --check` on all 4 JS files | no syntax errors |
| ESLint 8 (`no-undef`, `no-unused-vars`, `no-dupe-*`, …) | 2 warnings only (2 unused variables) |
| `web-ext lint` v8.10.0 | **0 errors, 7 warnings, 1 notice** |
| Manual code review | 46 functional / security / packaging defects (E01–E46) |
| Node VM harness running the injected `pageScript()` with a fake clock | reproduced 6 runtime bugs (see "Reproduced" below) |

So: **there are no syntax/parse errors. The errors are behavioural** — and several of them break the extension's main feature.

---

## Summary table

Severity: 🔴 critical (feature broken / security), 🟠 high, 🟡 medium, ⚪ low.

| ID | Sev | Location | Problem |
|---|---|---|---|
| E01 | 🔴 | `content.js:424-478` | Global speed/settings are **never applied on page load** — only auto-speed sites are. |
| E02 | 🔴 | `content.js:390-398` | Inline `<script>` injection is blocked by page CSP on strict sites; `try/catch` cannot detect it. |
| E03 | 🔴 | `background.js:30-40`, `manifest.json:10-14` | `browser.notifications.create()` used without the `notifications` permission, with a non-existent icon path, and without awaiting/catching. |
| E04 | 🔴 | `content.js:78-87` | On mobile, `reloadTimers()` fires **only once ever** (`timerBatch` is never emptied). |
| E05 | 🔴 | `content.js:192-228`, `154-190` | `Date.now()` is rewritten to a **virtual epoch** that diverges from `new Date()`; mobile caps it at ~3×. |
| E06 | 🔴 | `options/options.js:92-103`, `174-175` | Free-text preset labels are injected into `innerHTML` → HTML injection in a privileged extension page (flagged by `web-ext lint`). |
| E07 | 🔴 | `content.js:368-387` | Any page script can `postMessage({action:'updateSettings', …})` and change the config — no source/origin check. |
| E08 | 🟠 | `content.js:161-188`, `199-227` | Turning a timing toggle **off does not restore the native function**; clocks stay throttled/quantised. |
| E09 | 🟠 | `content.js:61-63` | `Math.max(adjustedTimeout, 32)` on mobile makes short intervals **slower**, not faster. |
| E10 | 🟠 | `content.js:454-465` | Auto-speed activation overwrites all granular toggles and drops `autoClickClose`. |
| E11 | 🟠 | `content.js:425`, `background.js:43-51`, `popup/popup.js:105-117` | `checkAutoSpeed` runs 2-3× per page → duplicate "Auto-Speed Activated" notifications. |
| E12 | 🟠 | `content.js:296-363`, `368-387` | Auto-click-close never initialises on load, and its observer is never cleaned up properly. |
| E13 | 🟠 | `content.js:401`, `background.js:39` | `async` `onMessage` listener + unconditional `return true` — both explicitly warned against by MDN. |
| E14 | 🟠 | `popup/popup.js:64,91,170,207,285,384` | `parseInt()` truncates fractional speeds that the options page happily stores. |
| E15 | 🟠 | `popup/popup.js:2`, `149` | `speedButtons` is a stale NodeList after `innerHTML` replacement → highlighting never works. |
| E16 | 🟠 | `content.js:230-294` | rAF speed-up calls callbacks N times with the **same timestamp**; `lastTime` is shared globally. |
| E17 | 🟠 | `manifest.json:30-32,41-44` | Declared icon sizes don't match the actual files; one icon isn't square. |
| E18 | 🟠 | `background.js:4,10` vs `popup/popup.js:130,138` vs `content.js:4` | Three different default states (`2` / `1` / `1.0`, `[]` vs `{}`). |
| E19 | 🟠 | `popup/popup.js:175-180` | `autoClickToggle.checked` is never restored from storage. |
| E20 | 🟠 | `content.js:405-411` | Manual speed changes are silently ignored on any auto-speed site. |
| E21 | 🟠 | `popup/popup.js:105-117`, `127-203` | Two racing `DOMContentLoaded` handlers; the first can overwrite the second's UI state. |
| E22 | 🟡 | `content.js:36-40` | `processBatch()` throttles on mobile but never reschedules → speed changes are dropped. |
| E23 | 🟡 | `content.js:44-47` | Mobile `BATCH_SIZE=5` loop always restarts from the first entry → timers 6+ never reschedule. |
| E24 | 🟡 | `content.js:70` | `timer.id` becomes stale after `processBatch()`; only `customTimerId` is live. |
| E25 | 🟡 | `content.js:37` | `processBatch()` throttles using the **overridden (virtual) `Date.now()`**. |
| E26 | 🟡 | `content.js:117-121` | Google Ads branch divides by `speed` before the `speed === 0` guard → `Infinity` → 0 ms busy timer; ignores the `setInterval` toggle. |
| E27 | 🟡 | `content.js:276-279` | Mobile rAF early-break is dead code (`state.lastProcessed` was just set to `currentTime`). |
| E28 | 🟡 | `content.js:293` | `cancelAnimationFrame` is not overridden — rAF loops can't be cancelled. |
| E29 | 🟡 | `content.js:174-184`, `212-219` | `Math.floor()` destroys sub-ms precision; `value \|\| currentTime` misbehaves when the virtual value is `0`. |
| E30 | 🟡 | `content.js:305`, `307-314`, `310`, `343` | Auto-click misses a node that *is* `.close-btn`, marks clicked before visibility check, uses speed-scaled `setTimeout`, leaks `load` listeners. |
| E31 | 🟡 | `content.js:369` | `e.data.action` throws `TypeError` on `postMessage(null, '*')`. |
| E32 | 🟡 | `popup/popup.js:231,317,329,346,406`; `14-26` | `tabs.sendMessage()` unguarded → unhandled rejections on restricted tabs. |
| E33 | 🟡 | `popup/popup.js:167-168`, `361-362`, `456-457` | `click` + `touchend` on the same control can double-fire on mobile. |
| E34 | 🟡 | `popup/popup.js:54,68` | JS uses `.different-speed` / `.auto-active`; CSS defines `.modified` and no `.auto-active`. |
| E35 | 🟡 | `popup/popup.js:83-101` | Inactive branch never clears `.auto-active` / `.different-speed`. |
| E36 | 🟡 | `options/options.js:285-292` | `isValidDomain()` accepts paths, credentials, spaces-in-disguise; those entries can never match `location.hostname`. |
| E37 | 🟡 | `options/options.js:295-330` | `line.split(':')` breaks ports / IPv6; extra colons silently ignored. |
| E38 | 🟡 | `options/options.js:408-416` | "Reset to Default" does not reset `speed`, the five toggles, or `autoClickClose`. |
| E39 | 🟡 | `options/options.html:89` | Preset-button configuration UI is permanently hidden, yet ~120 lines of JS drive it. |
| E40 | 🟡 | whole repo | "Developer Settings" (`tickRate`, `useHighPrecisionTimer`, `useLegacyMode`, `optimizeForBattery`) are stored and passed around but **never read** by `content.js`. |
| E41 | ⚪ | `content.js:29`, `popup/popup.js:6` | Unused `emptyFunction`, `statusHint`. |
| E42 | ⚪ | `options/options.js:275-282`, `options.css` | Multi-line `\n` error messages collapse — `.status-message` has no `white-space: pre-line`. |
| E43 | ⚪ | `popup/popup.html:19,43` | Deprecated `<center>` tags. |
| E44 | ⚪ | `README.md:238` | Refers to a `LICENSE` file that does not exist. |
| E45 | ⚪ | `README.md:8,25,27,204,206`, `manifest.json:2` | Doc drift: "background service worker" (it's an MV2 event page), "cross-browser" (MV2 no longer loads in Chrome), "0x" (0 disables acceleration, doesn't stop time). |
| E46 | ⚪ | repo root | Four built `.zip` artifacts (~108 KB) are committed; no `.gitignore`. |

---

## Reproduced in a VM harness

I ran the injected `pageScript()` in a Node `vm` with a fake clock and fake timers. Results:

```
A. clocks overridden even at speed=1 with both toggles OFF (8 reads, 5ms apart):
   performance.now(): 100,100,100,100,120,120,120,120   -> 2 distinct values
   Date.now()       : 100,100,100,100,120,120,120,120   -> 2 distinct values

B. mobile interval rescheduling (original 1000ms interval):
   after 1st change (speed 1):  [1000]
   after 2nd change (speed 10): [1000]   <-- expected [100]
   after 3rd change (speed 50): [1000]   <-- expected [20]

C. desktop reload: id returned to page = 1, live ids = [2], period = 25 (4x)

D. listener with postMessage(null): TypeError: Cannot read properties of null (reading 'action')

E. spoofed config from a page script (speed=999) applied immediately (period 1.001ms)

F. rAF at 10x: timestamps 16,32,32,32,32,32,32,32,32,32,48,... -> 10 identical stamps per frame
```

---

## Details

### 1. Core functionality

**E01 — saved settings are never applied when a page loads (🔴).**
`content.js:425` calls only `checkAutoSpeedSite()`, which reads **only** `autoSpeedSites` from storage. It never reads `speed`, the five timing toggles, `autoClickClose`, or `developerSettings`. Consequently the page script starts from its hard-coded `speedConfig` (`content.js:3-12`: `speed: 1.0`, all toggles on). A user who sets 10× in the popup loses it on the next navigation/reload; the popup still shows 10× while the page runs at 1×. Auto-click-close (E12) has the same root cause.
*Fix:* at `document_start`, read all settings from `browser.storage.local` and `window.postMessage` them into the page script; merge auto-speed overrides on top rather than replacing.

**E02 — inline script injection is blocked by page CSP (🔴).**
`content.js:392-394` builds `<script>` with `textContent` from `pageScript.toString()`. In Firefox, a page's `Content-Security-Policy: script-src 'self'` (no `unsafe-inline`) blocks that inline script **in the page context**. The failure is a CSP violation reported to the console, not a thrown exception, so the `try/catch` at 391-398 does nothing. On such sites the extension silently does nothing. Firefox bug [1267027](https://bugzilla.mozilla.org/show_bug.cgi?id=1267027) tracks this.
*Fix:* register a MAIN-world script (`browser.scripting.registerContentScripts` with `world: 'MAIN'`, or FF `contentScripts.register`), or inject an external extension file via `web_accessible_resources` and relax the page CSP appropriately.

**E05 — `Date.now()` becomes a fictional clock (🔴).**
`content.js:199-227` seeds `dateNowValue` with the real epoch and then adds `timeDiff * speed`. After a minute at 10×, `Date.now()` is ~10 minutes in the future while `new Date().getTime()` (constructor is untouched) returns real time. Libraries that mix the two break. On mobile, `Math.min(timeDiff * speedMultiplier, 100)` with a ≥32 ms update interval caps virtual time at ~100/32 ≈ **3.1× regardless of the chosen speed**. `performance.now()` has the same cap.
*Fix:* keep a single virtual-clock origin shared by both overrides, apply the speed factor to the *delta from origin* (not accumulating after each read), and never cap it below the configured speed.

**E08 — toggles don't disable the overrides (🟠).**
`content.js:176` / `214` only change the multiplier to `1` when `performance` / `dateNow` is off; the 16/32 ms throttling and `Math.floor()` still apply (see harness A). The README's "Granular Control: enable/disable individual timing method speed control" is therefore false.
*Fix:* `if (!speedConfig.performance) return originalPerformanceNow();` etc.

**E09 — mobile clamps in the wrong direction (🟠).**
`content.js:61-63` uses `Math.max(adjustedTimeout, 32)`. A 16 ms animation interval at 2× becomes `max(8, 32) = 32 ms` — **2× slower**. Any interval below 32 ms is slowed down on mobile.

**E16 / E27 / E28 — rAF override (🟠/🟡).**
`content.js:271-280` loops `callback(timestamp)` N times with the *same* timestamp, so rAF animations that compute delta from the timestamp see `dt = 0` and don't move (harness F). `lastTime` (line 233) is global to all rAF loops, so multiple loops steal each other's delta. The mobile early-break at 276-279 compares `currentTime - state.lastProcessed` immediately after assigning `state.lastProcessed = currentTime`, so it's always `0` — dead code. `cancelAnimationFrame` is not overridden (line 293), so loops can't be cancelled.

**E26 — Google Ads special case (🟡).**
`content.js:117-121` runs before the `speed === 0` guard and ignores `speedConfig.setInterval`. With `speed = 0`, `timeout / 0 = Infinity`, which WebIDL converts to `0` → a maximum-rate timer instead of "Stop". It also builds `new Error().stack` on every `setInterval` call when `googletag` exists.

### 2. Auto-speed, messaging, background

**E03 — notifications are completely broken (🔴).**
`background.js:32-37` calls `browser.notifications.create()`, but `manifest.json:10-14` does not request the `notifications` permission ([MDN: "To use this API, you need to have the 'notifications' permission"](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/notifications)). The `iconUrl` at line 34 points at `icons/icon-48.svg`, which does not exist in this repo (nor in any of the four shipped zips — they contain `icon-96.svg`/`Icon.svg`). The returned promise is never awaited or caught, so failures become unhandled rejections. This has been broken since v1.0.

**E11 — duplicate notifications (🟠).**
`checkAutoSpeedSite()` runs at `content.js:425`, again from `background.js:46` on every `tabs.onUpdated` completion, and again from `popup/popup.js:111` every time the popup opens. Each run sends `showNotification` (line 437). Opening the popup on an auto-speed site pops a notification.

**E13 — messaging anti-patterns (🟠).**
`content.js:401` registers an `async` `onMessage` listener. [MDN explicitly warns](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage): "Do not prepend `async` to the function" / "If you pass an async function to addListener(), the listener returns a Promise for every message it receives, preventing other listeners from responding". `background.js:39` returns `true` unconditionally for *every* message, keeping the response channel open forever even though `sendResponse` is never called — senders' promises never settle and unhandled `runtime.sendMessage` rejects aren't caught.

**E10 — auto-speed clobbers user settings (🟠).**
`content.js:454-465` hard-codes `setInterval/setTimeout/performance/dateNow: true`, `requestAnimationFrame: false`, and omits `autoClickClose`. Since the message handler spreads settings wholesale (line 371-374), every auto-speed activation disables auto-click-close and resets the user's granular toggles.

**E20 — manual override prevention is too aggressive (🟠).**
`content.js:405-411` drops **all** `updateSettings` messages with `isAutoSpeed: false` when the host is in `autoSpeedSites`. That includes the auto-click toggle (`popup/popup.js:14-26`, which always sends `isAutoSpeed: false`) and every toggle change. Users cannot change anything on an auto-speed site.

**E07 / E31 — untrusted `postMessage` (🔴/🟡).**
`content.js:368-369` accepts `e.data.action === 'updateSettings'` from any window/iframe with no `e.source === window`, no `e.origin` check, and no type guard. MDN's own example checks both source and data. A page (harness E) can set `speed: 999` or `autoClickClose` at will. `e.data.action` also throws on `postMessage(null, '*')` (harness D). Both `postMessage` calls (lines 412, 454) use `"*"` as `targetOrigin`.

**E04 / E22 / E23 / E24 / E25 — timer batch machinery (🔴/🟡).**
`reloadTimers()` (`content.js:78-87`) pushes into `timerBatch` on mobile but never removes anything: `if (timerBatch.length === 0)` is true only once per page (harness B). It also schedules `processBatch` through the **speed-scaled** `window.setTimeout`. `processBatch` early-returns when throttled (line 38-40) without rescheduling, so a change within 100 ms of the last batch is lost. It throttles on the overridden virtual `Date.now()` (line 37). On mobile only the first 5 entries of `timers` are ever visited because the loop restarts from the beginning (line 44-47). After a batch, `timer.id` (line 70) no longer identifies the live interval (harness C).

**E12 / E30 — auto-click-close (🟠/🟡).**
`setupAutoClick()` is only reachable from the settings message handler (line 378-381), and no settings message is sent on page load (E01) → the feature never starts. `node.querySelectorAll('.close-btn')` (line 305) skips the case where the added node *is* the button. `dataset.autoClicked` is set (line 307) **before** the 100 ms visibility check (line 311), so a button that is hidden at that instant is never retried. That `setTimeout` is the overridden, speed-scaled one (line 310) — at 50× the check runs after 2 ms. Toggling the feature off/on re-registers a new `load` listener (line 343) without removing the old one.

### 3. Popup

**E15 — stale button list (🟠).** `speedButtons` (line 2) is captured before `DOMContentLoaded`; line 149 replaces `.speed-buttons`'s entire `innerHTML`. All of `updateAutoSpeedDisplay`'s button work (lines 63-82, 97-100) then operates on detached nodes — auto-speed highlighting never appears.

**E21 — two racing `DOMContentLoaded` handlers (🟠).** Lines 105-117 and 127-203 both run. The first asks the content script for status, whose `updateAutoSpeedStatus` broadcast can arrive before the second handler has built the buttons and restored the toggles, leaving "Current: 1x" / wrong button states.

**E19 — auto-click checkbox (🟠).** `settings.autoClickClose` is read at line 136 but never assigned to `autoClickToggle.checked` (lines 175-180 only set the five timing toggles). The checkbox always renders unchecked.

**E14 — fractional speeds (🟠).** The options page uses `parseFloat` and accepts e.g. `1.5` as a speed step and as an auto-speed value, but the popup uses `parseInt` everywhere (lines 64, 91, 170, 207, 285, 384). `1.5x` becomes `1x`; comparisons like `btnSpeed === status.speed` also fail for floats.

**E34 / E35 — CSS class drift (🟡).** JS adds `.different-speed` (line 54) and `.auto-active` (line 68); `popup.css` defines `.auto-trigger-btn.modified` instead and has no `.auto-active` rule. The inactive branch (lines 83-101) never removes either class.

**E32 / E33 — unguarded errors and double taps (🟡).** `browser.tabs.sendMessage` at lines 231, 317, 329, 346, 406 and 21 has no `try/catch`, so on privileged/restricted tabs every click produces an unhandled rejection. `click` + `touchend` are both bound to the same buttons (167-168, 361-362, 456-457) with `preventDefault()` on `touchend`; on browsers that still synthesise a click, `handleAutoTrigger` runs twice (enable → disable).

**E18 — defaults disagree (🟠).** `background.js:4` installs `speed: 2` and `autoSpeedSites: []` (an array), while `popup/popup.js:130,138` defaults to `speed: 1` / `{}`, and `content.js:4` starts at `1.0`. Right after install the popup highlights 2× while the page runs at 1×.

### 4. Options page

**E06 — HTML injection (🔴).** `options/options.js:92-103` interpolates the user-supplied `preset.label` straight into `data-label="…"` and `value="…"`; line 175 interpolates it into button text. A label like `"><img src=x onerror=…>` breaks out of the attribute. `web-ext lint` flags all four `innerHTML` assignments (`UNSAFE_VAR_ASSIGNMENT` at `options.js:68,92,174` and `popup.js:149`). The MV2 extension CSP (`script-src 'self'`) blocks inline handlers, which limits this to DOM/UI injection rather than full script execution — but it is still a real injection sink in a privileged page. *Fix:* build DOM nodes with `createElement`/`textContent`/`setAttribute`.

**E36 / E37 — weak parsing (🟡).** `isValidDomain()` (line 285-292) does `new URL('http://' + domain)`, which accepts `example.com/path`, `user:pass@example.com`, `example.com:8080` and backslash tricks — none of which can ever equal `window.location.hostname`. `parseWebsitesList()` (line 299-330) does `line.split(':')` and only reads `parts[0]`/`parts[1]`, so ports and IPv6 fail and extra colons are silently ignored. Hostname matching is exact, so no wildcard/subdomain support (the README's "add the www." note).

**E38 — incomplete reset (🟡).** `resetButton` (line 408-416) resets `speedSteps`, `presetButtons`, `autoSpeedSites`, `developerSettings` but not `speed`, the five timing toggles, or `autoClickClose`.

**E39 / E40 / E42 — dead features (🟡).** `options/options.html:89` hides the entire "Preset Buttons Configuration" section with `style="display: none;"`, yet ~120 lines of JS manage it. All four "Developer Settings" are written to storage and copied into every settings object by the popup, but `content.js` never reads any of them. `showStatus()` joins errors with `\n`, but `.status-message` has no `white-space: pre-line`, so multi-line parse errors render as one line.

### 5. Manifest, assets, packaging

**E17 — icon metadata (🟠).** `web-ext lint` reports 2× `ICON_SIZE_INVALID` and 1× `ICON_NOT_SQUARE`:
- `icons/Icon.png` is **256×256** but declared as `"128"`.
- `icons/Icon.svg` is **256×256** but declared as `"48"` and `"96"`.
- `icons/Icon 256 - Monotone.svg` is **152.193×109.124** (not square) but declared as `"256"`.

**E03 (cont.)** `icons/icon-48.svg` referenced by `background.js:34` does not exist. `web-ext lint` also emits `MISSING_DATA_COLLECTION_PERMISSIONS` (notice) — add `browser_specific_settings.gecko.data_collection_permissions` for current AMO submissions.

**E44 / E45 / E46 — docs & hygiene (⚪).** `README.md:238` points to a non-existent `LICENSE`. The README calls the background script a "service worker" (it is an MV2 event page with `persistent: false`), claims cross-browser compatibility (MV2 no longer loads in Chromium), and describes "0x" speed (0 actually disables acceleration and restores native timers — the same as the "Normal" button). Four ~108 KB build zips are committed to git with no `.gitignore`. Deprecated `<center>` tags in `popup.html:19,43`.

---

## Recommended fix order

1. **E01 + E02** — apply saved settings at `document_start` and make injection CSP-safe. Nothing else matters until the core feature works on every site.
2. **E03, E17** — add the `notifications` permission (or drop the feature), fix the icon path, and correct icon sizes/paths.
3. **E04, E22, E23, E25, E09** — rewrite the timer/clock engine around one virtual clock; delete the mobile batch machinery or fix it properly.
4. **E05, E08, E16** — make overrides genuinely toggleable and consistent with each other.
5. **E06, E07, E13, E31** — security hardening: escape all `innerHTML`, validate `postMessage` source, fix `onMessage` semantics.
6. **E10, E11, E12, E18, E19, E20, E21** — unify settings state across background / popup / content / page.
7. **E14, E34, E35, E38, E39, E40, E42, E44-E46** — UI, docs, dead code and packaging cleanup.

> This document was originally an audit-only report. As of v3.2 every item above
> has been fixed; it is retained as a regression checklist.
