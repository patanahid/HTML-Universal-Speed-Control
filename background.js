/* Background event page: default settings and notifications only.
 * All timing work happens in content.js / page/page.js.
 */
(function () {
  'use strict';

  var USC = globalThis.USC;

  async function ensureDefaults() {
    var defaults = USC.clone(USC.DEFAULTS);
    var existing = await browser.storage.local.get(Object.keys(defaults));
    var missing = {};
    Object.keys(defaults).forEach(function (key) {
      if (existing[key] === undefined) missing[key] = defaults[key];
    });
    if (Object.keys(missing).length > 0) {
      await browser.storage.local.set(missing);
    }
  }

  browser.runtime.onInstalled.addListener(function () {
    ensureDefaults().catch(function (error) {
      console.error('[Speed Controller] could not initialise defaults:', error);
    });
  });
  browser.runtime.onStartup.addListener(function () {
    ensureDefaults().catch(function (error) {
      console.error('[Speed Controller] could not initialise defaults:', error);
    });
  });

  browser.runtime.onMessage.addListener(function (message) {
    if (!message || message.action !== 'showNotification') return false;

    // "notifications" is declared in manifest.json; icon-48.png is a real file.
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-48.png'),
      title: String(message.title || 'Speed Controller'),
      message: String(message.message || '')
    }).catch(function (error) {
      console.error('[Speed Controller] notification failed:', error);
    });
    // No `return true`: nothing is going to call sendResponse().
    return undefined;
  });
})();
