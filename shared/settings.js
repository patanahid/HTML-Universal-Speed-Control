/* Shared, dependency-free settings helpers.
 * Loaded in the background page, both content-script worlds, the popup and the
 * options page so there is exactly ONE definition of the default state.
 */
(function (root) {
  'use strict';

  var DEFAULT_PRESETS = [
    { label: 'Normal', speed: 1 },
    { label: 'Fast', speed: 5 },
    { label: 'Very Fast', speed: 20 },
    { label: 'Ultra Fast', speed: 50 }
  ];

  var DEFAULT_DEVELOPER_SETTINGS = {
    tickRate: 60,
    useHighPrecisionTimer: false,
    useLegacyMode: false,
    optimizeForBattery: false
  };

  var DEFAULTS = Object.freeze({
    speed: 1,                 // 0 = all timing overrides disabled ("Stop")
    setInterval: true,
    setTimeout: true,
    performance: true,
    dateNow: true,
    requestAnimationFrame: false,
    autoClickClose: false,
    showNotifications: true,
    autoSpeedSites: {},       // hostname -> speed
    speedSteps: [2, 5, 10, 20, 50],
    presetButtons: DEFAULT_PRESETS,
    developerSettings: DEFAULT_DEVELOPER_SETTINGS
  });

  /* Must stay in sync with CHANNEL in page/page.js. */
  var CHANNEL = 'universal-speed-controller/v3.2';

  var BOOLEAN_KEYS = [
    'setInterval', 'setTimeout', 'performance', 'dateNow',
    'requestAnimationFrame', 'autoClickClose', 'showNotifications'
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  /* A speed is a finite number in [0, 1000]. Fractional speeds are allowed. */
  function clampSpeed(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 1000);
  }

  function isValidSpeedString(value) {
    if (typeof value !== 'string' || value.trim() === '') return false;
    var n = Number(value.trim());
    return Number.isFinite(n) && n >= 0 && n <= 1000;
  }

  /* Hostnames are matched exactly against window.location.hostname. */
  function isValidHostname(value) {
    if (typeof value !== 'string') return false;
    var host = value.trim().toLowerCase();
    if (!host || host.length > 253) return false;

    if (/^\[[0-9a-f:]+\]$/i.test(host)) return true; // IPv6 literal
    if (!/^[a-z0-9.-]+$/.test(host)) return false;
    if (host.indexOf('..') !== -1 || host.charAt(0) === '.' || host.charAt(host.length - 1) === '.') return false;

    return host.split('.').every(function (label) {
      return label.length > 0 && label.length <= 63 &&
        label.charAt(0) !== '-' && label.charAt(label.length - 1) !== '-';
    });
  }

  /* Accepts "example.com", "example.com:8080", "https://example.com/path",
   * "user@example.com" and returns a bare hostname (or '' when invalid). */
  function normalizeHost(value) {
    if (typeof value !== 'string') return '';
    var text = value.trim().toLowerCase();
    if (!text) return '';

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
      try {
        text = new URL(text).hostname.toLowerCase();
      } catch (e) {
        return '';
      }
    } else {
      text = text.split(/[/?#]/)[0];       // strip path / query / hash
      text = text.replace(/^.*@/, '');      // strip credentials
      var match = text.match(/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/);
      text = match ? match[1] : text;        // strip port
    }
    return isValidHostname(text) ? text : '';
  }

  function normalizeAutoSpeedSites(raw) {
    var out = {};
    /* Older builds stored an array here. Migrate string keys off of it. */
    if (Array.isArray(raw)) raw = Object.assign({}, raw);
    if (!raw || typeof raw !== 'object') return out;

    Object.keys(raw).forEach(function (key) {
      var host = normalizeHost(key);
      if (!host || !isValidSpeedString(String(raw[key]))) return;
      out[host] = clampSpeed(raw[key]);
    });
    return out;
  }

  function normalizeSpeedSteps(raw) {
    if (!Array.isArray(raw)) return clone(DEFAULTS.speedSteps);
    var seen = Object.create(null);
    var steps = [];
    raw.forEach(function (step) {
      var n = Number(step);
      if (!Number.isFinite(n) || n < 0 || n > 1000) return;
      if (seen[n]) return;
      seen[n] = true;
      steps.push(n);
    });
    steps.sort(function (a, b) { return a - b; });
    return steps;
  }

  function normalizePresets(raw) {
    if (!Array.isArray(raw)) return clone(DEFAULT_PRESETS);
    return raw
      .filter(function (p) {
        return p && typeof p === 'object' && typeof p.label === 'string' &&
          p.label.trim() !== '' && Number.isFinite(Number(p.speed));
      })
      .map(function (p) {
        return { label: p.label.trim(), speed: clampSpeed(p.speed) };
      });
  }

  function normalizeDeveloperSettings(raw) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    return {
      tickRate: Math.round(clamp(src.tickRate, 1, 1000)) || DEFAULT_DEVELOPER_SETTINGS.tickRate,
      useHighPrecisionTimer: typeof src.useHighPrecisionTimer === 'boolean'
        ? src.useHighPrecisionTimer : DEFAULT_DEVELOPER_SETTINGS.useHighPrecisionTimer,
      useLegacyMode: typeof src.useLegacyMode === 'boolean'
        ? src.useLegacyMode : DEFAULT_DEVELOPER_SETTINGS.useLegacyMode,
      optimizeForBattery: typeof src.optimizeForBattery === 'boolean'
        ? src.optimizeForBattery : DEFAULT_DEVELOPER_SETTINGS.optimizeForBattery
    };
  }

  /* Always returns a complete, sanitised settings object. */
  function normalizeSettings(raw) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    var settings = clone(DEFAULTS);

    if (src.speed !== undefined) settings.speed = clampSpeed(src.speed);
    BOOLEAN_KEYS.forEach(function (key) {
      if (typeof src[key] === 'boolean') settings[key] = src[key];
    });
    settings.autoSpeedSites = normalizeAutoSpeedSites(src.autoSpeedSites);
    settings.speedSteps = normalizeSpeedSteps(src.speedSteps);
    settings.presetButtons = normalizePresets(src.presetButtons);
    settings.developerSettings = normalizeDeveloperSettings(src.developerSettings);
    return settings;
  }

  /* Builds the settings object that is sent to the MAIN-world page script. */
  function toPageConfig(settings) {
    var dev = settings.developerSettings;
    return {
      speed: settings.speed,
      setInterval: settings.setInterval,
      setTimeout: settings.setTimeout,
      performance: settings.performance,
      dateNow: settings.dateNow,
      requestAnimationFrame: settings.requestAnimationFrame,
      autoClickClose: settings.autoClickClose,
      tickRate: dev.tickRate,
      useHighPrecisionTimer: dev.useHighPrecisionTimer,
      useLegacyMode: dev.useLegacyMode,
      optimizeForBattery: dev.optimizeForBattery
    };
  }

  function parseWebsitesList(text) {
    var sites = {};
    var errors = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (rawLine, index) {
      var line = rawLine.trim();
      if (!line) return;

      var splitAt = line.lastIndexOf(':');
      if (splitAt <= 0) {
        errors.push('Line ' + (index + 1) + ': expected "domain:speed"');
        return;
      }
      var host = normalizeHost(line.slice(0, splitAt));
      var speedText = line.slice(splitAt + 1).trim();

      if (!host) {
        errors.push('Line ' + (index + 1) + ': invalid domain "' + line.slice(0, splitAt) + '"');
        return;
      }
      if (!isValidSpeedString(speedText)) {
        errors.push('Line ' + (index + 1) + ': speed must be a number from 0 to 1000');
        return;
      }
      sites[host] = clampSpeed(speedText);
    });
    return { sites: sites, errors: errors };
  }

  root.USC = {
    DEFAULTS: DEFAULTS,
    CHANNEL: CHANNEL,
    DEFAULT_PRESETS: DEFAULT_PRESETS,
    DEFAULT_DEVELOPER_SETTINGS: DEFAULT_DEVELOPER_SETTINGS,
    clone: clone,
    clamp: clamp,
    clampSpeed: clampSpeed,
    isValidSpeedString: isValidSpeedString,
    isValidHostname: isValidHostname,
    normalizeHost: normalizeHost,
    normalizeSettings: normalizeSettings,
    normalizeSpeedSteps: normalizeSpeedSteps,
    normalizePresets: normalizePresets,
    normalizeDeveloperSettings: normalizeDeveloperSettings,
    toPageConfig: toPageConfig,
    parseWebsitesList: parseWebsitesList
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
