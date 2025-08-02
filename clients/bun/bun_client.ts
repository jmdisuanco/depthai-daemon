#!/usr/bin/env bun
/**
 * DepthAI Daemon Client for Bun.js
 * 
 * A comprehensive client for interacting with the DepthAI daemon service.
 * Supports status monitoring, frame retrieval, IMU data analysis, live plotting,
 * frame streaming, and advanced data visualization.
 */

import { readFile, writeFile, mkdir, exists, stat } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'bun';

interface DepthAIStats {
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

interface DepthAIStatus {
  timestamp: string;
  status: string;
  pid: number;
  stats: DepthAIStats;
  health: {
    status: string;
    issues: string[];
  };
}

interface DepthAIConfig {
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

interface IMUData {
  timestamp: string;
  sequence_num: number;
  accelerometer?: { x: number; y: number; z: number };
  gyroscope?: { x: number; y: number; z: number };
  magnetometer?: { x: number; y: number; z: number };
  rotation?: { i: number; j: number; k: number; real: number };
}

interface IMUAnalysis {
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

class DepthAIClient {
  private statusPath: string;
  private configPath: string;
  private outputDir: string;
  private logPath: string;

  constructor() {
    this.statusPath = '/var/run/depthai-daemon/status.json';
    this.configPath = '/etc/depthai-daemon/config.json';
    this.outputDir = '/tmp/depthai-frames';
    this.logPath = '/var/log/depthai-daemon/daemon.log';
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
   * Generate HTML plot for IMU data
   */
  async plotIMUData(samples: number = 100, outputPath?: string): Promise<boolean> {
    const analysis = await this.analyzeIMUData(samples);
    if (!analysis) {
      console.log('No IMU data available for plotting');
      return false;
    }

    const timestamps = analysis.timestamps.map((_, i) => i);
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>DepthAI IMU Data Analysis</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .plot-container { margin: 20px 0; height: 400px; }
        .stats { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .sensor-stats { display: inline-block; margin: 10px; }
    </style>
</head>
<body>
    <h1>🧭 DepthAI IMU Data Analysis</h1>
    <p>Sample count: ${analysis.sample_count} | Generated: ${new Date().toLocaleString()}</p>

    <div class="stats">
        <h3>📊 Statistics Summary</h3>
        <div class="sensor-stats">
            <h4>Accelerometer (m/s²)</h4>
            <p>X: μ=${analysis.accelerometer.x_mean.toFixed(3)}, σ=${analysis.accelerometer.x_std.toFixed(3)}</p>
            <p>Y: μ=${analysis.accelerometer.y_mean.toFixed(3)}, σ=${analysis.accelerometer.y_std.toFixed(3)}</p>
            <p>Z: μ=${analysis.accelerometer.z_mean.toFixed(3)}, σ=${analysis.accelerometer.z_std.toFixed(3)}</p>
        </div>
        <div class="sensor-stats">
            <h4>Gyroscope (rad/s)</h4>
            <p>X: μ=${analysis.gyroscope.x_mean.toFixed(3)}, σ=${analysis.gyroscope.x_std.toFixed(3)}</p>
            <p>Y: μ=${analysis.gyroscope.y_mean.toFixed(3)}, σ=${analysis.gyroscope.y_std.toFixed(3)}</p>
            <p>Z: μ=${analysis.gyroscope.z_mean.toFixed(3)}, σ=${analysis.gyroscope.z_std.toFixed(3)}</p>
        </div>
        ${analysis.magnetometer ? `
        <div class="sensor-stats">
            <h4>Magnetometer (µT)</h4>
            <p>X: μ=${analysis.magnetometer.x_mean.toFixed(3)}, σ=${analysis.magnetometer.x_std.toFixed(3)}</p>
            <p>Y: μ=${analysis.magnetometer.y_mean.toFixed(3)}, σ=${analysis.magnetometer.y_std.toFixed(3)}</p>
            <p>Z: μ=${analysis.magnetometer.z_mean.toFixed(3)}, σ=${analysis.magnetometer.z_std.toFixed(3)}</p>
        </div>
        ` : ''}
    </div>

    <div id="accelerometer" class="plot-container"></div>
    <div id="gyroscope" class="plot-container"></div>
    ${analysis.magnetometer ? '<div id="magnetometer" class="plot-container"></div>' : ''}

    <script>
        // Accelerometer plot
        Plotly.newPlot('accelerometer', [
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.accelerometer.x)}, name: 'X', type: 'scatter', line: {color: '#ff6b6b'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.accelerometer.y)}, name: 'Y', type: 'scatter', line: {color: '#4ecdc4'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.accelerometer.z)}, name: 'Z', type: 'scatter', line: {color: '#45b7d1'}}
        ], {
            title: 'Accelerometer Data (m/s²)',
            xaxis: {title: 'Sample Number'},
            yaxis: {title: 'Acceleration (m/s²)'}
        });

        // Gyroscope plot
        Plotly.newPlot('gyroscope', [
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.gyroscope.x)}, name: 'X', type: 'scatter', line: {color: '#ff6b6b'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.gyroscope.y)}, name: 'Y', type: 'scatter', line: {color: '#4ecdc4'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.gyroscope.z)}, name: 'Z', type: 'scatter', line: {color: '#45b7d1'}}
        ], {
            title: 'Gyroscope Data (rad/s)',
            xaxis: {title: 'Sample Number'},
            yaxis: {title: 'Angular Velocity (rad/s)'}
        });

        ${analysis.magnetometer ? `
        // Magnetometer plot
        Plotly.newPlot('magnetometer', [
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.magnetometer.x)}, name: 'X', type: 'scatter', line: {color: '#ff6b6b'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.magnetometer.y)}, name: 'Y', type: 'scatter', line: {color: '#4ecdc4'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.magnetometer.z)}, name: 'Z', type: 'scatter', line: {color: '#45b7d1'}}
        ], {
            title: 'Magnetometer Data (µT)',
            xaxis: {title: 'Sample Number'},
            yaxis: {title: 'Magnetic Field (µT)'}
        });
        ` : ''}
    </script>
</body>
</html>`;

    const plotPath = outputPath || `imu-plot-${Date.now()}.html`;
    await writeFile(plotPath, html);
    console.log(`📊 IMU plot saved to: ${plotPath}`);
    console.log(`🌐 Open in browser: file://${process.cwd()}/${plotPath}`);
    
    // Try to open in browser
    try {
      const proc = spawn(['xdg-open', plotPath], { stdio: 'ignore' });
      proc.unref();
    } catch {
      console.log('💡 Tip: Copy the file path to your browser to view the interactive plot');
    }

    return true;
  }

  /**
   * Stream frames by watching for new files
   */
  async streamFrames(frameType: string = 'rgb', intervalMs: number = 100): Promise<void> {
    console.log(`🎬 Streaming ${frameType} frames. Press Ctrl+C to stop.`);
    
    let lastFrame = '';
    
    const checkForNewFrames = async () => {
      const frames = await this.getLatestFrames(1, frameType);
      if (frames.length > 0 && frames[0] !== lastFrame) {
        lastFrame = frames[0];
        const fileName = frames[0].split('/').pop();
        const timestamp = new Date().toLocaleTimeString();
        console.log(`📸 [${timestamp}] New ${frameType} frame: ${fileName}`);
        
        // Optional: display frame info
        try {
          const fileStat = await stat(frames[0]);
          console.log(`   📁 Size: ${(fileStat.size / 1024).toFixed(1)} KB`);
        } catch (e) {
          // Ignore stat errors
        }
      }
    };

    const interval = setInterval(checkForNewFrames, intervalMs);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n📴 Frame streaming stopped');
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {});
  }

  /**
   * Create live monitoring dashboard
   */
  async createLiveMonitorHTML(outputPath?: string): Promise<string> {
    const dashboardPath = outputPath || `depthai-dashboard-${Date.now()}.html`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>DepthAI Live Monitor</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .status-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .plot-container { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; height: 400px; }
        .metric { font-size: 24px; font-weight: bold; color: #333; }
        .label { color: #666; font-size: 14px; }
        .healthy { color: #4CAF50; }
        .warning { color: #FF9800; }
        .error { color: #F44336; }
        .refresh-btn { background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 DepthAI Live Monitor</h1>
        <button class="refresh-btn" onclick="loadData()">🔄 Refresh</button>
        <span id="lastUpdate" style="margin-left: 20px; color: #666;"></span>
    </div>

    <div class="status-grid">
        <div class="status-card">
            <div class="label">Service Status</div>
            <div class="metric" id="serviceStatus">Loading...</div>
        </div>
        <div class="status-card">
            <div class="label">Current FPS</div>
            <div class="metric" id="currentFPS">-</div>
        </div>
        <div class="status-card">
            <div class="label">Total Frames</div>
            <div class="metric" id="totalFrames">-</div>
        </div>
        <div class="status-card">
            <div class="label">Uptime</div>
            <div class="metric" id="uptime">-</div>
        </div>
        <div class="status-card">
            <div class="label">Temperature</div>
            <div class="metric" id="temperature">-</div>
        </div>
        <div class="status-card">
            <div class="label">Health</div>
            <div class="metric" id="health">-</div>
        </div>
    </div>

    <div class="plot-container">
        <div id="fpsPlot"></div>
    </div>

    <div class="plot-container">
        <div id="tempPlot"></div>
    </div>

    <script>
        let fpsData = [];
        let tempData = [];
        let timestamps = [];

        async function loadData() {
            try {
                // In a real implementation, this would fetch from the daemon status
                // For demo, we'll simulate data
                const now = new Date();
                const status = {
                    status: 'running',
                    stats: {
                        current_fps: 30 + Math.random() * 2 - 1,
                        total_frames: Math.floor(Math.random() * 1000000),
                        uptime_formatted: '2h 15m',
                        current_temperature_c: 45 + Math.random() * 10 - 5
                    },
                    health: { status: 'healthy' }
                };

                // Update status cards
                document.getElementById('serviceStatus').textContent = '✅ Running';
                document.getElementById('serviceStatus').className = 'metric healthy';
                document.getElementById('currentFPS').textContent = status.stats.current_fps.toFixed(1);
                document.getElementById('totalFrames').textContent = status.stats.total_frames.toLocaleString();
                document.getElementById('uptime').textContent = status.stats.uptime_formatted;
                document.getElementById('temperature').textContent = status.stats.current_temperature_c.toFixed(1) + '°C';
                document.getElementById('health').textContent = '✅ Healthy';
                document.getElementById('health').className = 'metric healthy';
                document.getElementById('lastUpdate').textContent = 'Last updated: ' + now.toLocaleTimeString();

                // Update plots
                timestamps.push(now);
                fpsData.push(status.stats.current_fps);
                tempData.push(status.stats.current_temperature_c);

                // Keep only last 50 points
                if (timestamps.length > 50) {
                    timestamps.shift();
                    fpsData.shift();
                    tempData.shift();
                }

                // Update FPS plot
                Plotly.newPlot('fpsPlot', [{
                    x: timestamps,
                    y: fpsData,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'FPS',
                    line: { color: '#2196F3' }
                }], {
                    title: 'Frame Rate Over Time',
                    xaxis: { title: 'Time' },
                    yaxis: { title: 'FPS' }
                });

                // Update temperature plot
                Plotly.newPlot('tempPlot', [{
                    x: timestamps,
                    y: tempData,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Temperature',
                    line: { color: '#FF5722' }
                }], {
                    title: 'Device Temperature Over Time',
                    xaxis: { title: 'Time' },
                    yaxis: { title: 'Temperature (°C)' }
                });

            } catch (error) {
                console.error('Error loading data:', error);
                document.getElementById('serviceStatus').textContent = '❌ Error';
                document.getElementById('serviceStatus').className = 'metric error';
            }
        }

        // Load data initially and set up auto-refresh
        loadData();
        setInterval(loadData, 2000);
    </script>
</body>
</html>`;

    await writeFile(dashboardPath, html);
    console.log(`📊 Dashboard created: ${dashboardPath}`);
    console.log(`🌐 Open in browser: file://${process.cwd()}/${dashboardPath}`);
    
    // Try to open in browser
    try {
      const proc = spawn(['xdg-open', dashboardPath], { stdio: 'ignore' });
      proc.unref();
    } catch {
      console.log('💡 Tip: Copy the file path to your browser to view the dashboard');
    }

    return dashboardPath;
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
   * Export data to JSON file
   */
  async exportData(outputPath: string): Promise<boolean> {
    try {
      const status = await this.getStatus();
      const config = await this.getConfig();
      const imuData = await this.getLatestIMUData(100);
      const imuAnalysis = await this.analyzeIMUData(100);
      const logs = await this.getLogs(100);
      const rgbFrames = await this.getLatestFrames(10, 'rgb');
      const depthFrames = await this.getLatestFrames(10, 'depth');

      const exportData = {
        timestamp: new Date().toISOString(),
        status,
        config,
        recent_imu_data: imuData,
        imu_analysis: imuAnalysis,
        recent_logs: logs,
        latest_frames: {
          rgb: rgbFrames,
          depth: dep#!/usr/bin/env bun
/**
 * DepthAI Daemon Client for Bun.js
 * 
 * A comprehensive client for interacting with the DepthAI daemon service.
 * Supports status monitoring, frame retrieval, IMU data, and configuration management.
 */

import { readFile, writeFile, mkdir, exists } from 'fs/promises';
import { join } from 'path';

interface DepthAIStats {
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

interface DepthAIStatus {
  timestamp: string;
  status: string;
  pid: number;
  stats: DepthAIStats;
  health: {
    status: string;
    issues: string[];
  };
}

interface DepthAIConfig {
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

interface IMUData {
  timestamp: string;
  sequence_num: number;
  accelerometer?: { x: number; y: number; z: number };
  gyroscope?: { x: number; y: number; z: number };
  magnetometer?: { x: number; y: number; z: number };
  rotation?: { i: number; j: number; k: number; real: number };
}

class DepthAIClient {
  private statusPath: string;
  private configPath: string;
  private outputDir: string;
  private logPath: string;

  constructor() {
    this.statusPath = '/var/run/depthai-daemon/status.json';
    this.configPath = '/etc/depthai-daemon/config.json';
    this.outputDir = '/tmp/depthai-frames';
    this.logPath = '/var/log/depthai-daemon/daemon.log';
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
  async getLatestFrames(count: number = 5): Promise<string[]> {
    try {
      if (!(await exists(this.outputDir))) {
        console.warn('Output directory not found. Frame saving may be disabled.');
        return [];
      }

      const files = await Array.fromAsync(
        new Bun.Glob('*.jpg').scan({ cwd: this.outputDir })
      );

      // Sort by modification time (newest first)
      const fileStats = await Promise.all(
        files.map(async (file) => {
          const fullPath = join(this.outputDir, file);
          const stat = await Bun.file(fullPath).stat();
          return { file: fullPath, mtime: stat.mtime };
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
          const stat = await Bun.file(fullPath).stat();
          return { file: fullPath, mtime: stat.mtime };
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
      const proc = Bun.spawn(['tail', '-n', lines.toString(), this.logPath]);
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
   * Export data to JSON file
   */
  async exportData(outputPath: string): Promise<boolean> {
    try {
      const status = await this.getStatus();
      const config = await this.getConfig();
      const imuData = await this.getLatestIMUData(100);
      const logs = await this.getLogs(100);

      const exportData = {
        timestamp: new Date().toISOString(),
        status,
        config,
        recent_imu_data: imuData,
        recent_logs: logs,
      };

      await writeFile(outputPath, JSON.stringify(exportData, null, 2));
      console.log(`Data exported to: ${outputPath}`);
      return true;
    } catch (error) {
      console.error('Error exporting data:', error);
      return false;
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
  formatUptime(seconds: number): string {
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
}

// CLI Interface
class DepthAICLI {
  private client: DepthAIClient;

  constructor() {
    this.client = new DepthAIClient();
  }

  async run(args: string[]) {
    const command = args[2] || 'status';

    switch (command) {
      case 'status':
        await this.showStatus();
        break;
      case 'monitor':
        await this.monitorStatus();
        break;
      case 'config':
        await this.showConfig();
        break;
      case 'imu':
        await this.showIMUData();
        break;
      case 'frames':
        await this.showFrames();
        break;
      case 'logs':
        const lineCount = parseInt(args[3]) || 20;
        await this.showLogs(lineCount);
        break;
      case 'export':
        const outputPath = args[3] || `depthai-export-${Date.now()}.json`;
        await this.exportData(outputPath);
        break;
      case 'health':
        await this.checkHealth();
        break;
      case 'set-fps':
        const fps = parseInt(args[3]);
        if (fps) await this.setFPS(fps);
        break;
      default:
        this.showHelp();
    }
  }

  async showStatus() {
    console.log('🔍 DepthAI Daemon Status\n');
    
    const status = await this.client.getStatus();
    if (!status) {
      console.log('❌ Daemon not running or status unavailable');
      return;
    }

    const stats = status.stats;
    console.log(`📊 Service Status: ${status.status === 'running' ? '✅ Running' : '❌ Stopped'}`);
    console.log(`🆔 Process ID: ${status.pid}`);
    console.log(`⏱️  Uptime: ${this.client.formatUptime(stats.uptime_seconds)}`);
    console.log(`🎬 Total Frames: ${stats.total_frames.toLocaleString()}`);
    console.log(`📈 Current FPS: ${stats.current_fps.toFixed(1)}`);
    console.log(`📊 Average FPS: ${stats.average_fps.toFixed(1)}`);
    console.log(`❌ Errors: ${stats.error_count}`);
    
    if (stats.imu_data_count > 0) {
      console.log(`🧭 IMU Samples: ${stats.imu_data_count.toLocaleString()}`);
    }
    
    if (stats.current_temperature_c) {
      console.log(`🌡️  Temperature: ${stats.current_temperature_c.toFixed(1)}°C`);
    }

    console.log(`\n🏥 Health: ${status.health.status === 'healthy' ? '✅ Healthy' : '⚠️ ' + status.health.status}`);
    if (status.health.issues.length > 0) {
      console.log('⚠️  Issues:');
      status.health.issues.forEach(issue => console.log(`   • ${issue}`));
    }
  }

  async monitorStatus() {
    console.log('🔄 Monitoring DepthAI Daemon (Press Ctrl+C to stop)\n');
    
    for await (const status of this.client.monitorStatus(2000)) {
      if (!status) {
        console.log('❌ Daemon not available');
        continue;
      }

      // Clear screen and show updated status
      console.clear();
      console.log('🔄 Real-time DepthAI Monitor\n');
      
      const stats = status.stats;
      console.log(`Status: ${status.status} | FPS: ${stats.current_fps.toFixed(1)} | Frames: ${stats.total_frames.toLocaleString()}`);
      
      if (stats.current_temperature_c) {
        console.log(`Temperature: ${stats.current_temperature_c.toFixed(1)}°C`);
      }
      
      if (stats.imu_data_count > 0) {
        console.log(`IMU: ${stats.imu_data_count.toLocaleString()} samples`);
      }
      
      console.log(`Health: ${status.health.status} | Uptime: ${this.client.formatUptime(stats.uptime_seconds)}`);
      console.log(`Last update: ${new Date().toLocaleTimeString()}`);
    }
  }

  async showConfig() {
    console.log('⚙️  DepthAI Configuration\n');
    
    const config = await this.client.getConfig();
    if (!config) {
      console.log('❌ Configuration unavailable');
      return;
    }

    console.log('📷 Camera Settings:');
    console.log(`   Resolution: ${config.camera.rgb_resolution.join('x')}`);
    console.log(`   FPS: ${config.camera.rgb_fps}`);
    console.log(`   Depth: ${config.camera.depth_enabled ? '✅' : '❌'}`);
    console.log(`   IMU: ${config.camera.imu_enabled ? '✅' : '❌'}`);
    if (config.camera.imu_enabled) {
      console.log(`   IMU Frequency: ${config.camera.imu_frequency}Hz`);
    }

    console.log('\n🤖 AI Settings:');
    console.log(`   Model: ${config.ai.model_enabled ? '✅' : '❌'}`);
    if (config.ai.model_enabled) {
      console.log(`   Path: ${config.ai.model_path}`);
      console.log(`   Confidence: ${config.ai.confidence_threshold}`);
    }

    console.log('\n💾 Output Settings:');
    console.log(`   Save Frames: ${config.output.save_frames ? '✅' : '❌'}`);
    console.log(`   Directory: ${config.output.output_directory}`);
    console.log(`   Max Files: ${config.output.max_files}`);
  }

  async showIMUData() {
    console.log('🧭 Latest IMU Data\n');
    
    const imuData = await this.client.getLatestIMUData(5);
    if (imuData.length === 0) {
      console.log('❌ No IMU data available');
      return;
    }

    imuData.forEach((data, index) => {
      console.log(`📊 Sample ${index + 1} (${data.timestamp}):`);
      
      if (data.accelerometer) {
        const acc = data.accelerometer;
        console.log(`   Accelerometer: x=${acc.x.toFixed(3)}, y=${acc.y.toFixed(3)}, z=${acc.z.toFixed(3)} m/s²`);
      }
      
      if (data.gyroscope) {
        const gyro = data.gyroscope;
        console.log(`   Gyroscope: x=${gyro.x.toFixed(3)}, y=${gyro.y.toFixed(3)}, z=${gyro.z.toFixed(3)} rad/s`);
      }
      
      if (data.magnetometer) {
        const mag = data.magnetometer;
        console.log(`   Magnetometer: x=${mag.x.toFixed(3)}, y=${mag.y.toFixed(3)}, z=${mag.z.toFixed(3)} µT`);
      }
      
      console.log();
    });
  }

  async showFrames() {
    console.log('🎬 Latest Frames\n');
    
    const frames = await this.client.getLatestFrames(10);
    if (frames.length === 0) {
      console.log('❌ No frames available');
      return;
    }

    console.log(`Found ${frames.length} recent frames:`);
    frames.forEach((frame, index) => {
      const fileName = frame.split('/').pop();
      console.log(`   ${index + 1}. ${fileName}`);
    });
  }

  async showLogs(lines: number) {
    console.log(`📝 Recent Logs (${lines} lines)\n`);
    
    const logs = await this.client.getLogs(lines);
    if (logs.length === 0) {
      console.log('❌ No logs available');
      return;
    }

    logs.forEach(log => console.log(log));
  }

  async exportData(outputPath: string) {
    console.log('💾 Exporting DepthAI data...');
    
    const success = await this.client.exportData(outputPath);
    if (success) {
      console.log('✅ Export completed');
    } else {
      console.log('❌ Export failed');
    }
  }

  async checkHealth() {
    console.log('🏥 Health Check\n');
    
    const isHealthy = await this.client.isHealthy();
    console.log(`Status: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    
    const status = await this.client.getStatus();
    if (status?.health?.issues?.length) {
      console.log('\n⚠️  Issues:');
      status.health.issues.forEach(issue => console.log(`   • ${issue}`));
    }
  }

  async setFPS(fps: number) {
    console.log(`🎬 Setting FPS to ${fps}...`);
    
    const success = await this.client.updateConfig({
      camera: { rgb_fps: fps }
    });
    
    if (success) {
      console.log('✅ FPS updated');
    } else {
      console.log('❌ Failed to update FPS');
    }
  }

  showHelp() {
    console.log('📖 DepthAI Client Help\n');
    console.log('Usage: bun depthai-client.ts [command] [options]\n');
    console.log('Commands:');
    console.log('  status      - Show current daemon status');
    console.log('  monitor     - Monitor daemon in real-time');
    console.log('  config      - Show configuration');
    console.log('  imu         - Show latest IMU data');
    console.log('  frames      - List recent frames');
    console.log('  logs [N]    - Show N recent log lines (default: 20)');
    console.log('  export [file] - Export all data to JSON');
    console.log('  health      - Check daemon health');
    console.log('  set-fps N   - Set camera FPS to N');
    console.log('  help        - Show this help');
  }
}

// Run CLI if this file is executed directly
if (import.meta.main) {
  const cli = new DepthAICLI();
  await cli.run(process.argv);
}

export { DepthAIClient, DepthAICLI };
