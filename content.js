/* Isolated-world content script: owns storage/settings and drives the
 * MAIN-world timing engine (page/page.js) through window.postMessage.
 *
 * It never injects inline JavaScript. The MAIN-world script is declared in
 * manifest.json, which makes it immune to the page's CSP (Firefox 128+).
 * A guarded external-script fallback covers engines without MAIN-world
 * support; it only runs when the MAIN-world script did not start.
 */
(function () {
  'use strict';

  var USC = globalThis.USC;
  var DEFAULTS = USC.DEFAULTS;
  var CHANNEL = USC.CHANNEL;
  var targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;

  var lastNotifiedSpeed = null;

  /* ------------------------------------------------------- page script boot */

  function pageScriptReady() {
    var root = document.documentElement;
    return !!(root && root.getAttribute('data-usc-page-ready') === '1');
  }

  function ensurePageScript() {
    if (pageScriptReady()) return;
    // Fallback for engines where "world": "MAIN" is unavailable.
    var script = document.createElement('script');
    script.src = browser.runtime.getURL('page/page.js');
    script.async = false;
    script.addEventListener('load', function () { script.remove(); });
    script.addEventListener('error', function () { script.remove(); });
    var parent = document.head || document.documentElement || document;
    parent.appendChild(script);
  }

  function postConfig(config) {
    window.postMessage({
      channel: CHANNEL,
      direction: 'content-to-page',
      settings: config
    }, targetOrigin);
  }

  /* ------------------------------------------------------------- settings */

  function currentHost() {
    try { return window.location.hostname || ''; } catch (e) { return ''; }
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  async function resolveSettings() {
    var stored = await browser.storage.local.get(USC.clone(DEFAULTS));
    var settings = USC.normalizeSettings(stored);
    var host = currentHost();
    var autoSpeed = null;

    if (host && hasOwn(settings.autoSpeedSites, host)) {
      autoSpeed = USC.clampSpeed(settings.autoSpeedSites[host]);
      settings.speed = autoSpeed; // auto-speed wins over the global speed only
    }
    return { settings: settings, autoSpeed: autoSpeed, host: host };
  }

  /* Reads storage, pushes the resolved config to the page and (optionally)
   * notifies about auto-speed. Never throws into a message handler.
   *
   * The popup derives its status from storage itself; broadcasting status from
   * every tab would let an inactive tab overwrite the popup's domain. */
  async function applySettings(options) {
    var opts = options || {};
    var resolved = await resolveSettings();

    postConfig(USC.toPageConfig(resolved.settings));

    if (resolved.autoSpeed !== null && !opts.silent && resolved.settings.showNotifications &&
        resolved.autoSpeed !== lastNotifiedSpeed) {
      lastNotifiedSpeed = resolved.autoSpeed;
      browser.runtime.sendMessage({
        action: 'showNotification',
        title: 'Auto-Speed Activated',
        message: 'Speed set to ' + resolved.autoSpeed + 'x for ' + resolved.host
      }).catch(function () { /* background may be unavailable */ });
    }
    if (resolved.autoSpeed === null) lastNotifiedSpeed = null;

    return { ok: true, speed: resolved.settings.speed, autoSpeed: resolved.autoSpeed };
  }

  /* --------------------------------------------------------- message input */

  browser.runtime.onMessage.addListener(function (message) {
    if (!message || typeof message !== 'object') return false;

    switch (message.action) {
      case 'updateSettings':
        // Settings live in storage; the message is only a nudge. This keeps
        // manual speed overrides suppressed on auto-speed sites while still
        // applying every other setting immediately.
        return applySettings({ silent: true });
      case 'checkAutoSpeed':
        return applySettings({ silent: true });
      default:
        return false; // not our message; do not claim an async response
    }
  });

  /* Any tab reacts to settings changed anywhere (popup, options, another tab).
   * Feature-detect the event so an engine without it cannot break startup —
   * explicit updateSettings/checkAutoSpeed messages still cover those cases. */
  if (browser.storage.onChanged && typeof browser.storage.onChanged.addListener === 'function') {
    browser.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'local') return;
      applySettings({ silent: true }).catch(function (error) {
        console.error('[Speed Controller] failed to apply settings:', error);
      });
    });
  }

  ensurePageScript();
  applySettings().catch(function (error) {
    console.error('[Speed Controller] failed to initialise:', error);
  });
})();
