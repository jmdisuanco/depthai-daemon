#!/bin/bash

# DepthAI Daemon Installation Script
# This script installs and configures the DepthAI daemon service
# Updated with fixes for NAMESPACE issues

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="depthai-daemon"
SERVICE_USER="pi"
INSTALL_DIR="/opt/depthai-daemon"
CONFIG_DIR="/etc/depthai-daemon"
LOG_DIR="/var/log/depthai-daemon"
RUN_DIR="/var/run/depthai-daemon"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_system() {
    log_info "Checking system requirements..."

    if ! grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
        log_warning "This script is designed for Raspberry Pi. Continuing anyway..."
    fi

    if ! python3 --version | grep -q "Python 3.[8-9]\|Python 3.1[0-9]"; then
        log_error "Python 3.8 or higher is required"
        exit 1
    fi

    if ! command -v systemctl &> /dev/null; then
        log_error "systemctl is required but not found"
        exit 1
    fi

    log_success "System requirements check passed"
}

install_system_dependencies() {
    log_info "Installing system dependencies..."
    apt-get update
    apt-get install -y \
        python3-full \
        python3-venv \
        python3-pip \
        python3-dev \
        cmake \
        build-essential \
        pkg-config \
        libusb-1.0-0-dev \
        libopencv-dev \
        python3-opencv \
        udev \
        nano
    log_success "System dependencies installed"
}

create_user_and_directories() {
    log_info "Creating user and directories..."

    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd -r -s /bin/false -d "$INSTALL_DIR" "$SERVICE_USER"
        log_success "Created service user: $SERVICE_USER"
    else
        log_info "Service user $SERVICE_USER already exists"
    fi

    # Create all required directories
    mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR" "$RUN_DIR" "/tmp/depthai-frames"
    
    # Set proper ownership
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$LOG_DIR" "$RUN_DIR" "/tmp/depthai-frames"
    
    # Add user to required groups for hardware access
    usermod -a -G plugdev,video,dialout "$SERVICE_USER"

    log_success "User and directories created with proper permissions"
}

setup_virtual_environment() {
    log_info "Setting up Python virtual environment..."

    cd "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" python3 -m venv venv

    sudo -u "$SERVICE_USER" bash -c "
        source venv/bin/activate
        pip install -U pip setuptools wheel
        pip install --extra-index-url https://artifacts.luxonis.com/artifactory/luxonis-python-snapshot-local/ depthai
        pip install opencv-python numpy
    "

    log_success "Virtual environment setup complete"
}

install_daemon_files() {
    log_info "Installing daemon files..."

    if [[ -f "$SCRIPT_DIR/depthai_daemon.py" ]]; then
        cp "$SCRIPT_DIR/depthai_daemon.py" "$INSTALL_DIR/"
        chmod +x "$INSTALL_DIR/depthai_daemon.py"
        chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/depthai_daemon.py"
        log_success "Daemon script installed"
    else
        log_error "depthai_daemon.py not found in script directory: $SCRIPT_DIR"
        exit 1
    fi
    
    # Generate the default config as root to avoid permission issues
    log_info "Generating default configuration..."
    "$INSTALL_DIR/venv/bin/python" "$INSTALL_DIR/depthai_daemon.py" --generate-config --config "$CONFIG_DIR/config.json"
    
    # Change ownership of the config file to the service user
    chown "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR/config.json"
    log_success "Default configuration created and permissions set"
}

setup_udev_rules() {
    log_info "Setting up udev rules for DepthAI devices..."
    cat > /etc/udev/rules.d/80-depthai.rules << 'EOF'
# DepthAI USB device rules
SUBSYSTEM=="usb", ATTRS{idVendor}=="03e7", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTRS{idVendor}=="03e7", ATTRS{idProduct}=="2485", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTRS{idVendor}=="03e7", ATTRS{idProduct}=="f63b", MODE="0666", GROUP="plugdev"
EOF

    udevadm control --reload-rules
    udevadm trigger

    log_success "Udev rules configured"
}

install_systemd_service() {
    log_info "Installing systemd service (with NAMESPACE fixes)..."

    cat > /etc/systemd/system/depthai-daemon.service << EOF
[Unit]
Description=DepthAI Camera Daemon Service
Documentation=https://docs.luxonis.com/
After=network.target multi-user.target
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR

# Environment and executable
Environment=PATH=$INSTALL_DIR/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$INSTALL_DIR/venv/bin/python $INSTALL_DIR/depthai_daemon.py --config $CONFIG_DIR/config.json

# Restart configuration
Restart=always
RestartSec=10
StartLimitInterval=300
StartLimitBurst=5

# Process management
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30

# Output and logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=depthai-daemon

# Security settings - Minimal to avoid NAMESPACE issues
NoNewPrivileges=true
# Removed problematic security restrictions:
# - PrivateTmp (causes mount namespace issues)
# - ProtectSystem (interferes with hardware access)
# - ProtectHome (can block device access)
# - ReadWritePaths (causes namespace mount errors)

# Hardware access groups - Essential for DepthAI devices
SupplementaryGroups=plugdev video dialout

# Resource limits
MemoryLimit=2G
CPUQuota=80%

# Environment variables for DepthAI
Environment=DEPTHAI_LEVEL=info
Environment=OPENCV_LOG_LEVEL=ERROR

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    log_success "Systemd service installed with NAMESPACE fixes"
}

enable_and_start_service() {
    log_info "Enabling and starting service..."

    systemctl enable depthai-daemon.service

    if systemctl start depthai-daemon.service; then
        log_success "Service started successfully"
    else
        log_error "Failed to start service"
        log_info "Checking service status..."
        systemctl status depthai-daemon.service --no-pager -l
        return 1
    fi

    # Give the service time to initialize
    sleep 5
    
    if systemctl is-active --quiet depthai-daemon.service; then
        log_success "Service is running and stable"
        log_info "Service status:"
        systemctl status depthai-daemon.service --no-pager -l
    else
        log_warning "Service may not be running properly."
        log_info "Recent logs:"
        journalctl -u depthai-daemon.service --no-pager -n 20
        log_info "Try: systemctl status depthai-daemon for more details"
    fi
}

create_management_scripts() {
    log_info "Creating management scripts..."

    cat > /usr/local/bin/depthai-status << 'EOF'
#!/bin/bash
echo "=== DepthAI Daemon Status ==="
systemctl status depthai-daemon.service --no-pager -l
echo
echo "=== Service Statistics ==="
if [[ -f /var/run/depthai-daemon/status.json ]]; then
    echo "Status file found:"
    cat /var/run/depthai-daemon/status.json | python3 -m json.tool 2>/dev/null || cat /var/run/depthai-daemon/status.json
else
    echo "Status file not found - service may still be starting"
fi
echo
echo "=== Recent Logs (last 10 lines) ==="
journalctl -u depthai-daemon.service --no-pager -n 10
EOF

    cat > /usr/local/bin/depthai-config << 'EOF'
#!/bin/bash
CONFIG_FILE="/etc/depthai-daemon/config.json"
if [[ "$1" == "edit" ]]; then
    nano "$CONFIG_FILE"
    echo "Configuration updated. Restart with: sudo systemctl restart depthai-daemon"
elif [[ "$1" == "show" ]]; then
    echo "Current configuration:"
    cat "$CONFIG_FILE" | python3 -m json.tool 2>/dev/null || cat "$CONFIG_FILE"
elif [[ "$1" == "reload" ]]; then
    sudo systemctl kill -s HUP depthai-daemon
    echo "Configuration reload signal sent"
elif [[ "$1" == "backup" ]]; then
    BACKUP_FILE="/etc/depthai-daemon/config.json.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$CONFIG_FILE" "$BACKUP_FILE"
    echo "Configuration backed up to: $BACKUP_FILE"
else
    echo "DepthAI Configuration Management"
    echo "Usage: depthai-config {edit|show|reload|backup}"
    echo "  edit   - Edit configuration file"
    echo "  show   - Display current configuration"
    echo "  reload - Send reload signal to daemon"
    echo "  backup - Create backup of current config"
fi
EOF

    cat > /usr/local/bin/depthai-logs << 'EOF'
#!/bin/bash
if [[ "$1" == "follow" || "$1" == "-f" ]]; then
    echo "Following DepthAI daemon logs (Ctrl+C to stop):"
    journalctl -u depthai-daemon.service -f
elif [[ "$1" == "errors" ]]; then
    echo "DepthAI daemon error logs:"
    journalctl -u depthai-daemon.service -p err --no-pager
elif [[ "$1" == "today" ]]; then
    echo "DepthAI daemon logs from today:"
    journalctl -u depthai-daemon.service --since today --no-pager
else
    echo "DepthAI daemon recent logs:"
    journalctl -u depthai-daemon.service --no-pager -n 50
    echo
    echo "Usage: depthai-logs {follow|errors|today}"
    echo "  follow - Follow logs in real-time"
    echo "  errors - Show only error logs"
    echo "  today  - Show logs from today"
fi
EOF

    cat > /usr/local/bin/depthai-test << 'EOF'
#!/bin/bash
echo "=== DepthAI System Test ==="

echo "1. Checking if daemon is running..."
if systemctl is-active --quiet depthai-daemon.service; then
    echo "✓ Daemon is running"
else
    echo "✗ Daemon is not running"
    echo "  Start with: sudo systemctl start depthai-daemon"
fi

echo
echo "2. Checking DepthAI devices..."
if lsusb | grep -q "03e7"; then
    echo "✓ DepthAI device detected via USB"
    lsusb | grep "03e7"
else
    echo "✗ No DepthAI devices found via USB"
fi

echo
echo "3. Checking configuration..."
if [[ -f /etc/depthai-daemon/config.json ]]; then
    echo "✓ Configuration file exists"
    if python3 -m json.tool /etc/depthai-daemon/config.json >/dev/null 2>&1; then
        echo "✓ Configuration file is valid JSON"
    else
        echo "✗ Configuration file has JSON errors"
    fi
else
    echo "✗ Configuration file missing"
fi

echo
echo "4. Checking directories..."
for dir in "/opt/depthai-daemon" "/var/log/depthai-daemon" "/var/run/depthai-daemon" "/tmp/depthai-frames"; do
    if [[ -d "$dir" ]]; then
        echo "✓ Directory exists: $dir"
    else
        echo "✗ Directory missing: $dir"
    fi
done

echo
echo "5. Testing Python environment..."
if /opt/depthai-daemon/venv/bin/python -c "import depthai; print(f'DepthAI version: {depthai.__version__}')" 2>/dev/null; then
    echo "✓ DepthAI Python module working"
else
    echo "✗ DepthAI Python module not working"
fi

echo
echo "Test complete. Use 'depthai-status' for detailed service status."
EOF

    chmod +x /usr/local/bin/depthai-status /usr/local/bin/depthai-config /usr/local/bin/depthai-logs /usr/local/bin/depthai-test
    log_success "Management scripts created"
}

create_logrotate_config() {
    log_info "Setting up log rotation..."
    cat > /etc/logrotate.d/depthai-daemon << 'EOF'
/var/log/depthai-daemon/*.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 644 pi pi
    postrotate
        systemctl reload depthai-daemon.service > /dev/null 2>&1 || true
    endscript
}
EOF
    log_success "Log rotation configured"
}

show_usage_info() {
    echo
    log_success "Installation completed successfully!"
    echo
    echo "=== DepthAI Daemon Management Commands ==="
    echo "  sudo systemctl start depthai-daemon    # Start the service"
    echo "  sudo systemctl stop depthai-daemon     # Stop the service" 
    echo "  sudo systemctl restart depthai-daemon  # Restart the service"
    echo "  sudo systemctl status depthai-daemon   # Check service status"
    echo
    echo "=== DepthAI Management Tools ==="
    echo "  depthai-status        # Show comprehensive status"
    echo "  depthai-logs          # Show recent logs"
    echo "  depthai-logs follow   # Follow logs in real-time"
    echo "  depthai-config show   # Display current configuration"
    echo "  depthai-config edit   # Edit configuration"
    echo "  depthai-test          # Run system diagnostics"
    echo
    echo "=== Quick Start ==="
    echo "1. Check status:       depthai-status"
    echo "2. View live logs:     depthai-logs follow"
    echo "3. Edit config:        depthai-config edit"
    echo "4. Test system:        depthai-test"
    echo
    echo "=== Configuration Tips ==="
    echo "• Frame saving is disabled by default (saves storage)"
    echo "• To enable frame saving: depthai-config edit → set save_frames: true"
    echo "• Configuration file: /etc/depthai-daemon/config.json"
    echo "• Logs location: /var/log/depthai-daemon/"
    echo "• Saved frames: /tmp/depthai-frames/ (if enabled)"
    echo
    echo "=== Troubleshooting ==="
    echo "• If service fails: depthai-logs errors"
    echo "• Test hardware: depthai-test"
    echo "• Manual test: sudo -u pi /opt/depthai-daemon/venv/bin/python /opt/depthai-daemon/depthai_daemon.py --config /etc/depthai-daemon/config.json"
    echo "• Check USB: lsusb | grep -i luxonis"
    echo
    echo "The daemon is now running and monitoring your DepthAI device!"
}

fix_service() {
    log_info "Fixing existing systemd service..."
    
    # Stop the service
    systemctl stop depthai-daemon.service || true
    
    # Ensure directories exist with proper permissions
    create_user_and_directories
    
    # Install the corrected service file
    install_systemd_service
    
    # Try to start again
    enable_and_start_service
}

test_installation() {
    log_info "Testing installation..."
    
    # Test 1: Check if service is running
    if systemctl is-active --quiet depthai-daemon.service; then
        log_success "Service is running"
    else
        log_error "Service is not running"
        return 1
    fi
    
    # Test 2: Check if device is detected
    if lsusb | grep -q "03e7"; then
        log_success "DepthAI device detected"
    else
        log_warning "DepthAI device not detected via USB"
    fi
    
    # Test 3: Check if status file is created
    sleep 3
    if [[ -f /var/run/depthai-daemon/status.json ]]; then
        log_success "Status file created successfully"
    else
        log_warning "Status file not yet created (service may still be starting)"
    fi
    
    log_info "Installation test complete"
}

uninstall_service() {
    log_info "Uninstalling DepthAI Daemon..."
    
    # Stop and disable service
    systemctl stop depthai-daemon.service || true
    systemctl disable depthai-daemon.service || true
    
    # Remove service files
    rm -f /etc/systemd/system/depthai-daemon.service
    rm -f /etc/udev/rules.d/80-depthai.rules
    rm -f /usr/local/bin/depthai-*
    rm -f /etc/logrotate.d/depthai-daemon
    
    # Remove directories
    rm -rf "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR" "$RUN_DIR"
    
    # Remove user (but keep /tmp/depthai-frames in case user wants to preserve data)
    userdel "$SERVICE_USER" 2>/dev/null || true
    
    # Reload systemd and udev
    systemctl daemon-reload
    udevadm control --reload-rules
    
    log_success "DepthAI Daemon uninstalled"
    log_info "Note: /tmp/depthai-frames preserved (remove manually if needed)"
}

main() {
    echo "DepthAI Daemon Installation Script v2.0"
    echo "Updated with NAMESPACE fixes and improved management tools"
    echo
    
    case "${1:-install}" in
        install)
            log_info "Starting DepthAI Daemon installation..."
            check_root
            check_system
            install_system_dependencies
            create_user_and_directories
            setup_virtual_environment
            install_daemon_files
            setup_udev_rules
            install_systemd_service
            enable_and_start_service
            create_management_scripts
            create_logrotate_config
            test_installation
            show_usage_info
            ;;
        fix)
            log_info "Fixing NAMESPACE issues in existing installation..."
            check_root
            fix_service
            log_success "Fix completed. Check status with: depthai-status"
            ;;
        test)
            test_installation
            ;;
        uninstall)
            check_root
            uninstall_service
            ;;
        *)
            echo "Usage: $0 {install|fix|test|uninstall}"
            echo
            echo "Commands:"
            echo "  install   - Full installation of DepthAI daemon"
            echo "  fix       - Fix NAMESPACE issues in existing installation"
            echo "  test      - Test current installation"
            echo "  uninstall - Remove DepthAI daemon installation"
            echo
            echo "After installation, use these commands:"
            echo "  depthai-status  - Check service status"
            echo "  depthai-test    - Run diagnostics"
            echo "  depthai-logs    - View logs"
            exit 1
            ;;
    esac
}

main "$@"