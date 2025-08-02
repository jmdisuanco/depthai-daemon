#!/usr/bin/env python3
"""
DepthAI Daemon Service
A comprehensive daemon service for DepthAI cameras with configuration management,
health monitoring, multiple output modes, and robust error handling.
"""

import depthai as dai
import cv2
import numpy as np
import time
import logging
import signal
import sys
import json
import os
import threading
import queue
import socket
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional
import argparse

class DepthAIConfig:
    """Configuration management for DepthAI daemon"""
    
    DEFAULT_CONFIG = {
        "camera": {
            "rgb_resolution": [1920, 1080],
            "rgb_fps": 30,
            "mono_resolution": [640, 400],
            "mono_fps": 30,
            "depth_enabled": True,
            "preview_size": [640, 480],
            "imu_enabled": True,
            "imu_frequency": 100
        },
        "ai": {
            "model_enabled": False,
            "model_path": "",
            "model_name": "mobilenet-ssd",
            "confidence_threshold": 0.5
        },
        "output": {
            "save_frames": False,
            "output_directory": "/tmp/depthai-frames",
            "max_files": 1000,
            "stream_enabled": False,
            "stream_port": 8080,
            "rtsp_enabled": False,
            "rtsp_port": 8554
        },
        "service": {
            "health_check_interval": 30,
            "max_reconnect_attempts": 5,
            "reconnect_delay": 10,
            "log_level": "INFO",
            "stats_interval": 60
        }
    }
    
    def __init__(self, config_path: str = "/etc/depthai-daemon/config.json"):
        self.config_path = config_path
        self.config = self.load_config()
    
    def load_config(self) -> Dict[str, Any]:
        """Load configuration from file or create default"""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    config = json.load(f)
                # Merge with defaults to ensure all keys exist
                return self._merge_config(self.DEFAULT_CONFIG, config)
            else:
                self.save_config(self.DEFAULT_CONFIG)
                return self.DEFAULT_CONFIG.copy()
        except Exception as e:
            logging.error(f"Error loading config: {e}, using defaults")
            return self.DEFAULT_CONFIG.copy()
    
    def save_config(self, config: Dict[str, Any]) -> None:
        """Save configuration to file"""
        try:
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            with open(self.config_path, 'w') as f:
                json.dump(config, f, indent=2)
        except Exception as e:
            logging.error(f"Error saving config: {e}")
    
    def _merge_config(self, default: Dict, user: Dict) -> Dict:
        """Recursively merge user config with defaults"""
        result = default.copy()
        for key, value in user.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._merge_config(result[key], value)
            else:
                result[key] = value
        return result

class DepthAIStats:
    """Statistics and monitoring for DepthAI daemon"""
    
    def __init__(self):
        self.start_time = time.time()
        self.frame_count = 0
        self.error_count = 0
        self.last_frame_time = 0
        self.fps_history = []
        self.imu_data_count = 0
        self.temperature_history = []
        self.lock = threading.Lock()
    
    def update_frame_stats(self):
        """Update frame statistics"""
        with self.lock:
            current_time = time.time()
            if self.last_frame_time > 0:
                fps = 1.0 / (current_time - self.last_frame_time)
                self.fps_history.append(fps)
                if len(self.fps_history) > 30:  # Keep last 30 samples
                    self.fps_history.pop(0)
            
            self.frame_count += 1
            self.last_frame_time = current_time
    
    def update_imu_stats(self):
        """Update IMU statistics"""
        with self.lock:
            self.imu_data_count += 1
    
    def increment_error(self):
        """Increment error counter"""
        with self.lock:
            self.error_count += 1
    
    def update_imu_stats(self):
        """Update IMU statistics"""
        with self.lock:
            self.imu_data_count += 1
    
    def add_temperature_reading(self, temp_celsius):
        """Add temperature reading to history"""
        with self.lock:
            self.temperature_history.append(temp_celsius)
            if len(self.temperature_history) > 60:  # Keep last 60 readings
                self.temperature_history.pop(0)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current statistics"""
        with self.lock:
            uptime = time.time() - self.start_time
            avg_fps = sum(self.fps_history) / len(self.fps_history) if self.fps_history else 0
            avg_temp = sum(self.temperature_history) / len(self.temperature_history) if self.temperature_history else None
            
            return {
                "uptime_seconds": uptime,
                "uptime_formatted": str(datetime.fromtimestamp(uptime) - datetime.fromtimestamp(0)),
                "total_frames": self.frame_count,
                "error_count": self.error_count,
                "current_fps": self.fps_history[-1] if self.fps_history else 0,
                "average_fps": avg_fps,
                "imu_data_count": self.imu_data_count,
                "average_temperature_c": avg_temp,
                "current_temperature_c": self.temperature_history[-1] if self.temperature_history else None,
                "last_frame_time": datetime.fromtimestamp(self.last_frame_time).isoformat()
            }

class HealthMonitor:
    """Health monitoring and status reporting"""
    
    def __init__(self, stats: DepthAIStats, config: DepthAIConfig):
        self.stats = stats
        self.config = config
        self.status_file = "/var/run/depthai-daemon/status.json"
        self.lock = threading.Lock()
        self.running = True
        
        # Create status directory
        os.makedirs(os.path.dirname(self.status_file), exist_ok=True)
    
    def start_monitoring(self):
        """Start health monitoring thread"""
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
    
    def stop_monitoring(self):
        """Stop health monitoring"""
        self.running = False
    
    def _monitor_loop(self):
        """Main monitoring loop"""
        while self.running:
            try:
                self._update_status()
                time.sleep(self.config.config["service"]["health_check_interval"])
            except Exception as e:
                logging.error(f"Health monitor error: {e}")
    
    def _update_status(self):
        """Update status file"""
        try:
            stats = self.stats.get_stats()
            status = {
                "timestamp": datetime.now().isoformat(),
                "status": "running",
                "pid": os.getpid(),
                "stats": stats,
                "health": self._check_health(stats)
            }
            
            with open(self.status_file, 'w') as f:
                json.dump(status, f, indent=2)
                
        except Exception as e:
            logging.error(f"Error updating status: {e}")
    
    def _check_health(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        """Check service health"""
        health = {"status": "healthy", "issues": []}
        
        # Check if frames are being processed
        if stats["current_fps"] < 1.0 and stats["total_frames"] > 0:
            health["issues"].append("Low or no frame rate")
        
        # Check error rate
        if stats["total_frames"] > 0:
            error_rate = stats["error_count"] / stats["total_frames"]
            if error_rate > 0.1:  # More than 10% errors
                health["issues"].append(f"High error rate: {error_rate:.2%}")
        
        if health["issues"]:
            health["status"] = "degraded"
        
        return health

class DepthAIDaemon:
    """Main DepthAI daemon service"""
    
    def __init__(self, config_path: str = "/etc/depthai-daemon/config.json"):
        self.config = DepthAIConfig(config_path)
        self.stats = DepthAIStats()
        self.health_monitor = HealthMonitor(self.stats, self.config)
        
        self.device = None
        self.pipeline = None
        self.running = True
        self.device_info = {}
        self.available_features = {
            "imu": False,
            "depth": True,
            "rgb": True,
            "ir": False
        }
        
        # Setup signal handlers
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGHUP, self._reload_config)
        
        # Setup logging
        self._setup_logging()
        
        # Create output directory if needed
        if self.config.config["output"]["save_frames"]:
            os.makedirs(self.config.config["output"]["output_directory"], exist_ok=True)
    
    def _setup_logging(self):
        """Setup logging configuration"""
        log_level = getattr(logging, self.config.config["service"]["log_level"])
        
        # Create logs directory
        os.makedirs("/var/log/depthai-daemon", exist_ok=True)
        
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('/var/log/depthai-daemon/daemon.log'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        
        # Rotate log files
        from logging.handlers import RotatingFileHandler
        file_handler = RotatingFileHandler(
            '/var/log/depthai-daemon/daemon.log',
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5
        )
        file_handler.setFormatter(
            logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        )
        
        logger = logging.getLogger()
        logger.handlers = [file_handler, logging.StreamHandler(sys.stdout)]
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logging.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False
    
    def _detect_device_features(self, device) -> Dict[str, bool]:
        """Detect available features on the connected device"""
        features = {
            "imu": False,
            "depth": True,
            "rgb": True,
            "ir": False,
            "temperature": False
        }
        
        try:
            # Get device info
            self.device_info = {
                "name": device.getDeviceName(),
                "mxid": device.getMxId(),
                "state": str(device.getDeviceState()),
                "usb_speed": str(device.getUsbSpeed()) if hasattr(device, 'getUsbSpeed') else "unknown"
            }
            
            # Try to detect IMU by checking device features
            connected_cameras = device.getConnectedCameraFeatures()
            
            # Check if IMU is available by trying to create an IMU node
            # This is a safer way than checking device model
            try:
                test_pipeline = dai.Pipeline()
                imu_node = test_pipeline.create(dai.node.IMU)
                features["imu"] = True
                logging.info("IMU detected and available")
            except Exception as e:
                logging.info(f"IMU not available: {e}")
                features["imu"] = False
            
            # Check for IR cameras (for Pro models)
            for cam_socket in connected_cameras:
                if "LEFT" in str(cam_socket) or "RIGHT" in str(cam_socket):
                    features["depth"] = True
                if "RGB" in str(cam_socket):
                    features["rgb"] = True
            
            # Temperature sensor is usually available if IMU is available
            features["temperature"] = features["imu"]
            
            logging.info(f"Detected device features: {features}")
            
        except Exception as e:
            logging.warning(f"Error detecting device features: {e}")
        
    def _reload_config(self, signum, frame):
        """Reload configuration on SIGHUP"""
        logging.info("Reloading configuration...")
        self.config = DepthAIConfig(self.config.config_path)
        logging.info("Configuration reloaded")
    
    def _create_pipeline(self) -> dai.Pipeline:
        """Create DepthAI pipeline based on configuration"""
        pipeline = dai.Pipeline()
        
        # RGB Camera
        cam_rgb = pipeline.create(dai.node.ColorCamera)
        cam_rgb.setPreviewSize(*self.config.config["camera"]["preview_size"])
        cam_rgb.setResolution(dai.ColorCameraProperties.SensorResolution.THE_1080_P)
        cam_rgb.setVideoSize(*self.config.config["camera"]["rgb_resolution"])
        cam_rgb.setColorOrder(dai.ColorCameraProperties.ColorOrder.RGB)
        cam_rgb.setFps(self.config.config["camera"]["rgb_fps"])
        
        # RGB Output
        rgb_out = pipeline.create(dai.node.XLinkOut)
        rgb_out.setStreamName("rgb")
        cam_rgb.preview.link(rgb_out.input)
        
        # Depth if enabled
        if self.config.config["camera"]["depth_enabled"]:
            # Mono cameras
            mono_left = pipeline.create(dai.node.MonoCamera)
            mono_right = pipeline.create(dai.node.MonoCamera)
            
            mono_left.setResolution(dai.MonoCameraProperties.SensorResolution.THE_400_P)
            mono_left.setBoardSocket(dai.CameraBoardSocket.LEFT)
            mono_right.setResolution(dai.MonoCameraProperties.SensorResolution.THE_400_P)
            mono_right.setBoardSocket(dai.CameraBoardSocket.RIGHT)
            
            # Depth
            depth = pipeline.create(dai.node.StereoDepth)
            depth.setDefaultProfilePreset(dai.node.StereoDepth.PresetMode.HIGH_ACCURACY)
            depth.initialConfig.setMedianFilter(dai.MedianFilter.KERNEL_7x7)
            depth.setLeftRightCheck(True)
            depth.setSubpixel(False)
            
            mono_left.out.link(depth.left)
            mono_right.out.link(depth.right)
            
            # Depth output
            depth_out = pipeline.create(dai.node.XLinkOut)
            depth_out.setStreamName("depth")
            depth.depth.link(depth_out.input)
        
        # AI Model if enabled
        if self.config.config["ai"]["model_enabled"] and self.config.config["ai"]["model_path"]:
            nn = pipeline.create(dai.node.MobileNetDetectionNetwork)
            nn.setConfidenceThreshold(self.config.config["ai"]["confidence_threshold"])
            nn.setBlobPath(self.config.config["ai"]["model_path"])
            nn.setNumInferenceThreads(2)
            nn.input.setBlocking(False)
            
            cam_rgb.preview.link(nn.input)
            
            # Detection output
            nn_out = pipeline.create(dai.node.XLinkOut)
            nn_out.setStreamName("detections")
            nn.out.link(nn_out.input)
        
        # IMU if enabled and available
        if (self.config.config["camera"]["imu_enabled"] and 
            self.available_features.get("imu", False)):
            try:
                imu = pipeline.create(dai.node.IMU)
                
                # Enable various IMU sensors based on configuration
                imu_sensors = [
                    dai.IMUSensor.ACCELEROMETER_RAW,
                    dai.IMUSensor.GYROSCOPE_RAW,
                    dai.IMUSensor.ROTATION_VECTOR,
                    dai.IMUSensor.LINEAR_ACCELERATION,
                    dai.IMUSensor.GRAVITY
                ]
                
                # Add magnetometer if available (9-axis IMU)
                try:
                    imu_sensors.append(dai.IMUSensor.MAGNETOMETER_RAW)
                except:
                    logging.info("Magnetometer not available (6-axis IMU)")
                
                # Configure IMU frequency
                imu_freq = self.config.config["camera"]["imu_frequency"]
                imu.enableIMUSensor(imu_sensors, imu_freq)
                imu.setBatchReportThreshold(1)
                imu.setMaxBatchReports(10)
                
                # IMU output
                imu_out = pipeline.create(dai.node.XLinkOut)
                imu_out.setStreamName("imu")
                imu.out.link(imu_out.input)
                
                logging.info(f"IMU enabled with {len(imu_sensors)} sensors at {imu_freq}Hz")
                
            except Exception as e:
                logging.warning(f"Failed to add IMU to pipeline: {e}")
        
        return pipeline
    
    def _process_frames(self, queues: Dict[str, dai.DataOutputQueue]):
        """Process incoming frames"""
        frame_count = 0
        
        while self.running:
            try:
                # Get RGB frame
                if "rgb" in queues:
                    rgb_frame = queues["rgb"].tryGet()
                    if rgb_frame is not None:
                        frame = rgb_frame.getCvFrame()
                        self._handle_rgb_frame(frame, frame_count)
                
                # Get depth frame
                if "depth" in queues:
                    depth_frame = queues["depth"].tryGet()
                    if depth_frame is not None:
                        depth_map = depth_frame.getFrame()
                        self._handle_depth_frame(depth_map, frame_count)
                
                # Get detections
                if "detections" in queues:
                    detections = queues["detections"].tryGet()
                    if detections is not None:
                        self._handle_detections(detections.detections)
                
                # Get IMU data
                if "imu" in queues:
                    imu_data = queues["imu"].tryGet()
                    if imu_data is not None:
                        self._handle_imu_data(imu_data.packets)
                
                self.stats.update_frame_stats()
                frame_count += 1
                
                # Small delay to prevent CPU spinning
                time.sleep(0.001)
                
            except Exception as e:
                logging.error(f"Error processing frames: {e}")
                self.stats.increment_error()
    
    def _handle_rgb_frame(self, frame: np.ndarray, frame_count: int):
        """Handle RGB frame processing"""
        if self.config.config["output"]["save_frames"]:
            self._save_frame(frame, "rgb", frame_count)
    
    def _handle_depth_frame(self, depth_map: np.ndarray, frame_count: int):
        """Handle depth frame processing"""
        if self.config.config["output"]["save_frames"]:
            # Normalize depth for saving
            depth_normalized = cv2.normalize(depth_map, None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
            depth_colored = cv2.applyColorMap(depth_normalized, cv2.COLORMAP_JET)
            self._save_frame(depth_colored, "depth", frame_count)
    
    def _handle_detections(self, detections):
        """Handle AI detection results"""
        for detection in detections:
            logging.debug(f"Detection: {detection.label} ({detection.confidence:.2f})")
    
    def _handle_imu_data(self, imu_packets):
        """Handle IMU data packets"""
        for packet in imu_packets:
            self.stats.update_imu_stats()
            
            # Log IMU data based on sensor type
            sensor_type = packet.acceleroMeter if hasattr(packet, 'acceleroMeter') else None
            if sensor_type:
                acc_data = sensor_type
                logging.debug(f"Accelerometer: x={acc_data.x:.3f}, y={acc_data.y:.3f}, z={acc_data.z:.3f}")
            
            gyro_data = packet.gyroscope if hasattr(packet, 'gyroscope') else None
            if gyro_data:
                logging.debug(f"Gyroscope: x={gyro_data.x:.3f}, y={gyro_data.y:.3f}, z={gyro_data.z:.3f}")
            
            # Save IMU data if configured
            if self.config.config["output"]["save_frames"]:
                self._save_imu_data(packet)
    
    def _save_frame(self, frame: np.ndarray, frame_type: str, frame_count: int):
        """Save frame to disk"""
        try:
            output_dir = self.config.config["output"]["output_directory"]
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{frame_type}_{timestamp}_{frame_count:06d}.jpg"
            filepath = os.path.join(output_dir, filename)
            
            cv2.imwrite(filepath, frame)
            
            # Clean up old files if necessary
            self._cleanup_old_files(output_dir)
            
        except Exception as e:
            logging.error(f"Error saving frame: {e}")
    
    def _cleanup_old_files(self, directory: str):
        """Remove old files if we exceed max_files limit"""
        try:
            max_files = self.config.config["output"]["max_files"]
            files = sorted(Path(directory).glob("*.jpg"), key=os.path.getctime)
            
            if len(files) > max_files:
                files_to_remove = files[:-max_files]
                for file in files_to_remove:
                    file.unlink()
                    
    def _save_imu_data(self, imu_packet):
        """Save IMU data to file"""
        try:
            output_dir = self.config.config["output"]["output_directory"]
            imu_dir = os.path.join(output_dir, "imu")
            os.makedirs(imu_dir, exist_ok=True)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"imu_{timestamp}.json"
            filepath = os.path.join(imu_dir, filename)
            
            # Extract IMU data into a dictionary
            imu_data = {
                "timestamp": timestamp,
                "sequence_num": imu_packet.sequenceNum if hasattr(imu_packet, 'sequenceNum') else 0
            }
            
            # Add sensor data if available
            if hasattr(imu_packet, 'acceleroMeter'):
                acc = imu_packet.acceleroMeter
                imu_data["accelerometer"] = {"x": acc.x, "y": acc.y, "z": acc.z}
            
            if hasattr(imu_packet, 'gyroscope'):
                gyro = imu_packet.gyroscope
                imu_data["gyroscope"] = {"x": gyro.x, "y": gyro.y, "z": gyro.z}
            
            if hasattr(imu_packet, 'magneticField'):
                mag = imu_packet.magneticField
                imu_data["magnetometer"] = {"x": mag.x, "y": mag.y, "z": mag.z}
            
            if hasattr(imu_packet, 'rotationVector'):
                rot = imu_packet.rotationVector
                imu_data["rotation"] = {"i": rot.i, "j": rot.j, "k": rot.k, "real": rot.real}
            
            with open(filepath, 'w') as f:
                json.dump(imu_data, f, indent=2)
                
        except Exception as e:
    def _cleanup_old_files(self, directory: str):
        """Remove old files if we exceed max_files limit"""
        try:
            max_files = self.config.config["output"]["max_files"]
            files = sorted(Path(directory).glob("*.jpg"), key=os.path.getctime)
            
            if len(files) > max_files:
                files_to_remove = files[:-max_files]
                for file in files_to_remove:
                    file.unlink()
                    
        except Exception as e:
            logging.error(f"Error cleaning up files: {e}")
    
    def run(self):
        """Main daemon loop"""
        logging.info("DepthAI Daemon starting...")
        
        # Start health monitoring
        self.health_monitor.start_monitoring()
        
        reconnect_attempts = 0
        max_attempts = self.config.config["service"]["max_reconnect_attempts"]
        reconnect_delay = self.config.config["service"]["reconnect_delay"]
        
        while self.running and reconnect_attempts < max_attempts:
            try:
                logging.info("Creating pipeline...")
                self.pipeline = self._create_pipeline()
                
                logging.info("Connecting to device...")
                with dai.Device(self.pipeline) as device:
                    self.device = device
                    logging.info(f"Connected to device: {device.getDeviceName()}")
                    
                    # Detect available features
                    self.available_features = self._detect_device_features(device)
                    logging.info(f"Device info: {self.device_info}")
                    
                    # Get temperature if available
                    if self.available_features.get("temperature", False):
                        try:
                            temp_celsius = device.getChipTemperature().average
                            self.stats.add_temperature_reading(temp_celsius)
                            logging.info(f"Device temperature: {temp_celsius:.1f}°C")
                        except Exception as e:
                            logging.debug(f"Could not read temperature: {e}")
                    
                    # Get output queues
                    queues = {}
                    queues["rgb"] = device.getOutputQueue("rgb", maxSize=4, blocking=False)
                    
                    if self.config.config["camera"]["depth_enabled"]:
                        queues["depth"] = device.getOutputQueue("depth", maxSize=4, blocking=False)
                    
                    if self.config.config["ai"]["model_enabled"]:
                        queues["detections"] = device.getOutputQueue("detections", maxSize=4, blocking=False)
                    
                    if (self.config.config["camera"]["imu_enabled"] and 
                        self.available_features.get("imu", False)):
                        queues["imu"] = device.getOutputQueue("imu", maxSize=50, blocking=False)
                    
                    logging.info("Starting frame processing...")
                    reconnect_attempts = 0  # Reset on successful connection
                    
                    # Main processing loop
                    self._process_frames(queues)
                    
            except Exception as e:
                reconnect_attempts += 1
                logging.error(f"Device error (attempt {reconnect_attempts}/{max_attempts}): {e}")
                self.stats.increment_error()
                
                if reconnect_attempts < max_attempts and self.running:
                    logging.info(f"Retrying in {reconnect_delay} seconds...")
                    time.sleep(reconnect_delay)
                else:
                    logging.error("Max reconnection attempts reached or shutdown requested")
                    break
        
        self.health_monitor.stop_monitoring()
        logging.info("DepthAI Daemon stopped")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="DepthAI Daemon Service")
    parser.add_argument("--config", "-c", default="/etc/depthai-daemon/config.json",
                       help="Configuration file path")
    parser.add_argument("--generate-config", action="store_true",
                       help="Generate default configuration file and exit")
    
    args = parser.parse_args()
    
    if args.generate_config:
        config = DepthAIConfig(args.config)
        config.save_config(config.DEFAULT_CONFIG)
        print(f"Generated default configuration at: {args.config}")
        return
    
    # Create and run daemon
    daemon = DepthAIDaemon(args.config)
    
    try:
        daemon.run()
    except KeyboardInterrupt:
        logging.info("Received keyboard interrupt, shutting down...")
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
