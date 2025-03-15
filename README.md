# HTML Universal Speed Controller

A powerful browser extension that allows you to control the speed of HTML websites by manipulating various timing methods. This extension provides fine-grained control over website timing functions and includes features like auto-speed for specific sites and mobile optimizations.

## Features

### Core Speed Control
- Control website speed through a multiplier (0x to any value)
- Affects multiple timing mechanisms:
  - `setInterval`
  - `setTimeout`
  - `performance.now()`
  - `Date.now()`
  - `requestAnimationFrame`

### Advanced Features
- **Auto-Speed Sites**: Configure specific websites to automatically run at predefined speeds
- **Mobile Optimizations**: Special handling for mobile devices with performance considerations
- **Auto-Click Close**: Automatically closes elements with `.close-btn` class
- **Granular Control**: Enable/disable individual timing method speed control
- **Site-Specific Settings**: Different speed settings for different websites

### Technical Features
- Persistent settings storage
- Background service worker for extension management
- Content script injection for page manipulation
- Cross-browser compatibility (Firefox 79.0+)
- Mobile device detection and optimization

## Architecture

### Components

1. **Background Script** (`background.js`)
   - Manages extension installation and initialization
   - Handles default settings setup
   - Processes notifications
   - Manages tab updates and auto-speed checks

2. **Content Script** (`content.js`)
   - Injects page script for timing manipulation
   - Handles message communication
   - Manages auto-speed site detection
   - Implements mobile optimizations

3. **Popup Interface**
   - User interface for speed control
   - Settings management
   - Status display

4. **Options Page**
   - Advanced settings configuration
   - Auto-speed site management
   - Extension preferences

### Timing Method Overrides

#### 1. setInterval
- Original function preservation
- Speed-adjusted interval timing
- Special handling for Google Ads timers
- Batch processing for mobile devices

#### 2. setTimeout
- Speed-adjusted timeout duration
- Original function preservation
- Mobile-optimized execution

#### 3. performance.now()
- Throttled updates for performance
- Mobile-specific optimizations
- Precision maintenance
- Update interval control

#### 4. Date.now()
- Throttled updates
- Mobile optimizations
- Precision control
- Update interval management

#### 5. requestAnimationFrame
- Frame rate control
- Mobile-specific frame timing
- Accumulator-based processing
- Callback management

## Mobile Optimizations

### Configuration
```javascript
const MOBILE_CONFIG = {
  UPDATE_INTERVAL: 32,    // ~30fps for better mobile performance
  BATCH_SIZE: 5,         // Process timers in batches
  THROTTLE_THRESHOLD: 100 // Minimum time between heavy operations
};
```

### Mobile-Specific Features
- Reduced frame rate (30fps)
- Batch processing of timers
- Throttled heavy operations
- Optimized update intervals
- Memory usage optimization

## Auto-Speed Sites

### Configuration
- Store site-specific speeds in browser storage
- Automatic speed application on site visit
- Notification system for speed changes
- Manual override prevention

*Click on the auto-speed button to add the current site and speed to the auto-triggering list*

### Behavior
1. Site visit triggers speed check
2. If site is in auto-speed list:
   - Apply configured speed
   - Show notification
   - Update popup status
3. If site is not in auto-speed list:
   - Use default speed
   - Update popup status

## Auto-Click Close Feature

### Functionality
- Monitors DOM for new close buttons
- Uses MutationObserver for efficiency
- Handles dynamic content loading
- Prevents duplicate clicks
- Visibility check before clicking

### Implementation
```javascript
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const closeButtons = node.querySelectorAll('.close-btn');
        closeButtons.forEach(button => {
          if (button && !button.dataset.autoClicked) {
            button.dataset.autoClicked = 'true';
            setTimeout(() => {
              if (button && button.offsetParent !== null) {
                button.click();
              }
            }, 100);
          }
        });
      }
    });
  });
});
```

## Installation

1. Clone the repository
2. Open Firefox
3. Navigate to `about:debugging`
4. Click "This Firefox" on the left
5. Click "Load Temporary Add-on"
6. Select the `manifest.json` file

## Usage

### Basic Speed Control
1. Click the extension icon
2. Use the speed slider to adjust website speed
3. Enable/disable individual timing methods
4. Changes apply immediately

### Auto-Speed Sites
1. Open extension options
2. Navigate to Auto-Speed Sites section
3. Add website domain and desired speed
4. Save settings

### Auto-Click Close
1. Enable in extension options
2. Extension will automatically click elements with `.close-btn` class
3. Works on dynamically loaded content

## Technical Details

### Message Handling
- Background to Content Script
- Popup to Content Script
- Content Script to Page Script

### Storage Management
- Local storage for settings
- Persistent across sessions
- Automatic migration handling

### Error Handling
- Graceful degradation
- Error logging
- Recovery mechanisms

## Browser Compatibility

- Firefox 79.0 or higher
- Uses WebExtensions API
- Cross-browser compatible architecture

## Performance Considerations

### Mobile Devices
- Reduced frame rates
- Batch processing
- Throttled operations
- Memory optimization

### Desktop
- Full frame rate support
- Direct timer processing
- Maximum precision

## Security

- No data collection
- Local storage only
- No external connections
- Secure message passing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
