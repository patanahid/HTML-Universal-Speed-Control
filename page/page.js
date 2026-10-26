/* MAIN-world timing engine for HTML Universal Speed Controller.
 *
 * Declared with "world": "MAIN" at document_start in manifest.json, so it runs
 * BEFORE any page script and is NOT affected by the page's CSP (Firefox 128+).
 * It is also usable as a plain <script src> (the fallback in content.js), so it
 * must remain self-contained: no browser.* APIs, no imports.
 *
 * Everything is driven by a single virtual clock. Turning a toggle off really
 * does restore the native function.
 */
(function () {
  'use strict';

  if (window.__uscPageInstalled) return;
  window.__uscPageInstalled = true;

  /* Keep in sync with CHANNEL in shared/settings.js. */
  var CHANNEL = 'html-universal-speed-controller/v3.2';
  var MAX_DELAY = 2147483647; // largest value a WebIDL long timeout accepts

  var native = {
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    raf: window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null,
    dateNow: Date.now.bind(Date)
  };
  native.perfNow = (window.performance && window.performance.now)
    ? window.performance.now.bind(window.performance)
    : function () { return native.dateNow(); };

  function defaultConfig() {
    return {
      speed: 1,
      setInterval: false,
      setTimeout: false,
      performance: false,
      dateNow: false,
      requestAnimationFrame: false,
      autoClickClose: false,
      tickRate: 60,
      useHighPrecisionTimer: false,
      useLegacyMode: false,
      optimizeForBattery: false
    };
  }

  var cfg = defaultConfig(); // inert until the content script sends real settings

  /* ------------------------------------------------------------------ clock */

  function multiplier() {
    return cfg.speed > 0 ? cfg.speed : 1;
  }

  function active() {
    return cfg.speed > 0;
  }

  function tickMs() {
    return 1000 / Math.min(1000, Math.max(1, Number(cfg.tickRate) || 60));
  }

  /* Quantisation is opt-in only. By default the virtual clock keeps at least
   * millisecond resolution and is never throttled (fixes the old 16ms/32ms
   * stutter and the mobile ~3x cap). */
  function shape(value) {
    if (cfg.useLegacyMode || cfg.optimizeForBattery) {
      var tick = tickMs();
      return Math.floor(value / tick) * tick;
    }
    // Even in "normal" mode we keep microsecond resolution: rounding to whole
    // milliseconds would break games and profilers that rely on sub-ms timing.
    return cfg.useHighPrecisionTimer ? value : Math.round(value * 1000) / 1000;
  }

  /* One anchor keeps performance.now() and Date.now() coherent with each other
   * and continuous across speed changes. */
  var anchor = null;

  function reanchor() {
    var realPerf = native.perfNow();
    var realDate = native.dateNow();
    anchor = {
      realPerf: realPerf,
      realDate: realDate,
      virtPerf: anchor ? virtualPerf(realPerf) : realPerf,
      virtDate: anchor ? virtualDate(realDate) : realDate,
      speed: multiplier()
    };
  }

  function virtualPerf(realPerf) {
    if (!anchor || !active()) return realPerf;
    return anchor.virtPerf + (realPerf - anchor.realPerf) * anchor.speed;
  }

  function virtualDate(realDate) {
    if (!anchor || !active()) return realDate;
    return anchor.virtDate + (realDate - anchor.realDate) * anchor.speed;
  }

  reanchor();

  /* ----------------------------------------------------------------- timers */

  function scaleDelay(delay, enabled) {
    var value = Number(delay);
    if (!Number.isFinite(value) || value < 0) value = 0;
    if (!active() || !enabled || multiplier() === 1) return value;
    var adjusted = value / multiplier();
    if (cfg.useLegacyMode) {
      var tick = tickMs();
      adjusted = Math.max(tick, Math.ceil(adjusted / tick) * tick);
    }
    return Math.min(adjusted, MAX_DELAY);
  }

  /* id -> record; a record also remembers every id ever handed to the page so
   * clearInterval() keeps working after a reschedule. */
  var intervals = new Map();

  function startInterval(record) {
    var id = native.setInterval(
      record.handler,
      scaleDelay(record.delay, cfg.setInterval),
      ...record.args
    );
    record.liveId = id;
    record.ids.add(id);
    // Keep every id ever handed to the page pointing at this record.
    record.ids.forEach(function (known) { intervals.set(known, record); });
    return id;
  }

  function rescheduleIntervals() {
    var records = new Set(intervals.values());
    intervals.clear();
    records.forEach(function (record) {
      native.clearInterval(record.liveId);
      startInterval(record);
    });
  }

  window.setInterval = function (handler, delay) {
    var args = Array.prototype.slice.call(arguments, 2);
    // Always track intervals, even while paused, so re-enabling speed control
    // can reschedule timers that were created while it was off.
    var record = {
      handler: handler,
      delay: Number(delay) || 0,
      args: args,
      liveId: null,
      ids: new Set()
    };
    return startInterval(record);
  };

  window.setTimeout = function (handler, delay) {
    var args = Array.prototype.slice.call(arguments, 2);
    return native.setTimeout.apply(
      window,
      [handler, scaleDelay(delay, cfg.setTimeout)].concat(args)
    );
  };

  window.clearInterval = function (id) {
    var record = intervals.get(id);
    if (!record) {
      native.clearInterval(id);
      return;
    }
    native.clearInterval(record.liveId);
    record.ids.forEach(function (known) { intervals.delete(known); });
  };

  /* clearTimeout needs no wrapper: setTimeout returns the native id. */

  /* ----------------------------------------------------------- clock APIs */

  if (window.performance && typeof window.performance.now === 'function') {
    try {
      window.performance.now = function () {
        if (!active() || !cfg.performance) return native.perfNow();
        return shape(virtualPerf(native.perfNow()));
      };
    } catch (e) {
      // A page can freeze its Performance object; skip this override only.
      if (window.console && console.warn) console.warn('[Speed Controller] performance.now is read-only');
    }
  }

  Date.now = function () {
    if (!active() || !cfg.dateNow) return native.dateNow();
    return Math.round(shape(virtualDate(native.dateNow())));
  };

  /* -------------------------------------------------------------------- rAF */

  /* One callback per real frame with a coherent *virtual* timestamp. This is
   * safer than replaying the callback N times with an identical timestamp.
   * We return the native handle and never re-schedule internally, so the
   * browser's own cancelAnimationFrame() keeps working (no override needed). */
  if (native.raf) {
    window.requestAnimationFrame = function (callback) {
      if (!active() || !cfg.requestAnimationFrame) return native.raf(callback);
      return native.raf(function (timestamp) {
        callback(shape(virtualPerf(timestamp)));
      });
    };
  }

  /* --------------------------------------------------------- auto-click close */

  var autoClickObserver = null;
  var clickAttempts = new WeakSet();

  function waitAndClick(button, attempt) {
    if (!cfg.autoClickClose || !button.isConnected) return;
    var visible = button.offsetParent !== null ||
      (button.getClientRects && button.getClientRects().length > 0);
    if (visible) {
      button.click();
      return;
    }
    if (attempt < 20) {
      native.setTimeout(function () { waitAndClick(button, attempt + 1); }, 50);
    }
  }

  function scanForCloseButtons(node) {
    if (!cfg.autoClickClose || !node || node.nodeType !== 1) return;
    var found = [];
    if (node.matches && node.matches('.close-btn')) found.push(node);
    if (node.querySelectorAll) {
      Array.prototype.push.apply(found, node.querySelectorAll('.close-btn'));
    }
    found.forEach(function (button) {
      if (clickAttempts.has(button)) return;
      clickAttempts.add(button);
      waitAndClick(button, 0);
    });
  }

  function setAutoClick(enabled) {
    if (!enabled) {
      if (autoClickObserver) autoClickObserver.disconnect();
      return;
    }
    if (!autoClickObserver) {
      autoClickObserver = new MutationObserver(function (records) {
        records.forEach(function (record) {
          Array.prototype.forEach.call(record.addedNodes, scanForCloseButtons);
        });
      });
    }
    // document is always a valid observation target, even at document_start.
    autoClickObserver.observe(document, { childList: true, subtree: true });
    scanForCloseButtons(document.documentElement || document.body || document);
  }

  /* ------------------------------------------------------------ config in */

  function applySettings(next) {
    var previousSpeed = multiplier();
    var previousSetInterval = cfg.setInterval;
    var previousLegacy = cfg.useLegacyMode;
    var previousTickRate = cfg.tickRate;

    var merged = defaultConfig();
    Object.keys(merged).forEach(function (key) {
      if (typeof merged[key] === 'boolean') {
        if (typeof next[key] === 'boolean') merged[key] = next[key];
      } else if (Number.isFinite(Number(next[key])) && next[key] !== null) {
        merged[key] = Number(next[key]);
      }
    });
    merged.speed = Math.min(1000, Math.max(0, merged.speed));
    merged.tickRate = Math.min(1000, Math.max(1, merged.tickRate || 60));
    cfg = merged;

    if (multiplier() !== previousSpeed) reanchor();
    if (multiplier() !== previousSpeed || cfg.setInterval !== previousSetInterval ||
        cfg.useLegacyMode !== previousLegacy || cfg.tickRate !== previousTickRate) {
      rescheduleIntervals();
    }
    setAutoClick(cfg.autoClickClose);
  }

  window.addEventListener('message', function (event) {
    // A content-script postMessage normally reports source === window, but some
    // engines report null. Reject only messages that definitely come from a
    // different window (e.g. a cross-origin iframe trying to spoof settings).
    if (event.source && event.source !== window) return;
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.channel !== CHANNEL || data.direction !== 'content-to-page') return;
    if (!data.settings || typeof data.settings !== 'object') return;
    try {
      applySettings(data.settings);
    } catch (error) {
      // Never let a bad message break the page's event loop.
      if (window.console && console.warn) console.warn('[Speed Controller]', error);
    }
  });

  /* Readiness marker for the (rare) fallback injection in content.js. */
  function markReady() {
    var root = document.documentElement;
    if (root && root.setAttribute) root.setAttribute('data-usc-page-ready', '1');
  }
  markReady();
  document.addEventListener('DOMContentLoaded', markReady, { once: true });
})();
