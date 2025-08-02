#!/bin/bash

# DepthAI Daemon Installation Script
# This script installs and configures the DepthAI daemon service

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
        udev
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

    mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR" "$RUN_DIR" "/tmp/depthai-frames"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$LOG_DIR" "$RUN_DIR" "/tmp/depthai-frames"
    usermod -a -G plugdev,video,dialout "$SERVICE_USER"

    log_success "User and directories created"
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
    log_info "Generating default configuration as root..."
    "$INSTALL_DIR/venv/bin/python" "$INSTALL_DIR/depthai_daemon.py" --generate-config --config "$CONFIG_DIR/config.json"
    
    # Change ownership of the config file to the service user
    chown "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR/config.json"
    log_success "Default configuration created and permissions set."
}

setup_udev_rules() {
    log_info "Setting up udev rules for DepthAI devices..."
    cat > /etc/udev/rules.d/80-depthai.rules << 'EOF'
SUBSYSTEM=="usb", ATTRS{idVendor}=="03e7", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTRS{idVendor}=="03e7", ATTRS{idProduct}=="2485", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTRS{idVendor}=="03e7", ATTRS{idProduct}=="f63b", MODE="0666", GROUP="plugdev"
EOF

    udevadm control --reload-rules
    udevadm trigger

    log_success "Udev rules configured"
}

install_systemd_service() {
    log_info "Installing systemd service with relaxed security settings..."

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

# Virtual environment and executable
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

# Security and permissions - RELAXED to fix NAMESPACE issues
NoNewPrivileges=true
# Commented out problematic security restrictions that cause NAMESPACE errors
# PrivateTmp=true
# ProtectSystem=strict
# ProtectHome=true

# Required directories for the daemon
ReadWritePaths=$LOG_DIR $RUN_DIR /tmp/depthai-frames $CONFIG_DIR

# USB and hardware access - essential for DepthAI devices
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
    log_success "Systemd service installed with relaxed security settings"
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

    sleep 3
    if systemctl is-active --quiet depthai-daemon.service; then
        log_success "Service is running"
    else
        log_warning "Service may not be running properly. Check with: systemctl status depthai-daemon"
        log_info "Recent logs:"
        journalctl -u depthai-daemon.service --no-pager -n 20
    fi
}

create_management_scripts() {
    log_info "Creating management scripts..."

    cat > /usr/local/bin/depthai-status << 'EOF'
#!/bin/bash
echo "=== DepthAI Daemon Status ==="
systemctl status depthai-daemon.service
echo -e "\n=== Service Stats ==="
if [[ -f /var/run/depthai-daemon/status.json ]]; then
    cat /var/run/depthai-daemon/status.json | python3 -m json.tool
else
    echo "Status file not found"
fi
echo -e "\n=== Recent Logs ==="
journalctl -u depthai-daemon.service --no-pager -n 10
EOF

    cat > /usr/local/bin/depthai-config << 'EOF'
#!/bin/bash
CONFIG_FILE="/etc/depthai-daemon/config.json"
if [[ "$1" == "edit" ]]; then
    nano "$CONFIG_FILE"
    echo "Configuration updated. Restart with: sudo systemctl restart depthai-daemon"
elif [[ "$1" == "show" ]]; then
    cat "$CONFIG_FILE" | python3 -m json.tool
elif [[ "$1" == "reload" ]]; then
    sudo systemctl kill -s HUP depthai-daemon
    echo "Configuration reloaded"
else
    echo "Usage: depthai-config {edit|show|reload}"
fi
EOF

    cat > /usr/local/bin/depthai-logs << 'EOF'
#!/bin/bash
if [[ "$1" == "follow" || "$1" == "-f" ]]; then
    journalctl -u depthai-daemon.service -f
elif [[ "$1" == "errors" ]]; then
    journalctl -u depthai-daemon.service -p err
else
    journalctl -u depthai-daemon.service --no-pager -n 50
fi
EOF

    chmod +x /usr/local/bin/depthai-status /usr/local/bin/depthai-config /usr/local/bin/depthai-logs
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
    log_success "Installation completed successfully!"
    echo
    echo "=== DepthAI Daemon Management Commands ==="
    echo "  sudo systemctl start depthai-daemon"
    echo "  sudo systemctl stop depthai-daemon"
    echo "  sudo systemctl restart depthai-daemon"
    echo "  sudo systemctl status depthai-daemon"
    echo
    echo "  depthai-status         # Show status"
    echo "  depthai-logs           # Show logs"
    echo "  depthai-config edit    # Edit config"
    echo
    echo "=== Troubleshooting ==="
    echo "If the service fails to start:"
    echo "  1. Check logs: journalctl -u depthai-daemon.service -f"
    echo "  2. Test manually: sudo -u pi /opt/depthai-daemon/venv/bin/python /opt/depthai-daemon/depthai_daemon.py --config /etc/depthai-daemon/config.json"
    echo "  3. Check USB permissions: lsusb | grep -i luxonis"
}

fix_service() {
    log_info "Fixing existing systemd service with relaxed security settings..."
    
    # Stop the service
    systemctl stop depthai-daemon.service || true
    
    # Install the corrected service file
    install_systemd_service
    
    # Try to start again
    enable_and_start_service
}

uninstall_service() {
    log_info "Uninstalling DepthAI Daemon..."
    systemctl stop depthai-daemon.service || true
    systemctl disable depthai-daemon.service || true
    rm -f /etc/systemd/system/depthai-daemon.service
    rm -f /etc/udev/rules.d/80-depthai.rules
    rm -f /usr/local/bin/depthai-*
    rm -f /etc/logrotate.d/depthai-daemon
    rm -rf "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR" "$RUN_DIR"
    userdel "$SERVICE_USER" || true
    systemctl daemon-reload
    udevadm control --reload-rules
    log_success "DepthAI Daemon uninstalled"
}

main() {
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
            show_usage_info
            ;;
        fix)
            check_root
            fix_service
            ;;
        uninstall)
            check_root
            uninstall_service
            ;;
        *)
            echo "Usage: $0 {install|fix|uninstall}"
            echo "  install   - Full installation"
            echo "  fix       - Fix NAMESPACE issues with relaxed security"
            echo "  uninstall - Remove installation"
            exit 1
            ;;
    esac
}

main "$@"