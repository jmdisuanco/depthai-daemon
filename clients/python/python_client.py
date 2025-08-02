#!/usr/bin/env python3
"""
DepthAI Daemon Python Client

A comprehensive Python client for interacting with the DepthAI daemon service.
Supports status monitoring, frame retrieval, IMU data analysis, and configuration management.
"""

import json
import os
import time
import glob
import subprocess
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Generator
import threading

try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("Warning: OpenCV not available. Frame processing features disabled.")

try:
    import matplotlib.pyplot as plt
    import matplotlib.animation as animation
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False
    print("Warning: Matplotlib not available. Plotting features disabled.")

class DepthAIClient:
    """Python client for DepthAI daemon service"""
    
    def __init__(self):
        self.status_path = '/var/run/depthai-daemon/status.json'
        self.config_path = '/etc/depthai-daemon/config.json'
        self.output_dir = '/tmp/depthai-frames'
        self.log_path = '/var/log/depthai-daemon/daemon.log'
        
    def get_status(self) -> Optional[Dict[str, Any]]:
        """Get current daemon status"""
        try:
            if not os.path.exists(self.status_path):
                print("Warning: Status file not found. Is the daemon running?")
                return None
                
            with open(self.status_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading status: {e}")
            return None
    
    def get_config(self) -> Optional[Dict[str, Any]]:
        """Get current daemon configuration"""
        try:
            if not os.path.exists(self.config_path):
                print("Warning: Config file not found.")
                return None
                
            with open(self.config_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading config: {e}")
            return None
    
    def update_config(self, config_updates: Dict[str, Any]) -> bool:
        """Update daemon configuration"""
        try:
            current_config = self.get_config()
            if not current_config:
                print("Error: Cannot read current config")
                return False
            
            # Deep merge configuration
            new_config = self._deep_merge(current_config, config_updates)
            
            with open(self.config_path, 'w') as f:
                json.dump(new_config, f, indent=2)
            
            print("Configuration updated. Reload daemon with: sudo systemctl kill -s HUP depthai-daemon")
            return True
        except Exception as e:
            print(f"Error updating config: {e}")
            return False
    
    def get_latest_frames(self, count: int = 5, frame_type: str = "rgb") -> List[str]:
        """Get latest frames from output directory"""
        try:
            if not os.path.exists(self.output_dir):
                print("Warning: Output directory not found. Frame saving may be disabled.")
                return []
            
            # Look for frames of specified type
            pattern = os.path.join(self.output_dir, f"{frame_type}_*.jpg")
            files = glob.glob(pattern)
            
            # Sort by modification time (newest first)
            files.sort(key=os.path.getmtime, reverse=True)
            
            return files[:count]
        except Exception as e:
            print(f"Error getting latest frames: {e}")
            return []
    
    def get_latest_imu_data(self, count: int = 10) -> List[Dict[str, Any]]:
        """Get latest IMU data"""
        try:
            imu_dir = os.path.join(self.output_dir, 'imu')
            
            if not os.path.exists(imu_dir):
                print("Warning: IMU directory not found. IMU may be disabled or not available.")
                return []
            
            # Get IMU JSON files
            files = glob.glob(os.path.join(imu_dir, 'imu_*.json'))
            files.sort(key=os.path.getmtime, reverse=True)
            
            imu_data = []
            for file_path in files[:count]:
                try:
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                        imu_data.append(data)
                except Exception as e:
                    print(f"Warning: Error reading IMU file {file_path}: {e}")
            
            return imu_data
        except Exception as e:
            print(f"Error getting IMU data: {e}")
            return []
    
    def monitor_status(self, interval: float = 1.0) -> Generator[Optional[Dict[str, Any]], None, None]:
        """Monitor daemon status in real-time"""
        while True:
            status = self.get_status()
            yield status
            time.sleep(interval)
    
    def get_logs(self, lines: int = 50) -> List[str]:
        """Get recent log entries"""
        try:
            if not os.path.exists(self.log_path):
                print("Warning: Log file not found.")
                return []
            
            # Use tail command to get last N lines
            result = subprocess.run(['tail', '-n', str(lines), self.log_path], 
                                  capture_output=True, text=True)
            
            if result.returncode == 0:
                return result.stdout.strip().split('\n')
            else:
                print(f"Error reading logs: {result.stderr}")
                return []
        except Exception as e:
            print(f"Error reading logs: {e}")
            return []
    
    def is_healthy(self) -> bool:
        """Check if daemon is healthy"""
        status = self.get_status()
        return (status and 
                status.get('health', {}).get('status') == 'healthy' and 
                status.get('status') == 'running')
    
    def export_data(self, output_path: str) -> bool:
        """Export comprehensive data to JSON file"""
        try:
            export_data = {
                'timestamp': datetime.now().isoformat(),
                'status': self.get_status(),
                'config': self.get_config(),
                'recent_imu_data': self.get_latest_imu_data(100),
                'recent_logs': self.get_logs(100),
                'latest_frames': {
                    'rgb': self.get_latest_frames(10, 'rgb'),
                    'depth': self.get_latest_frames(10, 'depth')
                }
            }
            
            with open(output_path, 'w') as f:
                json.dump(export_data, f, indent=2)
            
            print(f"Data exported to: {output_path}")
            return True
        except Exception as e:
            print(f"Error exporting data: {e}")
            return False
    
    def analyze_imu_data(self, samples: int = 100) -> Dict[str, Any]:
        """Analyze recent IMU data for statistics"""
        if not MATPLOTLIB_AVAILABLE:
            print("Matplotlib not available for IMU analysis")
            return {}
        
        imu_data = self.get_latest_imu_data(samples)
        if not imu_data:
            return {}
        
        analysis = {
            'sample_count': len(imu_data),
            'accelerometer': {'x': [], 'y': [], 'z': []},
            'gyroscope': {'x': [], 'y': [], 'z': []},
            'magnetometer': {'x': [], 'y': [], 'z': []},
            'timestamps': []
        }
        
        for data in imu_data:
            analysis['timestamps'].append(data.get('timestamp', ''))
            
            if 'accelerometer' in data:
                acc = data['accelerometer']
                analysis['accelerometer']['x'].append(acc.get('x', 0))
                analysis['accelerometer']['y'].append(acc.get('y', 0))
                analysis['accelerometer']['z'].append(acc.get('z', 0))
            
            if 'gyroscope' in data:
                gyro = data['gyroscope']
                analysis['gyroscope']['x'].append(gyro.get('x', 0))
                analysis['gyroscope']['y'].append(gyro.get('y', 0))
                analysis['gyroscope']['z'].append(gyro.get('z', 0))
            
            if 'magnetometer' in data:
                mag = data['magnetometer']
            if 'magnetometer' in data:
                mag = data['magnetometer']
                analysis['magnetometer']['x'].append(mag.get('x', 0))
                analysis['magnetometer']['y'].append(mag.get('y', 0))
                analysis['magnetometer']['z'].append(mag.get('z', 0))
        
        # Calculate statistics
        for sensor in ['accelerometer', 'gyroscope', 'magnetometer']:
            if analysis[sensor]['x']:  # If we have data for this sensor
                for axis in ['x', 'y', 'z']:
                    values = analysis[sensor][axis]
                    analysis[sensor][f'{axis}_mean'] = np.mean(values) if values else 0
                    analysis[sensor][f'{axis}_std'] = np.std(values) if values else 0
                    analysis[sensor][f'{axis}_min'] = np.min(values) if values else 0
                    analysis[sensor][f'{axis}_max'] = np.max(values) if values else 0
        
        return analysis
    
    def display_frame(self, frame_path: str, window_name: str = "DepthAI Frame"):
        """Display a frame using OpenCV"""
        if not CV2_AVAILABLE:
            print("OpenCV not available for frame display")
            return
        
        try:
            frame = cv2.imread(frame_path)
            if frame is None:
                print(f"Could not load frame: {frame_path}")
                return
            
            cv2.imshow(window_name, frame)
            cv2.waitKey(0)
            cv2.destroyAllWindows()
        except Exception as e:
            print(f"Error displaying frame: {e}")
    
    def plot_imu_data(self, samples: int = 100, save_path: Optional[str] = None):
        """Plot IMU data over time"""
        if not MATPLOTLIB_AVAILABLE:
            print("Matplotlib not available for plotting")
            return
        
        analysis = self.analyze_imu_data(samples)
        if not analysis or not analysis['timestamps']:
            print("No IMU data available for plotting")
            return
        
        fig, axes = plt.subplots(3, 1, figsize=(12, 10))
        fig.suptitle('DepthAI IMU Data Analysis')
        
        # Convert timestamps to relative time
        timestamps = range(len(analysis['timestamps']))
        
        # Plot accelerometer
        if analysis['accelerometer']['x']:
            axes[0].plot(timestamps, analysis['accelerometer']['x'], 'r-', label='X')
            axes[0].plot(timestamps, analysis['accelerometer']['y'], 'g-', label='Y')
            axes[0].plot(timestamps, analysis['accelerometer']['z'], 'b-', label='Z')
            axes[0].set_title('Accelerometer (m/s²)')
            axes[0].set_ylabel('Acceleration')
            axes[0].legend()
            axes[0].grid(True)
        
        # Plot gyroscope
        if analysis['gyroscope']['x']:
            axes[1].plot(timestamps, analysis['gyroscope']['x'], 'r-', label='X')
            axes[1].plot(timestamps, analysis['gyroscope']['y'], 'g-', label='Y')
            axes[1].plot(timestamps, analysis['gyroscope']['z'], 'b-', label='Z')
            axes[1].set_title('Gyroscope (rad/s)')
            axes[1].set_ylabel('Angular Velocity')
            axes[1].legend()
            axes[1].grid(True)
        
        # Plot magnetometer
        if analysis['magnetometer']['x']:
            axes[2].plot(timestamps, analysis['magnetometer']['x'], 'r-', label='X')
            axes[2].plot(timestamps, analysis['magnetometer']['y'], 'g-', label='Y')
            axes[2].plot(timestamps, analysis['magnetometer']['z'], 'b-', label='Z')
            axes[2].set_title('Magnetometer (µT)')
            axes[2].set_ylabel('Magnetic Field')
            axes[2].legend()
            axes[2].grid(True)
        
        axes[2].set_xlabel('Sample Number')
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"Plot saved to: {save_path}")
        else:
            plt.show()
        
        plt.close()
    
    def live_monitor_gui(self):
        """Launch a live monitoring GUI"""
        if not MATPLOTLIB_AVAILABLE:
            print("Matplotlib not available for GUI monitoring")
            return
        
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(15, 10))
        fig.suptitle('DepthAI Live Monitor')
        
        # Data storage for live plotting
        timestamps = []
        fps_data = []
        temp_data = []
        frame_count_data = []
        
        def update_plots(frame):
            status = self.get_status()
            if not status:
                return
            
            current_time = time.time()
            timestamps.append(current_time)
            fps_data.append(status['stats']['current_fps'])
            temp_data.append(status['stats'].get('current_temperature_c', 0))
            frame_count_data.append(status['stats']['total_frames'])
            
            # Keep only last 50 points
            if len(timestamps) > 50:
                timestamps.pop(0)
                fps_data.pop(0)
                temp_data.pop(0)
                frame_count_data.pop(0)
            
            # Clear and update plots
            ax1.clear()
            ax1.plot(timestamps, fps_data, 'g-')
            ax1.set_title('Current FPS')
            ax1.set_ylabel('FPS')
            ax1.grid(True)
            
            ax2.clear()
            ax2.plot(timestamps, temp_data, 'r-')
            ax2.set_title('Device Temperature')
            ax2.set_ylabel('Temperature (°C)')
            ax2.grid(True)
            
            ax3.clear()
            ax3.plot(timestamps, frame_count_data, 'b-')
            ax3.set_title('Total Frames')
            ax3.set_ylabel('Frame Count')
            ax3.grid(True)
            
            # Status text
            ax4.clear()
            ax4.text(0.1, 0.8, f"Status: {status['status']}", fontsize=12)
            ax4.text(0.1, 0.7, f"Health: {status['health']['status']}", fontsize=12)
            ax4.text(0.1, 0.6, f"Uptime: {status['stats']['uptime_formatted']}", fontsize=12)
            ax4.text(0.1, 0.5, f"Errors: {status['stats']['error_count']}", fontsize=12)
            if status['stats'].get('imu_data_count', 0) > 0:
                ax4.text(0.1, 0.4, f"IMU Samples: {status['stats']['imu_data_count']:,}", fontsize=12)
            ax4.set_xlim(0, 1)
            ax4.set_ylim(0, 1)
            ax4.set_title('System Status')
            ax4.axis('off')
        
        ani = animation.FuncAnimation(fig, update_plots, interval=2000, blit=False)
        plt.tight_layout()
        plt.show()
    
    def stream_frames(self, frame_type: str = "rgb", display_time: float = 0.1):
        """Stream frames in real-time"""
        if not CV2_AVAILABLE:
            print("OpenCV not available for frame streaming")
            return
        
        print(f"Streaming {frame_type} frames. Press 'q' to quit.")
        
        last_frame = None
        while True:
            frames = self.get_latest_frames(1, frame_type)
            if frames and frames[0] != last_frame:
                last_frame = frames[0]
                frame = cv2.imread(frames[0])
                if frame is not None:
                    # Add timestamp overlay
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    cv2.putText(frame, timestamp, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 
                              1, (255, 255, 255), 2)
                    
                    cv2.imshow(f"DepthAI {frame_type.upper()} Stream", frame)
            
            if cv2.waitKey(int(display_time * 1000)) & 0xFF == ord('q'):
                break
        
        cv2.destroyAllWindows()
    
    @staticmethod
    def _deep_merge(dict1: Dict, dict2: Dict) -> Dict:
        """Deep merge two dictionaries"""
        result = dict1.copy()
        for key, value in dict2.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = DepthAIClient._deep_merge(result[key], value)
            else:
                result[key] = value
        return result
    
    @staticmethod
    def format_uptime(seconds: float) -> str:
        """Format uptime for display"""
        days = int(seconds // 86400)
        hours = int((seconds % 86400) // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        
        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        parts.append(f"{secs}s")
        
        return " ".join(parts)

class DepthAICLI:
    """Command-line interface for DepthAI client"""
    
    def __init__(self):
        self.client = DepthAIClient()
    
    def show_status(self):
        """Show current daemon status"""
        print("🔍 DepthAI Daemon Status\n")
        
        status = self.client.get_status()
        if not status:
            print("❌ Daemon not running or status unavailable")
            return
        
        stats = status['stats']
        print(f"📊 Service Status: {'✅ Running' if status['status'] == 'running' else '❌ Stopped'}")
        print(f"🆔 Process ID: {status['pid']}")
        print(f"⏱️  Uptime: {self.client.format_uptime(stats['uptime_seconds'])}")
        print(f"🎬 Total Frames: {stats['total_frames']:,}")
        print(f"📈 Current FPS: {stats['current_fps']:.1f}")
        print(f"📊 Average FPS: {stats['average_fps']:.1f}")
        print(f"❌ Errors: {stats['error_count']}")
        
        if stats.get('imu_data_count', 0) > 0:
            print(f"🧭 IMU Samples: {stats['imu_data_count']:,}")
        
        if stats.get('current_temperature_c'):
            print(f"🌡️  Temperature: {stats['current_temperature_c']:.1f}°C")
        
        print(f"\n🏥 Health: {'✅ Healthy' if status['health']['status'] == 'healthy' else '⚠️ ' + status['health']['status']}")
        if status['health']['issues']:
            print("⚠️  Issues:")
            for issue in status['health']['issues']:
                print(f"   • {issue}")
    
    def monitor_status(self):
        """Monitor daemon status in real-time"""
        print("🔄 Monitoring DepthAI Daemon (Press Ctrl+C to stop)\n")
        
        try:
            for status in self.client.monitor_status(2.0):
                if not status:
                    print("❌ Daemon not available")
                    continue
                
                # Clear screen and show updated status
                os.system('clear' if os.name == 'posix' else 'cls')
                print("🔄 Real-time DepthAI Monitor\n")
                
                stats = status['stats']
                print(f"Status: {status['status']} | FPS: {stats['current_fps']:.1f} | Frames: {stats['total_frames']:,}")
                
                if stats.get('current_temperature_c'):
                    print(f"Temperature: {stats['current_temperature_c']:.1f}°C")
                
                if stats.get('imu_data_count', 0) > 0:
                    print(f"IMU: {stats['imu_data_count']:,} samples")
                
                print(f"Health: {status['health']['status']} | Uptime: {self.client.format_uptime(stats['uptime_seconds'])}")
                print(f"Last update: {datetime.now().strftime('%H:%M:%S')}")
        
        except KeyboardInterrupt:
            print("\n\n📴 Monitoring stopped")
    
    def show_config(self):
        """Show current configuration"""
        print("⚙️  DepthAI Configuration\n")
        
        config = self.client.get_config()
        if not config:
            print("❌ Configuration unavailable")
            return
        
        camera = config['camera']
        print("📷 Camera Settings:")
        print(f"   Resolution: {camera['rgb_resolution'][0]}x{camera['rgb_resolution'][1]}")
        print(f"   FPS: {camera['rgb_fps']}")
        print(f"   Depth: {'✅' if camera['depth_enabled'] else '❌'}")
        print(f"   IMU: {'✅' if camera['imu_enabled'] else '❌'}")
        if camera['imu_enabled']:
            print(f"   IMU Frequency: {camera['imu_frequency']}Hz")
        
        ai = config['ai']
        print("\n🤖 AI Settings:")
        print(f"   Model: {'✅' if ai['model_enabled'] else '❌'}")
        if ai['model_enabled']:
            print(f"   Path: {ai['model_path']}")
            print(f"   Confidence: {ai['confidence_threshold']}")
        
        output = config['output']
        print("\n💾 Output Settings:")
        print(f"   Save Frames: {'✅' if output['save_frames'] else '❌'}")
        print(f"   Directory: {output['output_directory']}")
        print(f"   Max Files: {output['max_files']}")
    
    def show_imu_data(self, count: int = 5):
        """Show latest IMU data"""
        print("🧭 Latest IMU Data\n")
        
        imu_data = self.client.get_latest_imu_data(count)
        if not imu_data:
            print("❌ No IMU data available")
            return
        
        for i, data in enumerate(imu_data):
            print(f"📊 Sample {i + 1} ({data.get('timestamp', 'Unknown')}):")
            
            if 'accelerometer' in data:
                acc = data['accelerometer']
                print(f"   Accelerometer: x={acc['x']:.3f}, y={acc['y']:.3f}, z={acc['z']:.3f} m/s²")
            
            if 'gyroscope' in data:
                gyro = data['gyroscope']
                print(f"   Gyroscope: x={gyro['x']:.3f}, y={gyro['y']:.3f}, z={gyro['z']:.3f} rad/s")
            
            if 'magnetometer' in data:
                mag = data['magnetometer']
                print(f"   Magnetometer: x={mag['x']:.3f}, y={mag['y']:.3f}, z={mag['z']:.3f} µT")
            
            print()
    
    def show_frames(self, count: int = 10):
        """Show latest frames"""
        print("🎬 Latest Frames\n")
        
        rgb_frames = self.client.get_latest_frames(count, 'rgb')
        depth_frames = self.client.get_latest_frames(count, 'depth')
        
        if not rgb_frames and not depth_frames:
            print("❌ No frames available")
            return
        
        if rgb_frames:
            print(f"📷 RGB Frames ({len(rgb_frames)} found):")
            for i, frame in enumerate(rgb_frames):
                print(f"   {i + 1}. {os.path.basename(frame)}")
        
        if depth_frames:
            print(f"\n🔍 Depth Frames ({len(depth_frames)} found):")
            for i, frame in enumerate(depth_frames):
                print(f"   {i + 1}. {os.path.basename(frame)}")
    
    def show_logs(self, lines: int = 20):
        """Show recent logs"""
        print(f"📝 Recent Logs ({lines} lines)\n")
        
        logs = self.client.get_logs(lines)
        if not logs:
            print("❌ No logs available")
            return
        
        for log in logs:
            print(log)
    
    def check_health(self):
        """Check daemon health"""
        print("🏥 Health Check\n")
        
        is_healthy = self.client.is_healthy()
        print(f"Status: {'✅ Healthy' if is_healthy else '❌ Unhealthy'}")
        
        status = self.client.get_status()
        if status and status['health'].get('issues'):
            print("\n⚠️  Issues:")
            for issue in status['health']['issues']:
                print(f"   • {issue}")
    
    def export_data(self, output_path: str):
        """Export comprehensive data"""
        print("💾 Exporting DepthAI data...")
        
        success = self.client.export_data(output_path)
        if success:
            print("✅ Export completed")
        else:
            print("❌ Export failed")
    
    def set_fps(self, fps: int):
        """Set camera FPS"""
        print(f"🎬 Setting FPS to {fps}...")
        
        success = self.client.update_config({
            'camera': {'rgb_fps': fps}
        })
        
        if success:
            print("✅ FPS updated")
        else:
            print("❌ Failed to update FPS")
    
    def show_help(self):
        """Show help information"""
        print("📖 DepthAI Python Client Help\n")
        print("Usage: python3 depthai_client.py [command] [options]\n")
        print("Commands:")
        print("  status              - Show current daemon status")
        print("  monitor             - Monitor daemon in real-time")
        print("  config              - Show configuration")
        print("  imu [count]         - Show latest IMU data (default: 5)")
        print("  frames [count]      - List recent frames (default: 10)")
        print("  logs [lines]        - Show recent log lines (default: 20)")
        print("  export [file]       - Export all data to JSON")
        print("  health              - Check daemon health")
        print("  set-fps N           - Set camera FPS to N")
        print("  plot-imu [samples]  - Plot IMU data (requires matplotlib)")
        print("  live-monitor        - Launch live monitoring GUI")
        print("  stream [type]       - Stream frames (rgb/depth)")
        print("  display [path]      - Display a specific frame")
        print("  help                - Show this help")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='DepthAI Daemon Python Client')
    parser.add_argument('command', nargs='?', default='status', 
                       help='Command to execute (default: status)')
    parser.add_argument('args', nargs='*', help='Additional arguments')
    
    args = parser.parse_args()
    cli = DepthAICLI()
    
    try:
        if args.command == 'status':
            cli.show_status()
        elif args.command == 'monitor':
            cli.monitor_status()
        elif args.command == 'config':
            cli.show_config()
        elif args.command == 'imu':
            count = int(args.args[0]) if args.args else 5
            cli.show_imu_data(count)
        elif args.command == 'frames':
            count = int(args.args[0]) if args.args else 10
            cli.show_frames(count)
        elif args.command == 'logs':
            lines = int(args.args[0]) if args.args else 20
            cli.show_logs(lines)
        elif args.command == 'export':
            output_path = args.args[0] if args.args else f'depthai-export-{int(time.time())}.json'
            cli.export_data(output_path)
        elif args.command == 'health':
            cli.check_health()
        elif args.command == 'set-fps':
            if args.args:
                fps = int(args.args[0])
                cli.set_fps(fps)
            else:
                print("Error: FPS value required")
        elif args.command == 'plot-imu':
            samples = int(args.args[0]) if args.args else 100
            cli.client.plot_imu_data(samples)
        elif args.command == 'live-monitor':
            cli.client.live_monitor_gui()
        elif args.command == 'stream':
            frame_type = args.args[0] if args.args else 'rgb'
            cli.client.stream_frames(frame_type)
        elif args.command == 'display':
            if args.args:
                cli.client.display_frame(args.args[0])
            else:
                print("Error: Frame path required")
        else:
            cli.show_help()
    
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == '__main__':
    main()
