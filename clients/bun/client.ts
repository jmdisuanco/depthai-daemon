/**
 * DepthAI Daemon Client Library
 * 
 * A reusable TypeScript/JavaScript client for interacting with the DepthAI daemon service.
 * This library provides a clean API for status monitoring, configuration management,
 * frame retrieval, IMU data analysis, and more.
 */

import { readFile, writeFile, exists, stat } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'bun';

export interface DepthAIStats {
  uptime_seconds: number;
  uptime_formatted: string;
  total_frames: number;
  error_count: number;
  current_fps: number;
  average_fps: number;
  imu_data_count: number;
  average_temperature_c?: number;
  current_temperature_c?: number;
  last_frame_time: string;
}

export interface DepthAIStatus {
  timestamp: string;
  status: string;
  pid: number;
  stats: DepthAIStats;
  health: {
    status: string;
    issues: string[];
  };
}

export interface DepthAIConfig {
  camera: {
    rgb_resolution: [number, number];
    rgb_fps: number;
    depth_enabled: boolean;
    imu_enabled: boolean;
    imu_frequency: number;
  };
  ai: {
    model_enabled: boolean;
    model_path: string;
    confidence_threshold: number;
  };
  output: {
    save_frames: boolean;
    output_directory: string;
    max_files: number;
  };
  service: {
    health_check_interval: number;
    log_level: string;
  };
}

export interface IMUData {
  timestamp: string;
  sequence_num: number;
  accelerometer?: { x: number; y: number; z: number };
  gyroscope?: { x: number; y: number; z: number };
  magnetometer?: { x: number; y: number; z: number };
  rotation?: { i: number; j: number; k: number; real: number };
}

export interface IMUAnalysis {
  sample_count: number;
  accelerometer: {
    x: number[];
    y: number[];
    z: number[];
    x_mean: number;
    y_mean: number;
    z_mean: number;
    x_std: number;
    y_std: number;
    z_std: number;
  };
  gyroscope: {
    x: number[];
    y: number[];
    z: number[];
    x_mean: number;
    y_mean: number;
    z_mean: number;
    x_std: number;
    y_std: number;
    z_std: number;
  };
  magnetometer?: {
    x: number[];
    y: number[];
    z: number[];
    x_mean: number;
    y_mean: number;
    z_mean: number;
    x_std: number;
    y_std: number;
    z_std: number;
  };
  timestamps: string[];
}

export interface ExportData {
  timestamp: string;
  status: DepthAIStatus | null;
  config: DepthAIConfig | null;
  recent_imu_data: IMUData[];
  imu_analysis: IMUAnalysis | null;
  recent_logs: string[];
  latest_frames: {
    rgb: string[];
    depth: string[];
  };
}

export class DepthAIClient {
  private statusPath: string;
  private configPath: string;
  private outputDir: string;
  private logPath: string;

  constructor(options?: {
    statusPath?: string;
    configPath?: string;
    outputDir?: string;
    logPath?: string;
  }) {
    this.statusPath = options?.statusPath || '/var/run/depthai-daemon/status.json';
    this.configPath = options?.configPath || '/etc/depthai-daemon/config.json';
    this.outputDir = options?.outputDir || '/tmp/depthai-frames';
    this.logPath = options?.logPath || '/var/log/depthai-daemon/daemon.log';
  }

  /**
   * Get current daemon status
   */
  async getStatus(): Promise<DepthAIStatus | null> {
    try {
      if (!(await exists(this.statusPath))) {
        console.warn('Status file not found. Is the daemon running?');
        return null;
      }

      const statusData = await readFile(this.statusPath, 'utf-8');
      return JSON.parse(statusData) as DepthAIStatus;
    } catch (error) {
      console.error('Error reading status:', error);
      return null;
    }
  }

  /**
   * Get current daemon configuration
   */
  async getConfig(): Promise<DepthAIConfig | null> {
    try {
      if (!(await exists(this.configPath))) {
        console.warn('Config file not found.');
        return null;
      }

      const configData = await readFile(this.configPath, 'utf-8');
      return JSON.parse(configData) as DepthAIConfig;
    } catch (error) {
      console.error('Error reading config:', error);
      return null;
    }
  }

  /**
   * Update daemon configuration
   */
  async updateConfig(config: Partial<DepthAIConfig>): Promise<boolean> {
    try {
      const currentConfig = await this.getConfig();
      if (!currentConfig) {
        console.error('Cannot read current config');
        return false;
      }

      // Deep merge configuration
      const newConfig = this.mergeConfig(currentConfig, config);
      
      await writeFile(this.configPath, JSON.stringify(newConfig, null, 2));
      console.log('Configuration updated. Reload daemon with: sudo systemctl kill -s HUP depthai-daemon');
      return true;
    } catch (error) {
      console.error('Error updating config:', error);
      return false;
    }
  }

  /**
   * Get latest frames from output directory
   */
  async getLatestFrames(count: number = 5, frameType: string = 'rgb'): Promise<string[]> {
    try {
      if (!(await exists(this.outputDir))) {
        console.warn('Output directory not found. Frame saving may be disabled.');
        return [];
      }

      const pattern = `${frameType}_*.jpg`;
      const files = await Array.fromAsync(
        new Bun.Glob(pattern).scan({ cwd: this.outputDir })
      );

      // Sort by modification time (newest first)
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const fullPath = join(this.outputDir, file);
          const fileStat = await stat(fullPath);
          return { file: fullPath, mtime: fileStat.mtime };
        })
      );

      return fileStats
        .sort((a, b) => (b.mtime?.getTime() || 0) - (a.mtime?.getTime() || 0))
        .slice(0, count)
        .map((item) => item.file);
    } catch (error) {
      console.error('Error getting latest frames:', error);
      return [];
    }
  }

  /**
   * Get latest IMU data
   */
  async getLatestIMUData(count: number = 10): Promise<IMUData[]> {
    try {
      const imuDir = join(this.outputDir, 'imu');
      
      if (!(await exists(imuDir))) {
        console.warn('IMU directory not found. IMU may be disabled or not available.');
        return [];
      }

      const files = await Array.fromAsync(
        new Bun.Glob('imu_*.json').scan({ cwd: imuDir })
      );

      // Get latest files
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const fullPath = join(imuDir, file);
          const fileStat = await stat(fullPath);
          return { file: fullPath, mtime: fileStat.mtime };
        })
      );

      const latestFiles = fileStats
        .sort((a, b) => (b.mtime?.getTime() || 0) - (a.mtime?.getTime() || 0))
        .slice(0, count);

      // Read and parse IMU data
      const imuData: IMUData[] = [];
      for (const fileInfo of latestFiles) {
        try {
          const data = await readFile(fileInfo.file, 'utf-8');
          imuData.push(JSON.parse(data) as IMUData);
        } catch (error) {
          console.warn(`Error reading IMU file ${fileInfo.file}:`, error);
        }
      }

      return imuData;
    } catch (error) {
      console.error('Error getting IMU data:', error);
      return [];
    }
  }

  /**
   * Analyze IMU data for statistics
   */
  async analyzeIMUData(samples: number = 100): Promise<IMUAnalysis | null> {
    const imuData = await this.getLatestIMUData(samples);
    if (!imuData.length) {
      return null;
    }

    const analysis: IMUAnalysis = {
      sample_count: imuData.length,
      accelerometer: { x: [], y: [], z: [], x_mean: 0, y_mean: 0, z_mean: 0, x_std: 0, y_std: 0, z_std: 0 },
      gyroscope: { x: [], y: [], z: [], x_mean: 0, y_mean: 0, z_mean: 0, x_std: 0, y_std: 0, z_std: 0 },
      timestamps: []
    };

    // Extract data
    for (const data of imuData) {
      analysis.timestamps.push(data.timestamp);
      
      if (data.accelerometer) {
        analysis.accelerometer.x.push(data.accelerometer.x);
        analysis.accelerometer.y.push(data.accelerometer.y);
        analysis.accelerometer.z.push(data.accelerometer.z);
      }
      
      if (data.gyroscope) {
        analysis.gyroscope.x.push(data.gyroscope.x);
        analysis.gyroscope.y.push(data.gyroscope.y);
        analysis.gyroscope.z.push(data.gyroscope.z);
      }
      
      if (data.magnetometer) {
        if (!analysis.magnetometer) {
          analysis.magnetometer = { x: [], y: [], z: [], x_mean: 0, y_mean: 0, z_mean: 0, x_std: 0, y_std: 0, z_std: 0 };
        }
        analysis.magnetometer.x.push(data.magnetometer.x);
        analysis.magnetometer.y.push(data.magnetometer.y);
        analysis.magnetometer.z.push(data.magnetometer.z);
      }
    }

    // Calculate statistics
    const calcStats = (values: number[]) => {
      if (!values.length) return { mean: 0, std: 0 };
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
      return { mean, std: Math.sqrt(variance) };
    };

    // Accelerometer stats
    const accXStats = calcStats(analysis.accelerometer.x);
    const accYStats = calcStats(analysis.accelerometer.y);
    const accZStats = calcStats(analysis.accelerometer.z);
    analysis.accelerometer.x_mean = accXStats.mean;
    analysis.accelerometer.y_mean = accYStats.mean;
    analysis.accelerometer.z_mean = accZStats.mean;
    analysis.accelerometer.x_std = accXStats.std;
    analysis.accelerometer.y_std = accYStats.std;
    analysis.accelerometer.z_std = accZStats.std;

    // Gyroscope stats
    const gyroXStats = calcStats(analysis.gyroscope.x);
    const gyroYStats = calcStats(analysis.gyroscope.y);
    const gyroZStats = calcStats(analysis.gyroscope.z);
    analysis.gyroscope.x_mean = gyroXStats.mean;
    analysis.gyroscope.y_mean = gyroYStats.mean;
    analysis.gyroscope.z_mean = gyroZStats.mean;
    analysis.gyroscope.x_std = gyroXStats.std;
    analysis.gyroscope.y_std = gyroYStats.std;
    analysis.gyroscope.z_std = gyroZStats.std;

    // Magnetometer stats (if available)
    if (analysis.magnetometer) {
      const magXStats = calcStats(analysis.magnetometer.x);
      const magYStats = calcStats(analysis.magnetometer.y);
      const magZStats = calcStats(analysis.magnetometer.z);
      analysis.magnetometer.x_mean = magXStats.mean;
      analysis.magnetometer.y_mean = magYStats.mean;
      analysis.magnetometer.z_mean = magZStats.mean;
      analysis.magnetometer.x_std = magXStats.std;
      analysis.magnetometer.y_std = magYStats.std;
      analysis.magnetometer.z_std = magZStats.std;
    }

    return analysis;
  }

  /**
   * Stream frames by watching for new files
   */
  async *streamFrames(frameType: string = 'rgb', intervalMs: number = 100): AsyncGenerator<{
    framePath: string;
    fileName: string;
    timestamp: Date;
    size: number;
  } | null> {
    let lastFrame = '';
    
    while (true) {
      try {
        const frames = await this.getLatestFrames(1, frameType);
        if (frames.length > 0 && frames[0] !== lastFrame) {
          lastFrame = frames[0];
          const fileName = frames[0].split('/').pop() || '';
          const fileStat = await stat(frames[0]);
          
          yield {
            framePath: frames[0],
            fileName,
            timestamp: new Date(),
            size: fileStat.size || 0
          };
        } else {
          yield null;
        }
      } catch (error) {
        console.error('Error in frame stream:', error);
        yield null;
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Monitor daemon status in real-time
   */
  async *monitorStatus(intervalMs: number = 1000): AsyncGenerator<DepthAIStatus | null> {
    while (true) {
      const status = await this.getStatus();
      yield status;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Get recent log entries
   */
  async getLogs(lines: number = 50): Promise<string[]> {
    try {
      if (!(await exists(this.logPath))) {
        console.warn('Log file not found.');
        return [];
      }

      // Use tail command to get last N lines
      const proc = spawn(['tail', '-n', lines.toString(), this.logPath]);
      const output = await new Response(proc.stdout).text();
      return output.trim().split('\n').filter(line => line.length > 0);
    } catch (error) {
      console.error('Error reading logs:', error);
      return [];
    }
  }

  /**
   * Check if daemon is healthy
   */
  async isHealthy(): Promise<boolean> {
    const status = await this.getStatus();
    return status?.health?.status === 'healthy' && status?.status === 'running';
  }

  /**
   * Export comprehensive data
   */
  async exportData(): Promise<ExportData> {
    const status = await this.getStatus();
    const config = await this.getConfig();
    const imuData = await this.getLatestIMUData(100);
    const imuAnalysis = await this.analyzeIMUData(100);
    const logs = await this.getLogs(100);
    const rgbFrames = await this.getLatestFrames(10, 'rgb');
    const depthFrames = await this.getLatestFrames(10, 'depth');

    return {
      timestamp: new Date().toISOString(),
      status,
      config,
      recent_imu_data: imuData,
      imu_analysis: imuAnalysis,
      recent_logs: logs,
      latest_frames: {
        rgb: rgbFrames,
        depth: depthFrames
      }
    };
  }

  /**
   * Save export data to file
   */
  async saveExportData(outputPath: string): Promise<boolean> {
    try {
      const exportData = await this.exportData();
      await writeFile(outputPath, JSON.stringify(exportData, null, 2));
      return true;
    } catch (error) {
      console.error('Error exporting data:', error);
      return false;
    }
  }

  /**
   * Display frame information using native tools
   */
  async displayFrame(framePath: string): Promise<{
    path: string;
    size: number;
    modified: Date | null;
    info?: string;
  } | null> {
    try {
      if (!(await exists(framePath))) {
        console.error(`Frame not found: ${framePath}`);
        return null;
      }

      const fileStat = await stat(framePath);
      let info: string | undefined;

      // Try to get image dimensions using file command
      try {
        const proc = spawn(['file', framePath]);
        const output = await new Response(proc.stdout).text();
        info = output.trim();
      } catch (e) {
        // Ignore file command errors
      }

      // Try to open with system default viewer
      try {
        const proc = spawn(['xdg-open', framePath], { stdio: 'ignore' });
        proc.unref();
      } catch (e) {
        // Ignore open errors
      }

      return {
        path: framePath,
        size: fileStat.size || 0,
        modified: fileStat.mtime || null,
        info
      };
    } catch (error) {
      console.error('Error displaying frame:', error);
      return null;
    }
  }

  /**
   * Deep merge configuration objects
   */
  private mergeConfig(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeConfig(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Format uptime for display
   */
  static formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Format bytes for display
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(timestamp: string | Date): string {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    return date.toLocaleString();
  }
}

// Utility functions
export const DepthAIUtils = {
  formatUptime: DepthAIClient.formatUptime,
  formatBytes: DepthAIClient.formatBytes,
  formatTimestamp: DepthAIClient.formatTimestamp,
  
  /**
   * Validate IMU data
   */
  validateIMUData(data: any): data is IMUData {
    return data && 
           typeof data.timestamp === 'string' &&
           typeof data.sequence_num === 'number';
  },

  /**
   * Validate status data
   */
  validateStatus(data: any): data is DepthAIStatus {
    return data &&
           typeof data.timestamp === 'string' &&
           typeof data.status === 'string' &&
           typeof data.pid === 'number' &&
           data.stats &&
           data.health;
  },

  /**
   * Calculate IMU magnitude
   */
  calculateMagnitude(x: number, y: number, z: number): number {
    return Math.sqrt(x * x + y * y + z * z);
  },

  /**
   * Check if value is within normal range for accelerometer (±20 m/s²)
   */
  isAccelerometerNormal(value: number): boolean {
    return Math.abs(value) <= 20;
  },

  /**
   * Check if value is within normal range for gyroscope (±10 rad/s)
   */
  isGyroscopeNormal(value: number): boolean {
    return Math.abs(value) <= 10;
  }
};

export default DepthAIClient;
