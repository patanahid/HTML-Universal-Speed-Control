(function () {
  'use strict';

  var USC = globalThis.USC;

  var el = {};
  var statusTimer = null;

  function $(id) { return document.getElementById(id); }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function showStatus(message, isError) {
    el.saveStatus.textContent = message;
    el.saveStatus.className = 'status-message show ' + (isError ? 'error' : 'success');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      el.saveStatus.className = 'status-message';
    }, 4000);
  }

  function readSettings() {
    return browser.storage.local.get(USC.clone(USC.DEFAULTS))
      .then(USC.normalizeSettings);
  }

  /* ------------------------------------------------------------- rendering */

  /* All rendering uses textContent / createElement — no innerHTML anywhere,
   * so preset labels can never inject HTML into this privileged page. */
  function renderSpeedSteps(steps) {
    el.speedStepsList.textContent = '';
    steps.forEach(function (step) {
      var item = element('div', 'speed-step');
      item.appendChild(element('span', null, step + 'x'));
      var remove = element('button', null, '✕');
      remove.type = 'button';
      remove.title = 'Remove speed step';
      remove.addEventListener('click', function () {
        readSettings().then(function (settings) {
          var next = settings.speedSteps.filter(function (s) { return s !== step; });
          return browser.storage.local.set({ speedSteps: next }).then(function () {
            renderSpeedSteps(next);
            showStatus('Speed step removed successfully!');
          });
        }).catch(function (error) { showStatus('Error: ' + error.message, true); });
      });
      item.appendChild(remove);
      el.speedStepsList.appendChild(item);
    });
  }

  function renderPresetButtons(presets) {
    el.presetButtonsList.textContent = '';

    presets.forEach(function (preset, index) {
      var item = element('div', 'preset-button-item');
      item.appendChild(element('span', null, preset.label + ' (' + preset.speed + 'x)'));

      var actions = element('div', 'button-actions');
      var edit = element('button', 'edit-btn', '✎');
      edit.type = 'button';
      edit.title = 'Edit preset';
      var remove = element('button', 'delete-btn', '✕');
      remove.type = 'button';
      remove.title = 'Remove preset';
      actions.appendChild(edit);
      actions.appendChild(remove);

      var controls = element('div', 'edit-controls');
      var inputs = element('div', 'edit-inputs');
      var labelInput = element('input', 'edit-label');
      labelInput.type = 'text';
      labelInput.value = preset.label;
      labelInput.placeholder = 'Button label';
      var speedInput = element('input', 'edit-speed');
      speedInput.type = 'number';
      speedInput.min = '0';
      speedInput.step = '0.1';
      speedInput.value = String(preset.speed);
      speedInput.placeholder = 'Speed value';
      inputs.appendChild(labelInput);
      inputs.appendChild(speedInput);

      var editActions = element('div', 'edit-actions');
      var save = element('button', 'save-edit', 'Save');
      save.type = 'button';
      var cancel = element('button', 'cancel-edit', 'Cancel');
      cancel.type = 'button';
      editActions.appendChild(save);
      editActions.appendChild(cancel);
      controls.appendChild(inputs);
      controls.appendChild(editActions);

      edit.addEventListener('click', function () { item.classList.add('editing'); });
      cancel.addEventListener('click', function () { item.classList.remove('editing'); });

      save.addEventListener('click', function () {
        var label = labelInput.value.trim();
        if (!label) { showStatus('Preset label is required', true); return; }
        if (!USC.isValidSpeedString(speedInput.value)) {
          showStatus('Speed must be a number from 0 to 1000', true);
          return;
        }
        readSettings().then(function (settings) {
          var next = settings.presetButtons.slice();
          if (!next[index]) { showStatus('Preset no longer exists', true); return; }
          next[index] = { label: label, speed: USC.clampSpeed(speedInput.value) };
          return browser.storage.local.set({ presetButtons: next }).then(function () {
            renderPresetButtons(next);
            renderQuickAddPresets(next);
            showStatus('Preset updated successfully!');
          });
        }).catch(function (error) { showStatus('Error: ' + error.message, true); });
      });

      remove.addEventListener('click', function () {
        readSettings().then(function (settings) {
          var next = settings.presetButtons.slice();
          next.splice(index, 1);
          return browser.storage.local.set({ presetButtons: next }).then(function () {
            renderPresetButtons(next);
            renderQuickAddPresets(next);
            showStatus('Preset removed successfully!');
          });
        }).catch(function (error) { showStatus('Error: ' + error.message, true); });
      });

      item.appendChild(actions);
      item.appendChild(controls);
      el.presetButtonsList.appendChild(item);
    });
  }

  function renderQuickAddPresets(presets) {
    el.quickAddPresets.textContent = '';
    presets.forEach(function (preset) {
      var button = element('button', null, preset.label + ' (' + preset.speed + 'x)');
      button.type = 'button';
      button.addEventListener('click', function () {
        var host = USC.normalizeHost(el.domainInput.value);
        if (!host) { showStatus('Please enter a valid domain first', true); return; }
        var existing = el.websitesList.value.trim();
        var line = host + ':' + preset.speed;
        el.websitesList.value = existing ? existing + '\n' + line : line;
        el.domainInput.value = '';
      });
      el.quickAddPresets.appendChild(button);
    });
  }

  /* ------------------------------------------------------ developer settings */

  function fillDeveloperUI(settings) {
    var dev = settings.developerSettings;
    el.tickRate.value = String(dev.tickRate);
    el.useHighPrecisionTimer.checked = dev.useHighPrecisionTimer;
    el.useLegacyMode.checked = dev.useLegacyMode;
    el.optimizeForBattery.checked = dev.optimizeForBattery;
    el.showNotifications.checked = settings.showNotifications;
  }

  function collectDeveloperSettings(notify) {
    var raw = el.tickRate.value.trim();
    if (!USC.isValidSpeedString(raw) || Number(raw) < 1 || Number(raw) > 1000) {
      if (notify) showStatus('Tick rate must be a whole number between 1 and 1000', true);
      return null;
    }
    return {
      tickRate: Math.round(Number(raw)),
      useHighPrecisionTimer: el.useHighPrecisionTimer.checked,
      useLegacyMode: el.useLegacyMode.checked,
      optimizeForBattery: el.optimizeForBattery.checked
    };
  }

  function saveDeveloperSettings() {
    var dev = collectDeveloperSettings(true);
    if (!dev) return;
    browser.storage.local.set({ developerSettings: dev })
      .catch(function (error) { showStatus('Error: ' + error.message, true); });
  }

  /* ---------------------------------------------------------------- actions */

  function notifyTabs() {
    return browser.tabs.query({}).then(function (tabs) {
      return Promise.all(tabs.map(function (tab) {
        return browser.tabs.sendMessage(tab.id, { action: 'checkAutoSpeed' })
          .catch(function () { /* tab has no content script */ });
      }));
    });
  }

  function onAddSpeedStep() {
    if (!USC.isValidSpeedString(el.newSpeedStep.value)) {
      showStatus('Please enter a valid speed from 0 to 1000', true);
      return;
    }
    var value = USC.clampSpeed(el.newSpeedStep.value);
    readSettings().then(function (settings) {
      if (settings.speedSteps.indexOf(value) !== -1) {
        showStatus('This speed step already exists', true);
        return;
      }
      var next = USC.normalizeSpeedSteps(settings.speedSteps.concat([value]));
      return browser.storage.local.set({ speedSteps: next }).then(function () {
        renderSpeedSteps(next);
        el.newSpeedStep.value = '';
        showStatus('New speed step added successfully!');
      });
    }).catch(function (error) { showStatus('Error: ' + error.message, true); });
  }

  function onAddPreset() {
    var label = el.presetLabel.value.trim();
    if (!label) { showStatus('Preset label is required', true); return; }
    if (!USC.isValidSpeedString(el.presetSpeed.value)) {
      showStatus('Speed must be a number from 0 to 1000', true);
      return;
    }
    var speed = USC.clampSpeed(el.presetSpeed.value);
    readSettings().then(function (settings) {
      if (settings.presetButtons.some(function (p) { return p.label === label; })) {
        showStatus('A preset with this label already exists', true);
        return;
      }
      var next = settings.presetButtons.concat([{ label: label, speed: speed }]);
      return browser.storage.local.set({ presetButtons: next }).then(function () {
        renderPresetButtons(next);
        renderQuickAddPresets(next);
        el.presetLabel.value = '';
        el.presetSpeed.value = '';
        showStatus('New preset added successfully!');
      });
    }).catch(function (error) { showStatus('Error: ' + error.message, true); });
  }

  function onSave() {
    var parsed = USC.parseWebsitesList(el.websitesList.value);
    if (parsed.errors.length > 0) {
      showStatus('Errors found:\n' + parsed.errors.join('\n'), true);
      return;
    }
    var dev = collectDeveloperSettings(true);
    if (!dev) return;

    browser.storage.local.set({
      autoSpeedSites: parsed.sites,
      developerSettings: dev,
      showNotifications: el.showNotifications.checked
    }).then(function () {
      el.websitesList.value = Object.keys(parsed.sites)
        .map(function (host) { return host + ':' + parsed.sites[host]; })
        .join('\n');
      showStatus('Settings saved successfully!');
      return notifyTabs();
    }).catch(function (error) {
      showStatus('Error saving settings: ' + error.message, true);
    });
  }

  function onReset() {
    var defaults = USC.clone(USC.DEFAULTS);
    browser.storage.local.set(defaults).then(function () {
      el.websitesList.value = '';
      el.domainInput.value = '';
      el.newSpeedStep.value = '';
      el.presetLabel.value = '';
      el.presetSpeed.value = '';
      fillDeveloperUI(USC.normalizeSettings(defaults));
      renderSpeedSteps(defaults.speedSteps);
      renderPresetButtons(defaults.presetButtons);
      renderQuickAddPresets(defaults.presetButtons);
      showStatus('Settings reset successfully!');
      return notifyTabs();
    }).catch(function (error) {
      showStatus('Error resetting settings: ' + error.message, true);
    });
  }

  /* ------------------------------------------------------------------- boot */

  document.addEventListener('DOMContentLoaded', function () {
    [
      'websitesList', 'domainInput', 'quickAddPresets', 'speedStepsList',
      'presetButtonsList', 'newSpeedStep', 'presetLabel', 'presetSpeed',
      'addSpeedStep', 'addPreset', 'saveButton', 'resetButton', 'saveStatus',
      'tickRate', 'useHighPrecisionTimer', 'useLegacyMode', 'optimizeForBattery',
      'showNotifications'
    ].forEach(function (id) { el[id] = $(id); });

    el.addSpeedStep.addEventListener('click', onAddSpeedStep);
    el.addPreset.addEventListener('click', onAddPreset);
    el.saveButton.addEventListener('click', onSave);
    el.resetButton.addEventListener('click', onReset);
    el.showNotifications.addEventListener('change', function () {
      browser.storage.local.set({ showNotifications: el.showNotifications.checked })
        .catch(function (error) { showStatus('Error: ' + error.message, true); });
    });
    [el.tickRate, el.useHighPrecisionTimer, el.useLegacyMode, el.optimizeForBattery]
      .forEach(function (input) { input.addEventListener('change', saveDeveloperSettings); });

    readSettings().then(function (settings) {
      fillDeveloperUI(settings);
      renderSpeedSteps(settings.speedSteps);
      renderPresetButtons(settings.presetButtons);
      renderQuickAddPresets(settings.presetButtons);
      el.websitesList.value = Object.keys(settings.autoSpeedSites)
        .map(function (host) { return host + ':' + settings.autoSpeedSites[host]; })
        .join('\n');
    }).catch(function (error) {
      showStatus('Could not load settings: ' + error.message, true);
    });
  });
})();
