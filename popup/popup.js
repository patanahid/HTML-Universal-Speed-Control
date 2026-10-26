(function () {
  'use strict';

  var USC = globalThis.USC;
  var TOGGLE_IDS = [
    'setIntervalToggle', 'setTimeoutToggle', 'performanceToggle',
    'dateNowToggle', 'requestAnimationFrameToggle', 'autoClickToggle'
  ];
  // Maps a checkbox id to the storage key it controls.
  var TOGGLE_KEYS = {
    setIntervalToggle: 'setInterval',
    setTimeoutToggle: 'setTimeout',
    performanceToggle: 'performance',
    dateNowToggle: 'dateNow',
    requestAnimationFrameToggle: 'requestAnimationFrame',
    autoClickToggle: 'autoClickClose'
  };

  var el = {};
  var state = {
    settings: null,
    host: '',
    autoSpeed: null,   // speed saved for this host, or null
    currentSpeed: 1
  };
  var feedbackTimer = null;

  function $(id) { return document.getElementById(id); }

  function formatSpeed(value) {
    var number = Number(value);
    if (number === 0) return 'Off';
    return (Math.round(number * 100) / 100) + 'x';
  }

  function showFeedback(text, isError) {
    var box = el.feedback;
    if (!box) return;
    box.textContent = text;
    box.className = 'feedback show' + (isError ? ' error' : '');
    box.hidden = false;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(function () {
      box.hidden = true;
      box.className = 'feedback';
    }, 3000);
  }

  /* Always query the live DOM: buttons are rebuilt on load, so a cached
   * NodeList would refer to detached nodes. */
  function speedButtons() {
    return Array.prototype.slice.call(el.speedButtons.querySelectorAll('.speed-btn'));
  }

  function makeSpeedButton(label, value, extraClass) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'speed-btn' + (extraClass ? ' ' + extraClass : '');
    button.dataset.speed = String(value);
    button.textContent = label;
    button.addEventListener('click', function () {
      onSpeedClick(Number(button.dataset.speed), button);
    });
    return button;
  }

  function renderSpeedButtons() {
    var fragment = document.createDocumentFragment();
    fragment.appendChild(makeSpeedButton('Normal', 1));

    state.settings.speedSteps.forEach(function (step) {
      fragment.appendChild(makeSpeedButton(formatSpeed(step), step));
    });
    // "Stop" now genuinely switches every timing override off.
    var stop = makeSpeedButton('Stop', 0, 'stop-btn');
    stop.title = 'Disable all timing overrides (native browser speed)';
    fragment.appendChild(stop);

    el.speedButtons.textContent = '';
    el.speedButtons.appendChild(fragment);
    markActiveSpeed(state.currentSpeed);
  }

  function markActiveSpeed(value) {
    speedButtons().forEach(function (button) {
      button.classList.toggle('active', Number(button.dataset.speed) === Number(value));
    });
  }

  function setToggleValues() {
    TOGGLE_IDS.forEach(function (id) {
      el[id].checked = !!state.settings[TOGGLE_KEYS[id]];
    });
  }

  function collectToggles() {
    var result = {};
    TOGGLE_IDS.forEach(function (id) {
      result[TOGGLE_KEYS[id]] = el[id].checked;
    });
    return result;
  }

  /* ------------------------------------------------------------- messaging */

  function activeTab() {
    return browser.tabs.query({ active: true, currentWindow: true })
      .then(function (tabs) { return tabs[0]; });
  }

  function nudge(message) {
    return activeTab().then(function (tab) {
      if (!tab || typeof tab.id !== 'number') return;
      return browser.tabs.sendMessage(tab.id, message || { action: 'updateSettings' });
    }).catch(function () {
      // Restricted pages (about:*, addons.mozilla.org, ...) have no content
      // script. Settings are still stored and apply on the next real page.
      showFeedback('This page is protected by the browser; settings apply on the next normal page.', false);
    });
  }

  function readSettings() {
    return browser.storage.local.get(USC.clone(USC.DEFAULTS))
      .then(USC.normalizeSettings);
  }

  function writeSettings(partial) {
    return browser.storage.local.set(partial).then(function () { return nudge(); });
  }

  /* ------------------------------------------------------------ auto-speed */

  function updateAutoSpeedDisplay(status) {
    var active = !!status.active;
    state.autoSpeed = active ? USC.clampSpeed(status.speed) : null;
    // A status broadcast from the content script does not know which preset the
    // user just clicked, so a missing currentSpeed means "keep the popup value".
    if (active && status.currentSpeed != null) {
      state.currentSpeed = USC.clampSpeed(status.currentSpeed);
    }

    el.autoStatus.textContent = active ? 'Auto: On' : 'Auto: Off';
    el.autoSpeed.textContent = active ? (status.domain || state.host) : '';
    el.autoTrigger.classList.toggle('active', active);

    el.currentSpeedStatus.textContent = formatSpeed(state.currentSpeed);
    el.savedSpeedStatus.textContent = active ? formatSpeed(state.autoSpeed) : 'None';

    var differs = active && Number(state.currentSpeed) !== Number(state.autoSpeed);
    el.autoTrigger.classList.toggle('different-speed', differs);
    el.hint.textContent = differs
      ? 'Click auto-speed to update saved speed'
      : (active ? 'Click auto-speed to disable' : 'Click auto-speed to save current speed');

    speedButtons().forEach(function (button) {
      var value = Number(button.dataset.speed);
      button.classList.toggle('active', value === Number(state.currentSpeed));
      button.classList.toggle('auto-active', active && value === Number(state.autoSpeed));
      button.title = active && value === Number(state.autoSpeed)
        ? 'Auto-speed for ' + (status.domain || state.host) : '';
    });
  }

  function onAutoTriggerClick() {
    var selected = state.currentSpeed;
    var sites = Object.assign({}, state.settings.autoSpeedSites);
    var activeHere = state.host && Object.prototype.hasOwnProperty.call(sites, state.host);

    if (activeHere && Number(sites[state.host]) === Number(selected)) {
      // Clicking again with the same speed disables auto-speed.
      delete sites[state.host];
    } else if (state.host) {
      sites[state.host] = USC.clampSpeed(selected);
    } else {
      showFeedback('Auto-speed needs a real hostname (not a browser-internal page).', true);
      return;
    }

    state.settings.autoSpeedSites = sites;
    var nowActive = state.host && Object.prototype.hasOwnProperty.call(sites, state.host);
    browser.storage.local.set({ autoSpeedSites: sites })
      .then(function () { return nudge({ action: 'checkAutoSpeed' }); })
      .then(function () {
        updateAutoSpeedDisplay({
          active: !!nowActive,
          speed: nowActive ? sites[state.host] : null,
          domain: state.host,
          currentSpeed: selected
        });
        showFeedback(nowActive ? 'Auto-speed saved for ' + state.host : 'Auto-speed disabled.', false);
      })
      .catch(function (error) { showFeedback('Could not save: ' + error.message, true); });
  }

  function onSpeedClick(value, button) {
    state.currentSpeed = value;
    state.settings.speed = value;

    writeSettings({ speed: value })
      .then(function () {
        markActiveSpeed(value);
        el.currentSpeedStatus.textContent = formatSpeed(value);
        button.style.transform = 'scale(0.95)';
        setTimeout(function () { button.style.transform = ''; }, 100);

        if (state.autoSpeed !== null) {
          updateAutoSpeedDisplay({
            active: true,
            speed: state.autoSpeed,
            domain: state.host,
            currentSpeed: value
          });
        }
      })
      .catch(function (error) { showFeedback('Could not save: ' + error.message, true); });
  }

  function onToggleChange() {
    var partial = collectToggles();
    Object.assign(state.settings, partial);
    writeSettings(partial).catch(function (error) {
      showFeedback('Could not save: ' + error.message, true);
    });
  }

  function onOptionsClick() {
    var open = browser.runtime.openOptionsPage
      ? browser.runtime.openOptionsPage()
      : browser.tabs.create({ url: browser.runtime.getURL('options/options.html') });

    Promise.resolve(open)
      .then(function () { setTimeout(function () { window.close(); }, 150); })
      .catch(function (error) { showFeedback('Could not open settings: ' + error.message, true); });
  }

  /* ----------------------------------------------------------------- boot */

  document.addEventListener('DOMContentLoaded', function () {
    el = {
      autoTrigger: document.querySelector('.auto-trigger-btn'),
      autoStatus: document.querySelector('.auto-status'),
      autoSpeed: document.querySelector('.auto-speed'),
      hint: document.querySelector('.status-hint'),
      currentSpeedStatus: $('currentSpeedStatus'),
      savedSpeedStatus: $('savedSpeedStatus'),
      speedButtons: $('speedButtons'),
      feedback: $('feedback'),
      optionsButton: $('optionsButton')
    };
    TOGGLE_IDS.forEach(function (id) { el[id] = $(id); });

    el.autoTrigger.addEventListener('click', onAutoTriggerClick);
    el.optionsButton.addEventListener('click', onOptionsClick);
    TOGGLE_IDS.forEach(function (id) {
      el[id].addEventListener('change', onToggleChange);
    });

    // Derive status from storage rather than from broadcasts: a message from
    // an inactive tab must never overwrite the domain shown in this popup.
    if (browser.storage.onChanged && typeof browser.storage.onChanged.addListener === 'function') {
      browser.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== 'local' || (!changes.autoSpeedSites && !changes.speed)) return;
        readSettings().then(function (settings) {
          state.settings = settings;
          var sites = settings.autoSpeedSites;
          var active = state.host && Object.prototype.hasOwnProperty.call(sites, state.host);
          updateAutoSpeedDisplay({
            active: !!active,
            speed: active ? USC.clampSpeed(sites[state.host]) : null,
            domain: state.host
          });
        }).catch(function () { /* popup may be closing */ });
      });
    }

    activeTab().then(function (tab) {
      state.host = '';
      if (tab && tab.url) {
        try { state.host = new URL(tab.url).hostname || ''; } catch (e) { state.host = ''; }
      }
      return readSettings();
    }).then(function (settings) {
      state.settings = settings;
      var sites = settings.autoSpeedSites;
      state.autoSpeed = (state.host && Object.prototype.hasOwnProperty.call(sites, state.host))
        ? USC.clampSpeed(sites[state.host]) : null;
      state.currentSpeed = state.autoSpeed !== null ? state.autoSpeed : settings.speed;

      setToggleValues();
      renderSpeedButtons();
      updateAutoSpeedDisplay({
        active: state.autoSpeed !== null,
        speed: state.autoSpeed,
        domain: state.host,
        currentSpeed: state.currentSpeed
      });
    }).catch(function (error) {
      showFeedback('Could not load settings: ' + error.message, true);
    });
  });
})();
