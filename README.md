# HTML Universal Speed Controller

A powerful Firefox extension that gives you complete control over web content playback speeds. Originally inspired by HTML5 Universal Speed Hack, this extension goes beyond just video playback, allowing you to control the speed of any time-based web content.

## Features

### Basic Speed Control
- Quick speed presets (1x, 2x, 5x, 10x, 20x, 50x)
- Stop button to pause all time-based content
- Customizable speed steps in settings
- Real-time speed changes without page reload

### Auto-Speed System
- Save specific speeds for different websites
- Automatically applies saved speeds when revisiting sites
- Easy toggle between saved and custom speeds
- Visual indicator shows current and saved speeds

### Timing Methods Control
- setInterval control
- setTimeout control
- performance.now() control
- Date.now() control
- requestAnimationFrame control
- Individual toggles for each timing method

### Advanced Settings
- Custom domain configurations
- Speed step customization
- Performance optimization settings
- Mobile-friendly interface

### Developer Options
- Tick rate control for performance tuning
- High precision timer option
- Legacy mode for compatibility
- Battery optimization settings

## How to Use

### Basic Usage
1. Click the extension icon to open the control panel
2. Select a speed button (2x, 5x, etc.) to change the current speed
3. Use the Stop button to pause all time-based content
4. Current speed is shown in green

### Auto-Speed Feature
1. Navigate to a website you want to set a speed for
2. Select your desired speed
3. Click the "Auto-Speed" button to save this speed for the current site
4. The saved speed will automatically apply when you revisit
5. Saved speed is shown in orange when it differs from current speed

### Customizing Speed Steps
1. Click the Settings button
2. Add or remove speed presets
3. Enter new speed values (1-100x supported)
4. Changes apply immediately

### Managing Website Speeds
1. Open Settings
2. View/edit saved website speeds
3. Use format: domain.com:speed
4. Quick-add presets available
5. Bulk import/export supported

### Performance Optimization
1. Access Developer Settings in options
2. Adjust tick rate for performance/accuracy balance
3. Enable battery optimization for mobile
4. Use legacy mode for compatibility issues

### Timing Method Controls
- Toggle setInterval for loop-based timers
- Toggle setTimeout for delayed executions
- Toggle performance.now() for high-precision timing
- Toggle Date.now() for timestamp-based timing
- Toggle requestAnimationFrame for animation timing

## Tips
- Use lower speeds (2x-5x) for smooth animations
- Higher speeds (20x-50x) work best for countdown timers
- Enable battery optimization on mobile devices
- Adjust tick rate if experiencing performance issues
- Use legacy mode if modern timing methods cause problems

## Common Use Cases
1. **Ad Timers**: Speed up countdown timers on ad-gated content
2. **Video Learning**: Control tutorial video playback speeds
3. **Game Modification**: Adjust game speeds for testing or fun
4. **Animation Testing**: Debug animations at various speeds
5. **Performance Testing**: Test website behavior at different speeds

## Technical Details
- Uses modern JavaScript timing APIs
- Optimized for Firefox
- Mobile-friendly design
- Low resource footprint
- Compatible with most websites

## Privacy & Permissions
- Requires access to active tab for speed control
- Uses storage for saving website preferences
- No data collection or external communication
- All settings stored locally

## Support
For issues or feature requests, please use the GitHub issue tracker.

## License
Open source under [License Name]
