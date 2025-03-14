// Get DOM elements
const speedButtons = document.querySelectorAll('.speed-btn:not(.auto-trigger-btn)');
const autoTriggerBtn = document.querySelector('.auto-trigger-btn');
const autoStatus = autoTriggerBtn.querySelector('.auto-status');
const autoSpeed = autoTriggerBtn.querySelector('.auto-speed');
const statusHint = document.querySelector('.status-hint');
const autoClickToggle = document.getElementById('autoClickToggle');

let isAutoSpeedActive = false;
let currentAutoSpeed = null;
let currentDomain = null;

// Add toggle change handler
autoClickToggle.addEventListener('change', async () => {
  const settings = await browser.storage.local.get();
  settings.autoClickClose = autoClickToggle.checked;
  await browser.storage.local.set(settings);
  
  // Send update to content script
  const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
  await browser.tabs.sendMessage(currentTab.id, {
    action: 'updateSettings',
    settings: settings,
    isAutoSpeed: false
  });
});

// Listen for auto-speed status updates
browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'updateAutoSpeedStatus') {
    updateAutoSpeedDisplay(message.status);
  }
});

// Update auto-speed status display
function updateAutoSpeedDisplay(status) {
  isAutoSpeedActive = status.active;
  
  if (status.active) {
    currentAutoSpeed = status.speed;
    currentDomain = status.domain;
    const currentSpeed = status.currentSpeed || status.speed;
    
    // Update auto-speed button
    autoStatus.textContent = 'Auto: On';
    autoSpeed.textContent = status.domain;
    
    // Update status display
    document.getElementById('currentSpeedStatus').textContent = `${currentSpeed}x`;
    document.getElementById('savedSpeedStatus').textContent = `${status.speed}x`;
    
    // Show difference indicator if speeds don't match
    if (currentSpeed !== status.speed) {
      autoTriggerBtn.classList.add('different-speed');
      document.querySelector('.status-hint').textContent = 'Click auto-speed to update saved speed';
    } else {
      autoTriggerBtn.classList.remove('different-speed');
      document.querySelector('.status-hint').textContent = 'Click auto-speed to disable';
    }
    autoTriggerBtn.classList.add('active');
    
    // Update speed buttons to show auto-speed state
    speedButtons.forEach(btn => {
      const btnSpeed = parseInt(btn.dataset.speed);
      btn.style.transition = 'all 0.3s ease';
      
      if (btnSpeed === status.speed) {
        btn.classList.add('auto-active');
        btn.title = `Auto-speed for ${status.domain}`;
      } else {
        btn.classList.remove('auto-active');
      }
      
      if (btnSpeed === currentSpeed) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      
      // Don't disable buttons, allow speed changes
      btn.style.opacity = '1';
    });
  } else {
    // Update auto-speed button
    autoStatus.textContent = 'Auto: Off';
    autoSpeed.textContent = '';
    autoTriggerBtn.classList.remove('active');
    
    // Update status display
    const activeSpeedBtn = document.querySelector('.speed-btn.active:not(.auto-trigger-btn)');
    const currentSpeed = parseInt(activeSpeedBtn?.dataset.speed || 1);
    document.getElementById('currentSpeedStatus').textContent = `${currentSpeed}x`;
    document.getElementById('savedSpeedStatus').textContent = 'None';
    document.querySelector('.status-hint').textContent = 'Click auto-speed to save current speed';
    
    // Re-enable speed buttons with smooth transition
    speedButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }
}

// Check auto-speed status when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    try {
      // Trigger a check of auto-speed status
      await browser.tabs.sendMessage(tabs[0].id, { action: 'checkAutoSpeed' });
    } catch (e) {
      // Tab might not have our content script
      console.error('Error checking auto-speed status:', e);
    }
  }
});

const setIntervalToggle = document.getElementById('setIntervalToggle');
const setTimeoutToggle = document.getElementById('setTimeoutToggle');
const performanceToggle = document.getElementById('performanceToggle');
const dateNowToggle = document.getElementById('dateNowToggle');
const requestAnimationFrameToggle = document.getElementById('requestAnimationFrameToggle');
const optionsButton = document.getElementById('optionsButton');

// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  // Get saved settings
  const settings = await browser.storage.local.get({
    speed: 1,
    setInterval: true,
    setTimeout: true,
    performance: true,
    dateNow: true,
    requestAnimationFrame: false,
    autoClickClose: false,
    speedSteps: [2, 5, 10, 20, 50],
    autoSpeedSites: {},
    developerSettings: {
      tickRate: 60,
      useHighPrecisionTimer: false,
      useLegacyMode: false,
      optimizeForBattery: false
    }
  });

  // Update speed buttons
  const speedButtonsContainer = document.querySelector('.speed-buttons');
  speedButtonsContainer.innerHTML = `
    <button class="speed-btn" data-speed="1">Normal</button>
    ${settings.speedSteps.map(speed =>
      `<button class="speed-btn" data-speed="${speed}">${speed}x</button>`
    ).join('')}
    <button class="speed-btn stop-btn" data-speed="0">Stop</button>
  `;

  // Add click/touch handlers to new buttons
  document.querySelectorAll('.speed-btn:not(.auto-trigger-btn)').forEach(btn => {
    // Handle both click and touch events
    const handleInteraction = (e) => {
      e.preventDefault(); // Prevent double-firing on mobile
      if (!btn.disabled) {
        handleSpeedButtonClick.call(btn);
      }
    };

    btn.addEventListener('click', handleInteraction);
    btn.addEventListener('touchend', handleInteraction);
    
    if (parseInt(btn.dataset.speed) === settings.speed) {
      btn.classList.add('active');
    }
  });

  // Update toggles
  setIntervalToggle.checked = settings.setInterval;
  setTimeoutToggle.checked = settings.setTimeout;
  performanceToggle.checked = settings.performance;
  dateNowToggle.checked = settings.dateNow;
  requestAnimationFrameToggle.checked = settings.requestAnimationFrame;

  // Get current tab and check for auto-speed
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    try {
      const url = new URL(tabs[0].url);
      const currentHost = url.hostname;
      
      // Check if current site has auto-speed
      if (currentHost in settings.autoSpeedSites) {
        updateAutoSpeedDisplay({
          active: true,
          speed: settings.autoSpeedSites[currentHost],
          domain: currentHost
        });
      } else {
        updateAutoSpeedDisplay({ active: false });
      }
    } catch (e) {
      console.error('Error checking auto-speed status:', e);
    }
  }
});

// Speed button click handler
async function handleSpeedButtonClick() {
  const speed = parseInt(this.dataset.speed);
  
  // Get current settings including developer settings
  const { autoSpeedSites = {}, developerSettings = {} } = await browser.storage.local.get(['autoSpeedSites', 'developerSettings']);
  
  // Create settings object
  const settings = {
    speed: speed,
    setInterval: setIntervalToggle.checked,
    setTimeout: setTimeoutToggle.checked,
    performance: performanceToggle.checked,
    dateNow: dateNowToggle.checked,
    requestAnimationFrame: requestAnimationFrameToggle.checked,
    autoClickClose: autoClickToggle.checked,
    // Include developer settings
    tickRate: developerSettings.tickRate || 60,
    useHighPrecisionTimer: developerSettings.useHighPrecisionTimer || false,
    useLegacyMode: developerSettings.useLegacyMode || false,
    optimizeForBattery: developerSettings.optimizeForBattery || false
  };

  // Always apply the speed change first
  await browser.storage.local.set(settings);
  const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
  await browser.tabs.sendMessage(currentTab.id, {
    action: 'updateSettings',
    settings: settings,
    isAutoSpeed: false
  });

  // Handle auto-speed state
  if (speed === 0 && isAutoSpeedActive && currentDomain) {
    // Remove auto-speed when stopping
    delete autoSpeedSites[currentDomain];
    await browser.storage.local.set({ autoSpeedSites });
    updateAutoSpeedDisplay({ active: false });
  } else if (isAutoSpeedActive && currentDomain) {
    // Show difference between current and saved speed
    updateAutoSpeedDisplay({
      active: true,
      speed: currentAutoSpeed,
      domain: currentDomain,
      currentSpeed: speed
    });
  }

  // Update button states
  document.querySelectorAll('.speed-btn:not(.auto-trigger-btn)').forEach(b => {
    b.classList.remove('active');
    b.classList.remove('auto-active');
  });
  
  if (speed !== 0) { // Don't highlight stop button
    this.classList.add('active');
  }

  // Visual feedback
  this.style.transform = 'scale(0.95)';
  setTimeout(() => {
    this.style.transform = 'scale(1)';
  }, 100);
}

// Auto-trigger button handlers
const handleAutoTrigger = async (e) => {
  e.preventDefault(); // Prevent double-firing on mobile
  
  // Get current tab info
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  const url = new URL(currentTab.url);
  const currentHost = url.hostname;
  
  // Get current settings and auto-speed sites
  const { autoSpeedSites = {} } = await browser.storage.local.get('autoSpeedSites');
  
  // Get currently selected speed
  const activeSpeedBtn = document.querySelector('.speed-btn.active:not(.auto-trigger-btn)');
  const selectedSpeed = parseInt(activeSpeedBtn?.dataset.speed || 1);

  // Get current developer settings
  const { developerSettings = {} } = await browser.storage.local.get('developerSettings');

  // Create settings object
  const settings = {
    speed: selectedSpeed,
    setInterval: setIntervalToggle.checked,
    setTimeout: setTimeoutToggle.checked,
    performance: performanceToggle.checked,
    dateNow: dateNowToggle.checked,
    requestAnimationFrame: requestAnimationFrameToggle.checked,
    autoClickClose: autoClickToggle.checked,
    tickRate: developerSettings.tickRate || 60,
    useHighPrecisionTimer: developerSettings.useHighPrecisionTimer || false,
    useLegacyMode: developerSettings.useLegacyMode || false,
    optimizeForBattery: developerSettings.optimizeForBattery || false
  };

  if (isAutoSpeedActive && currentDomain === currentHost) {
    // Update auto-speed to use current selected speed
    autoSpeedSites[currentHost] = selectedSpeed;
    await browser.storage.local.set({ autoSpeedSites });
    
    // Update display and apply speed
    updateAutoSpeedDisplay({
      active: true,
      speed: selectedSpeed,
      domain: currentHost
    });
    
    await browser.tabs.sendMessage(currentTab.id, {
      action: 'updateSettings',
      settings: settings,
      isAutoSpeed: true
    });
  } else if (isAutoSpeedActive) {
    // Disable auto-speed
    delete autoSpeedSites[currentDomain];
    await browser.storage.local.set({ autoSpeedSites });
    updateAutoSpeedDisplay({ active: false });
    
    // Apply current speed
    await browser.tabs.sendMessage(currentTab.id, {
      action: 'updateSettings',
      settings: settings,
      isAutoSpeed: false
    });
  } else {
    // Enable auto-speed with current speed
    autoSpeedSites[currentHost] = selectedSpeed;
    await browser.storage.local.set({ autoSpeedSites });
    
    // Update display and apply speed
    updateAutoSpeedDisplay({
      active: true,
      speed: selectedSpeed,
      domain: currentHost
    });
    
    await browser.tabs.sendMessage(currentTab.id, {
      action: 'updateSettings',
      settings: settings,
      isAutoSpeed: true
    });
  }
  
  // Visual feedback
  autoTriggerBtn.style.transform = 'scale(0.95)';
  setTimeout(() => {
    autoTriggerBtn.style.transform = 'scale(1)';
  }, 100);
};

// Add both click and touch handlers for auto-trigger button
autoTriggerBtn.addEventListener('click', handleAutoTrigger);
autoTriggerBtn.addEventListener('touchend', handleAutoTrigger);

// Toggle change handlers
// Define toggles array - using 'const' removed to avoid redeclaration error
let toggles = [
  setIntervalToggle,
  setTimeoutToggle,
  performanceToggle,
  dateNowToggle,
  requestAnimationFrameToggle
].filter(Boolean); // Filter out null if tickRate toggle doesn't exist

toggles.forEach(toggle => {
  toggle.addEventListener('change', async () => {
    // If auto-speed is active, use its speed
    const speed = isAutoSpeedActive ? currentAutoSpeed :
      (document.querySelector('.speed-btn.active:not(.auto-trigger-btn)')?.dataset.speed || 1);

    // Get current developer settings
    const { developerSettings = {} } = await browser.storage.local.get('developerSettings');
    
    const settings = {
      speed: parseInt(speed),
      setInterval: setIntervalToggle.checked,
      setTimeout: setTimeoutToggle.checked,
      performance: performanceToggle.checked,
      dateNow: dateNowToggle.checked,
      requestAnimationFrame: requestAnimationFrameToggle.checked,
      autoClickClose: autoClickToggle.checked,
      // Include developer settings
      tickRate: developerSettings.tickRate || 60,
      useHighPrecisionTimer: developerSettings.useHighPrecisionTimer || false,
      useLegacyMode: developerSettings.useLegacyMode || false,
      optimizeForBattery: developerSettings.optimizeForBattery || false
    };

    // Save settings
    await browser.storage.local.set(settings);

    // Get current tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    // Send message to content script with isAutoSpeed flag
    await browser.tabs.sendMessage(currentTab.id, {
      action: 'updateSettings',
      settings: settings,
      isAutoSpeed: isAutoSpeedActive
    });
  });
});

// Options button click/touch handler
const handleOptionsClick = async (e) => {
  e.preventDefault(); // Prevent double-firing on mobile
  
  // Visual feedback for mobile
  optionsButton.style.transform = 'scale(0.95)';
  
  try {
    // Open settings page - using browser.runtime.openOptionsPage() with fallback
    if (browser.runtime.openOptionsPage) {
      await browser.runtime.openOptionsPage();
    } else {
      // Fallback method - open options.html directly
      await browser.tabs.create({
        url: browser.runtime.getURL("options/options.html")
      });
    }
    
    // Close popup after a short delay
    setTimeout(() => {
      window.close();
    }, 150);
  } catch (error) {
    console.error('Error opening settings:', error);
    // Additional fallback if the above methods fail
    try {
      await browser.tabs.create({
        url: "../options/options.html"
      });
      window.close();
    } catch (fallbackError) {
      console.error('Fallback error:', fallbackError);
    }
  } finally {
    // Reset button transform
    setTimeout(() => {
      optionsButton.style.transform = 'scale(1)';
    }, 100);
  }
};

// Add both click and touch handlers for options button
optionsButton.addEventListener('click', handleOptionsClick);
optionsButton.addEventListener('touchend', handleOptionsClick);