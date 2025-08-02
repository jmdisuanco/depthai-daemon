/**
 * HTML Template Generator for DepthAI Visualizations
 * 
 * Generates various HTML templates for plots, dashboards, and reports
 */

import type { IMUAnalysis, DepthAIStatus, DepthAIConfig, ExportData } from './client.js';

export class HTMLTemplates {
  
  /**
   * Generate IMU data analysis plot
   */
  static generateIMUPlot(analysis: IMUAnalysis): string {
    const timestamps = analysis.timestamps.map((_, i) => i);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>DepthAI IMU Data Analysis</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .plot-container { background: white; margin: 20px 0; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .stats { background: #e3f2fd; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .sensor-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat-card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .stat-title { font-weight: bold; color: #1976d2; margin-bottom: 10px; }
        .stat-value { font-family: monospace; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧭 DepthAI IMU Data Analysis</h1>
            <p><strong>Sample count:</strong> ${analysis.sample_count} | <strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div class="stats">
            <h3>📊 Statistics Summary</h3>
            <div class="sensor-stats">
                <div class="stat-card">
                    <div class="stat-title">Accelerometer (m/s²)</div>
                    <div class="stat-value">
                        X: μ=${analysis.accelerometer.x_mean.toFixed(3)}, σ=${analysis.accelerometer.x_std.toFixed(3)}<br>
                        Y: μ=${analysis.accelerometer.y_mean.toFixed(3)}, σ=${analysis.accelerometer.y_std.toFixed(3)}<br>
                        Z: μ=${analysis.accelerometer.z_mean.toFixed(3)}, σ=${analysis.accelerometer.z_std.toFixed(3)}
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Gyroscope (rad/s)</div>
                    <div class="stat-value">
                        X: μ=${analysis.gyroscope.x_mean.toFixed(3)}, σ=${analysis.gyroscope.x_std.toFixed(3)}<br>
                        Y: μ=${analysis.gyroscope.y_mean.toFixed(3)}, σ=${analysis.gyroscope.y_std.toFixed(3)}<br>
                        Z: μ=${analysis.gyroscope.z_mean.toFixed(3)}, σ=${analysis.gyroscope.z_std.toFixed(3)}
                    </div>
                </div>
                ${analysis.magnetometer ? `
                <div class="stat-card">
                    <div class="stat-title">Magnetometer (µT)</div>
                    <div class="stat-value">
                        X: μ=${analysis.magnetometer.x_mean.toFixed(3)}, σ=${analysis.magnetometer.x_std.toFixed(3)}<br>
                        Y: μ=${analysis.magnetometer.y_mean.toFixed(3)}, σ=${analysis.magnetometer.y_std.toFixed(3)}<br>
                        Z: μ=${analysis.magnetometer.z_mean.toFixed(3)}, σ=${analysis.magnetometer.z_std.toFixed(3)}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>

        <div class="plot-container">
            <div id="accelerometer" style="height: 400px;"></div>
        </div>
        
        <div class="plot-container">
            <div id="gyroscope" style="height: 400px;"></div>
        </div>
        
        ${analysis.magnetometer ? '<div class="plot-container"><div id="magnetometer" style="height: 400px;"></div></div>' : ''}
    </div>

    <script>
        // Accelerometer plot
        Plotly.newPlot('accelerometer', [
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.accelerometer.x)}, name: 'X', type: 'scatter', line: {color: '#ff6b6b'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.accelerometer.y)}, name: 'Y', type: 'scatter', line: {color: '#4ecdc4'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.accelerometer.z)}, name: 'Z', type: 'scatter', line: {color: '#45b7d1'}}
        ], {
            title: 'Accelerometer Data (m/s²)',
            xaxis: {title: 'Sample Number'},
            yaxis: {title: 'Acceleration (m/s²)'},
            legend: {orientation: 'h'}
        }, {responsive: true});

        // Gyroscope plot
        Plotly.newPlot('gyroscope', [
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.gyroscope.x)}, name: 'X', type: 'scatter', line: {color: '#ff6b6b'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.gyroscope.y)}, name: 'Y', type: 'scatter', line: {color: '#4ecdc4'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.gyroscope.z)}, name: 'Z', type: 'scatter', line: {color: '#45b7d1'}}
        ], {
            title: 'Gyroscope Data (rad/s)',
            xaxis: {title: 'Sample Number'},
            yaxis: {title: 'Angular Velocity (rad/s)'},
            legend: {orientation: 'h'}
        }, {responsive: true});

        ${analysis.magnetometer ? `
        // Magnetometer plot
        Plotly.newPlot('magnetometer', [
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.magnetometer.x)}, name: 'X', type: 'scatter', line: {color: '#ff6b6b'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.magnetometer.y)}, name: 'Y', type: 'scatter', line: {color: '#4ecdc4'}},
            {x: ${JSON.stringify(timestamps)}, y: ${JSON.stringify(analysis.magnetometer.z)}, name: 'Z', type: 'scatter', line: {color: '#45b7d1'}}
        ], {
            title: 'Magnetometer Data (µT)',
            xaxis: {title: 'Sample Number'},
            yaxis: {title: 'Magnetic Field (µT)'},
            legend: {orientation: 'h'}
        }, {responsive: true});
        ` : ''}
    </script>
</body>
</html>`;
  }

  /**
   * Generate live monitoring dashboard
   */
  static generateLiveDashboard(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>DepthAI Live Monitor</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .status-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .plot-container { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .metric { font-size: 32px; font-weight: bold; color: #333; margin: 10px 0; }
        .label { color: #666; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
        .healthy { color: #4CAF50; }
        .warning { color: #FF9800; }
        .error { color: #F44336; }
        .controls { margin: 20px 0; text-align: center; }
        .btn { background: #2196F3; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin: 0 10px; font-size: 14px; }
        .btn:hover { background: #1976D2; }
        .auto-refresh { color: #4CAF50; font-weight: bold; }
        .connection-status { position: fixed; top: 10px; right: 10px; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .connected { background: #4CAF50; color: white; }
        .disconnected { background: #F44336; color: white; }
    </style>
</head>
<body>
    <div class="connection-status" id="connectionStatus">🔄 Connecting...</div>
    
    <div class="header">
        <h1>🔍 DepthAI Live Monitor</h1>
        <div class="controls">
            <button class="btn" onclick="toggleAutoRefresh()" id="refreshBtn">▶️ Start Auto-Refresh</button>
            <button class="btn" onclick="loadData()">🔄 Refresh Now</button>
            <span id="lastUpdate" style="margin-left: 20px; color: #666;"></span>
        </div>
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
        <div id="fpsPlot" style="height: 400px;"></div>
    </div>

    <div class="plot-container">
        <div id="tempPlot" style="height: 400px;"></div>
    </div>

    <script>
        let fpsData = [];
        let tempData = [];
        let timestamps = [];
        let autoRefreshInterval = null;
        let isAutoRefreshing = false;

        // In a real implementation, this would fetch from the daemon status file
        // For now, we simulate data. To make it work with real data, replace with:
        // fetch('/var/run/depthai-daemon/status.json').then(r => r.json())
        async function loadData() {
            try {
                document.getElementById('connectionStatus').textContent = '🔄 Loading...';
                document.getElementById('connectionStatus').className = 'connection-status';
                
                // Simulate data - replace with real API call
                const now = new Date();
                const status = {
                    status: 'running',
                    stats: {
                        current_fps: 28 + Math.random() * 4,
                        total_frames: Math.floor(1000000 + Math.random() * 100000),
                        uptime_formatted: Math.floor(Date.now() / 1000 / 3600) + 'h ' + Math.floor(Date.now() / 1000 / 60 % 60) + 'm',
                        current_temperature_c: 42 + Math.random() * 8,
                        error_count: Math.floor(Math.random() * 3),
                        imu_data_count: Math.floor(Math.random() * 50000)
                    },
                    health: { 
                        status: Math.random() > 0.1 ? 'healthy' : 'degraded',
                        issues: []
                    }
                };

                // Update status cards
                updateStatusCard('serviceStatus', '✅ Running', 'healthy');
                updateStatusCard('currentFPS', status.stats.current_fps.toFixed(1), 'healthy');
                updateStatusCard('totalFrames', status.stats.total_frames.toLocaleString(), 'healthy');
                updateStatusCard('uptime', status.stats.uptime_formatted, 'healthy');
                updateStatusCard('temperature', status.stats.current_temperature_c.toFixed(1) + '°C', 
                    status.stats.current_temperature_c > 65 ? 'warning' : 'healthy');
                updateStatusCard('health', status.health.status === 'healthy' ? '✅ Healthy' : '⚠️ Issues', 
                    status.health.status === 'healthy' ? 'healthy' : 'warning');
                
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
                    line: { color: '#2196F3', width: 3 },
                    marker: { size: 6 }
                }], {
                    title: 'Frame Rate Over Time',
                    xaxis: { title: 'Time' },
                    yaxis: { title: 'FPS', range: [0, Math.max(...fpsData) * 1.1] }
                }, {responsive: true});

                // Update temperature plot
                Plotly.newPlot('tempPlot', [{
                    x: timestamps,
                    y: tempData,
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Temperature',
                    line: { color: '#FF5722', width: 3 },
                    marker: { size: 6 }
                }], {
                    title: 'Device Temperature Over Time',
                    xaxis: { title: 'Time' },
                    yaxis: { title: 'Temperature (°C)' }
                }, {responsive: true});

                document.getElementById('connectionStatus').textContent = '✅ Connected';
                document.getElementById('connectionStatus').className = 'connection-status connected';

            } catch (error) {
                console.error('Error loading data:', error);
                updateStatusCard('serviceStatus', '❌ Error', 'error');
                document.getElementById('connectionStatus').textContent = '❌ Error';
                document.getElementById('connectionStatus').className = 'connection-status disconnected';
            }
        }

        function updateStatusCard(id, text, status) {
            const element = document.getElementById(id);
            element.textContent = text;
            element.className = 'metric ' + status;
        }

        function toggleAutoRefresh() {
            const btn = document.getElementById('refreshBtn');
            
            if (isAutoRefreshing) {
                clearInterval(autoRefreshInterval);
                btn.textContent = '▶️ Start Auto-Refresh';
                btn.className = 'btn';
                isAutoRefreshing = false;
            } else {
                autoRefreshInterval = setInterval(loadData, 2000);
                btn.textContent = '⏸️ Stop Auto-Refresh';
                btn.className = 'btn auto-refresh';
                isAutoRefreshing = true;
                loadData(); // Load immediately
            }
        }

        // Load data initially
        loadData();
    </script>
</body>
</html>`;
  }

  /**
   * Generate comprehensive system report
   */
  static generateSystemReport(exportData: ExportData): string {
    const { status, config, imu_analysis, recent_logs, latest_frames } = exportData;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>DepthAI System Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; min-height: 100vh; }
        .header { border-bottom: 3px solid #2196F3; padding-bottom: 20px; margin-bottom: 40px; text-align: center; }
        .section { margin: 40px 0; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
        .card { background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 5px solid #2196F3; }
        .status-ok { border-left-color: #4CAF50; }
        .status-warning { border-left-color: #FF9800; }
        .status-error { border-left-color: #F44336; }
        .metric { font-size: 28px; font-weight: bold; margin: 15px 0; }
        .label { color: #666; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; }
        .logs { background: #1a1a1a; color: #00ff41; padding: 20px; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 12px; max-height: 400px; overflow-y: auto; line-height: 1.4; }
        .config-tree { background: #f8f9fa; padding: 20px; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 13px; overflow-x: auto; }
        .frames-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .frames-list { list-style: none; padding: 0; margin: 0; }
        .frames-list li { background: #e3f2fd; margin: 8px 0; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; }
        h1 { color: #1976d2; margin: 0; }
        h2 { color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; }
        h3 { color: #555; }
        .timestamp { color: #666; font-size: 14px; margin-top: 10px; }
        .summary-stats { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 15px; margin: 20px 0; text-align: center; }
        .summary-stats .metric { color: white; }
        .no-data { text-align: center; color: #999; font-style: italic; padding: 40px; }
        .imu-stats { background: #e8f5e8; border-left-color: #4CAF50; }
        .performance-card { background: #fff3e0; border-left-color: #FF9800; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 DepthAI System Report</h1>
            <div class="timestamp">Generated: ${new Date(exportData.timestamp).toLocaleString()}</div>
        </div>

        ${status ? `
        <div class="summary-stats">
            <h2 style="color: white; border: none; margin-top: 0;">📊 System Overview</h2>
            <div class="grid">
                <div>
                    <div class="label" style="color: rgba(255,255,255,0.8);">Status</div>
                    <div class="metric">${status.status === 'running' ? '✅ Running' : '❌ Stopped'}</div>
                </div>
                <div>
                    <div class="label" style="color: rgba(255,255,255,0.8);">Uptime</div>
                    <div class="metric">${status.stats?.uptime_formatted || 'N/A'}</div>
                </div>
                <div>
                    <div class="label" style="color: rgba(255,255,255,0.8);">Current FPS</div>
                    <div class="metric">${status.stats?.current_fps?.toFixed(1) || 'N/A'}</div>
                </div>
                <div>
                    <div class="label" style="color: rgba(255,255,255,0.8);">Health</div>
                    <div class="metric">${status.health?.status === 'healthy' ? '✅ Healthy' : '⚠️ Issues'}</div>
                </div>
            </div>
        </div>
        ` : ''}

        <div class="section">
            <h2>🎬 Performance Metrics</h2>
            <div class="grid">
                ${status ? `
                <div class="card performance-card">
                    <div class="label">Current FPS</div>
                    <div class="metric">${status.stats?.current_fps?.toFixed(1) || 'N/A'}</div>
                </div>
                <div class="card performance-card">
                    <div class="label">Average FPS</div>
                    <div class="metric">${status.stats?.average_fps?.toFixed(1) || 'N/A'}</div>
                </div>
                <div class="card performance-card">
                    <div class="label">Total Frames</div>
                    <div class="metric">${status.stats?.total_frames?.toLocaleString() || 'N/A'}</div>
                </div>
                <div class="card ${(status.stats?.error_count || 0) > 0 ? 'status-warning' : 'status-ok'}">
                    <div class="label">Error Count</div>
                    <div class="metric">${status.stats?.error_count || 0}</div>
                </div>
                ${status.stats?.current_temperature_c ? `
                <div class="card ${status.stats.current_temperature_c > 70 ? 'status-warning' : 'status-ok'}">
                    <div class="label">Temperature</div>
                    <div class="metric">${status.stats.current_temperature_c.toFixed(1)}°C</div>
                </div>
                ` : ''}
                ${status.stats?.imu_data_count ? `
                <div class="card status-ok">
                    <div class="label">IMU Samples</div>
                    <div class="metric">${status.stats.imu_data_count.toLocaleString()}</div>
                </div>
                ` : ''}
                ` : '<div class="no-data">No performance data available</div>'}
            </div>
        </div>

        ${imu_analysis ? `
        <div class="section">
            <h2>🧭 IMU Analysis</h2>
            <p><strong>Analysis based on ${imu_analysis.sample_count} recent samples</strong></p>
            <div class="grid">
                <div class="card imu-stats">
                    <div class="label">Accelerometer (m/s²)</div>
                    <div style="font-size: 14px; line-height: 1.6;">
                        <div><strong>X:</strong> μ=${imu_analysis.accelerometer.x_mean.toFixed(3)}, σ=${imu_analysis.accelerometer.x_std.toFixed(3)}</div>
                        <div><strong>Y:</strong> μ=${imu_analysis.accelerometer.y_mean.toFixed(3)}, σ=${imu_analysis.accelerometer.y_std.toFixed(3)}</div>
                        <div><strong>Z:</strong> μ=${imu_analysis.accelerometer.z_mean.toFixed(3)}, σ=${imu_analysis.accelerometer.z_std.toFixed(3)}</div>
                    </div>
                </div>
                <div class="card imu-stats">
                    <div class="label">Gyroscope (rad/s)</div>
                    <div style="font-size: 14px; line-height: 1.6;">
                        <div><strong>X:</strong> μ=${imu_analysis.gyroscope.x_mean.toFixed(3)}, σ=${imu_analysis.gyroscope.x_std.toFixed(3)}</div>
                        <div><strong>Y:</strong> μ=${imu_analysis.gyroscope.y_mean.toFixed(3)}, σ=${imu_analysis.gyroscope.y_std.toFixed(3)}</div>
                        <div><strong>Z:</strong> μ=${imu_analysis.gyroscope.z_mean.toFixed(3)}, σ=${imu_analysis.gyroscope.z_std.toFixed(3)}</div>
                    </div>
                </div>
                ${imu_analysis.magnetometer ? `
                <div class="card imu-stats">
                    <div class="label">Magnetometer (µT)</div>
                    <div style="font-size: 14px; line-height: 1.6;">
                        <div><strong>X:</strong> μ=${imu_analysis.magnetometer.x_mean.toFixed(3)}, σ=${imu_analysis.magnetometer.x_std.toFixed(3)}</div>
                        <div><strong>Y:</strong> μ=${imu_analysis.magnetometer.y_mean.toFixed(3)}, σ=${imu_analysis.magnetometer.y_std.toFixed(3)}</div>
                        <div><strong>Z:</strong> μ=${imu_analysis.magnetometer.z_mean.toFixed(3)}, σ=${imu_analysis.magnetometer.z_std.toFixed(3)}</div>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
        ` : ''}

        <div class="section">
            <h2>⚙️ Configuration</h2>
            <div class="config-tree">
                <pre>${JSON.stringify(config, null, 2)}</pre>
            </div>
        </div>

        <div class="section">
            <h2>🎬 Recent Frames</h2>
            <div class="frames-grid">
                <div class="card status-ok">
                    <div class="label">RGB Frames (${latest_frames.rgb.length})</div>
                    <ul class="frames-list">
                        ${latest_frames.rgb.length > 0 ? 
                          latest_frames.rgb.map(frame => `<li>📷 ${frame.split('/').pop()}</li>`).join('') :
                          '<li style="text-align: center; color: #999;">No RGB frames found</li>'
                        }
                    </ul>
                </div>
                <div class="card status-ok">
                    <div class="label">Depth Frames (${latest_frames.depth.length})</div>
                    <ul class="frames-list">
                        ${latest_frames.depth.length > 0 ? 
                          latest_frames.depth.map(frame => `<li>🔍 ${frame.split('/').pop()}</li>`).join('') :
                          '<li style="text-align: center; color: #999;">No depth frames found</li>'
                        }
                    </ul>
                </div>
            </div>
        </div>

        ${status?.health?.issues?.length ? `
        <div class="section">
            <h2>⚠️ Health Issues</h2>
            <div class="card status-warning">
                <ul style="margin: 0; padding-left: 20px;">
                    ${status.health.issues.map(issue => `<li style="margin: 10px 0;">${issue}</li>`).join('')}
                </ul>
            </div>
        </div>
        ` : ''}

        <div class="section">
            <h2>📝 Recent Logs</h2>
            <div class="logs">
                ${recent_logs.length > 0 ? 
                  recent_logs.map(log => `<div>${log}</div>`).join('') :
                  '<div style="text-align: center; color: #666;">No log entries found</div>'
                }
            </div>
        </div>

        <div class="section" style="text-align: center; color: #666; border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 40px;">
            <p>Report generated by DepthAI Client Library</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Generate simple status page
   */
  static generateStatusPage(status: DepthAIStatus | null): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>DepthAI Status</title>
    <meta http-equiv="refresh" content="5">
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .status-header { text-align: center; margin-bottom: 30px; }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .status-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .metric { font-size: 24px; font-weight: bold; margin: 10px 0; }
        .label { color: #666; font-size: 12px; text-transform: uppercase; }
        .healthy { color: #4CAF50; }
        .warning { color: #FF9800; }
        .error { color: #F44336; }
        .auto-refresh { background: #e3f2fd; padding: 10px; border-radius: 5px; font-size: 12px; margin-top: 20px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="status-header">
            <h1>🔍 DepthAI Status</h1>
            <div style="color: #666;">Last updated: ${new Date().toLocaleString()}</div>
        </div>

        ${status ? `
        <div class="status-grid">
            <div class="status-card">
                <div class="label">Service</div>
                <div class="metric ${status.status === 'running' ? 'healthy' : 'error'}">
                    ${status.status === 'running' ? '✅ Running' : '❌ Stopped'}
                </div>
            </div>
            <div class="status-card">
                <div class="label">FPS</div>
                <div class="metric">${status.stats.current_fps.toFixed(1)}</div>
            </div>
            <div class="status-card">
                <div class="label">Frames</div>
                <div class="metric">${status.stats.total_frames.toLocaleString()}</div>
            </div>
            <div class="status-card">
                <div class="label">Uptime</div>
                <div class="metric">${status.stats.uptime_formatted}</div>
            </div>
            ${status.stats.current_temperature_c ? `
            <div class="status-card">
                <div class="label">Temperature</div>
                <div class="metric ${status.stats.current_temperature_c > 70 ? 'warning' : 'healthy'}">
                    ${status.stats.current_temperature_c.toFixed(1)}°C
                </div>
            </div>
            ` : ''}
            <div class="status-card">
                <div class="label">Health</div>
                <div class="metric ${status.health.status === 'healthy' ? 'healthy' : 'warning'}">
                    ${status.health.status === 'healthy' ? '✅ Healthy' : '⚠️ Issues'}
                </div>
            </div>
        </div>

        ${status.health.issues.length > 0 ? `
        <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 5px;">
            <strong>⚠️ Issues:</strong>
            <ul style="margin: 10px 0;">
                ${status.health.issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        ` : `
        <div style="text-align: center; padding: 40px; color: #999;">
            <h2>❌ Service Unavailable</h2>
            <p>DepthAI daemon is not running or status file is not accessible.</p>
        </div>
        `}

        <div class="auto-refresh">
            🔄 This page auto-refreshes every 5 seconds
        </div>
    </div>
</body>
</html>`;
  }
}

export default HTMLTemplates;