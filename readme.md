# DepthAI Daemon Service

A comprehensive, production-ready daemon service for DepthAI cameras on Raspberry Pi. This service provides robust camera operation with health monitoring, configuration management, automatic restarts, and comprehensive logging.

## Features

- **Robust Operation**: Automatic reconnection, error handling, and health monitoring
- **Flexible Configuration**: JSON-based configuration with hot-reload capability
- **Multiple Outputs**: Save frames to disk, streaming support, depth and RGB capture
- **AI Integration**: Support for custom AI models with detection processing
- **System Integration**: Full systemd integration with proper service management
- **Monitoring**: Built-in statistics, health checks, and status reporting
- **Security**: Runs as unprivileged user with minimal system access
- **Resource Management**: Memory and CPU limits, log rotation

## Quick Installation

```bash
# Download the installation script and daemon files
curl -O https://raw.githubusercontent.com/jmdisuanco/depthai-daemon/main/install.sh
curl -O https://raw.githubusercontent.com/jmdisuanco/depthai-daemon/main/depthai_daemon.py

# Make installation script executable
chmod +x install.sh

# Install the daemon (requires sudo)
sudo ./install.sh install
```

## Manual Installation

1. **Download all files to a directory:**

   - `depthai_daemon.py` - Main daemon application
   - `install.sh` - Installation script
   - `depthai-daemon.service` - Systemd service file (optional)

2. **Run the installation:**

   ```bash
   sudo ./install.sh install
   ```

3. **Check the service status:**
   ```bash
   depthai-status
   ```

## Configuration

The daemon is configured via `/etc/depthai-daemon/config.json`. Key configuration sections:

### Camera Settings

```json
{
  "camera": {
    "rgb_resolution": [1920, 1080],
    "rgb_fps": 30,
    "depth_enabled": true,
    "preview_size": [640, 480]
  }
}
```

### AI Model Configuration

```json
{
  "ai": {
    "model_enabled": false,
    "model_path": "/path/to/model.blob",
    "confidence_threshold": 0.5
  }
}
```

### Output Options

```json
{
  "output": {
    "save_frames": false,
    "output_directory": "/tmp/depthai-frames",
    "max_files": 1000
  }
}
```

### Service Settings

```json
{
  "service": {
    "health_check_interval": 30,
    "max_reconnect_attempts": 5,
    "log_level": "INFO"
  }
}
```

## Management Commands

### Service Control

```bash
# Start/stop/restart service
sudo systemctl start depthai-daemon
sudo systemctl stop depthai-daemon
sudo systemctl restart depthai-daemon

# Enable/disable auto-start on boot
sudo systemctl enable depthai-daemon
sudo systemctl disable depthai-daemon
```

### Quick Management Scripts

```bash
# Show detailed status and statistics
depthai-status

# View logs
depthai-logs                # Recent logs
depthai-logs follow         # Follow logs in real-time
depthai-logs errors         # Show only errors

# Configuration management
depthai-config show         # Display current config
depthai-config edit         # Edit configuration
depthai-config reload       # Reload config without restart
```

## Monitoring and Health Checks

### Status Information

The daemon maintains real-time status information at `/var/run/depthai-daemon/status.json`:

```json
{
  "timestamp": "2024-01-01T12:00:00",
  "status": "running",
  "pid": 1234,
  "stats": {
    "uptime_seconds": 3600,
    "total_frames": 108000,
    "current_fps": 30.0,
    "error_count": 0
  },
  "health": {
    "status": "healthy",
    "issues": []
  }
}
```

### Health Monitoring

- **Automatic reconnection** on device disconnection
- **Frame rate monitoring** with alerts for low FPS
- **Error rate tracking** with health status reporting
- **Resource monitoring** with configurable limits

## File Locations

| Purpose       | Location                                     |
| ------------- | -------------------------------------------- |
| Application   | `/opt/depthai-daemon/`                       |
| Configuration | `/etc/depthai-daemon/config.json`            |
| Logs          | `/var/log/depthai-daemon/daemon.log`         |
| Status        | `/var/run/depthai-daemon/status.json`        |
| Service File  | `/etc/systemd/system/depthai-daemon.service` |
| USB Rules     | `/etc/udev/rules.d/80-depthai.rules`         |

## Troubleshooting

### Check Service Status

```bash
# Quick status check
depthai-status

# Detailed systemd status
sudo systemctl status depthai-daemon

# View recent logs
depthai-logs
```

### Common Issues

1. **Permission Denied for USB Device**

   ```bash
   # Check if user is in required groups
   groups pi

   # Should include: plugdev, video, dialout
   # If not, add user to groups:
   sudo usermod -a -G plugdev,video,dialout pi
   ```

2. **Service Fails to Start**

   ```bash
   # Check logs for errors
   depthai-logs errors

   # Test daemon manually
   sudo -u pi /opt/depthai-daemon/venv/bin/python /opt/depthai-daemon/depthai_daemon.py
   ```

3. **No DepthAI Device Found**

   ```bash
   # List USB devices
   lsusb | grep -i luxonis

   # Check udev rules
   sudo udevadm control --reload-rules
   sudo udevadm trigger
   ```

4. **High CPU/Memory Usage**

   ```bash
   # Check resource usage
   systemctl show depthai-daemon.service --property=MemoryCurrent,CPUUsageNSec

   # Adjust limits in service file if needed
   sudo systemctl edit depthai-daemon
   ```

### Debug Mode

Run the daemon manually for debugging:

```bash
# Stop the service
sudo systemctl stop depthai-daemon

# Run manually with debug output
sudo -u pi /opt/depthai-daemon/venv/bin/python /opt/depthai-daemon/depthai_daemon.py --config /etc/depthai-daemon/config.json
```

## Advanced Configuration

### Custom AI Models

1. Download or convert your model to `.blob` format
2. Place model file in `/opt/depthai-daemon/models/`
3. Update configuration:
   ```json
   {
     "ai": {
       "model_enabled": true,
       "model_path": "/opt/depthai-daemon/models/your-model.blob",
       "confidence_threshold": 0.6
     }
   }
   ```

### Frame Output Options

```json
{
  "output": {
    "save_frames": true,
    "output_directory": "/home/pi/camera-output",
    "max_files": 5000
  }
}
```

### Performance Tuning

```json
{
  "camera": {
    "rgb_fps": 15, // Lower FPS for better performance
    "preview_size": [416, 416] // Smaller preview for AI processing
  },
  "service": {
    "health_check_interval": 60 // Less frequent health checks
  }
}
```

## Uninstalling

```bash
sudo ./install.sh uninstall
```

This will:

- Stop and disable the service
- Remove all installed files and directories
- Remove the service user
- Clean up udev rules and systemd configuration

## Development

### Adding Custom Features

The daemon is designed to be extensible. Key areas for customization:

- **Frame Processing**: Modify `_handle_rgb_frame()` and `_handle_depth_frame()`
- **AI Integration**: Extend `_handle_detections()` for custom model outputs
- **Output Formats**: Add new output methods in the processing pipeline
- **Monitoring**: Extend the `DepthAIStats` class for custom metrics

### Testing Changes

```bash
# Test configuration changes
depthai-config show

# Test daemon manually
sudo systemctl stop depthai-daemon
sudo -u pi /opt/depthai-daemon/venv/bin/python /opt/depthai-daemon/depthai_daemon.py

# Restart service with changes
sudo systemctl restart depthai-daemon
depthai-status
```

## Support

For issues and support:

1. Check the troubleshooting section above
2. Review logs: `depthai-logs errors`
3. Test with manual execution for detailed error messages
4. Check DepthAI documentation: https://docs.luxonis.com/

## License

This daemon service is provided as-is for use with DepthAI cameras. Modify and distribute according to your needs.
