/**
 * Usage Examples for DepthAI Client Library
 *
 * Demonstrates how to use the separated client library in various scenarios
 */

import DepthAIClient, { DepthAIUtils } from "./client.js";
import HTMLTemplates from "./templates.js";
import { writeFile } from "fs/promises";

// Example 1: Basic status monitoring
async function basicStatusExample() {
  console.log("📊 Basic Status Example\n");

  const client = new DepthAIClient();
  const status = await client.getStatus();

  if (status) {
    console.log(`Service: ${status.status}`);
    console.log(`FPS: ${status.stats.current_fps.toFixed(1)}`);
    console.log(
      `Uptime: ${DepthAIUtils.formatUptime(status.stats.uptime_seconds)}`
    );
    console.log(`Health: ${status.health.status}`);
  } else {
    console.log("Daemon not available");
  }
}

// Example 2: Real-time monitoring with custom logic
async function customMonitoringExample() {
  console.log("🔄 Custom Monitoring Example\n");

  const client = new DepthAIClient();
  let frameCount = 0;

  for await (const status of client.monitorStatus(1000)) {
    if (!status) continue;

    frameCount++;
    console.log(
      `Update ${frameCount}: FPS=${status.stats.current_fps.toFixed(1)}, Temp=${status.stats.current_temperature_c?.toFixed(1)}°C`
    );

    // Custom logic: Alert on high temperature
    if (
      status.stats.current_temperature_c &&
      status.stats.current_temperature_c > 70
    ) {
      console.log("🚨 High temperature alert!");
    }

    // Stop after 10 updates
    if (frameCount >= 10) break;
  }
}

// Example 3: IMU data analysis with custom processing
async function imuAnalysisExample() {
  console.log("🧭 IMU Analysis Example\n");

  const client = new DepthAIClient();
  const analysis = await client.analyzeIMUData(50);

  if (analysis) {
    console.log(`Analyzed ${analysis.sample_count} samples`);

    // Calculate motion intensity
    const accMagnitude = DepthAIUtils.calculateMagnitude(
      analysis.accelerometer.x_mean,
      analysis.accelerometer.y_mean,
      analysis.accelerometer.z_mean
    );

    const gyroMagnitude = DepthAIUtils.calculateMagnitude(
      analysis.gyroscope.x_mean,
      analysis.gyroscope.y_mean,
      analysis.gyroscope.z_mean
    );

    console.log(
      `Motion intensity: Acc=${accMagnitude.toFixed(3)} m/s², Gyro=${gyroMagnitude.toFixed(3)} rad/s`
    );

    // Determine motion state
    if (accMagnitude < 0.1 && gyroMagnitude < 0.1) {
      console.log("📍 Device appears to be stationary");
    } else if (accMagnitude > 2 || gyroMagnitude > 1) {
      console.log("🏃 High motion detected");
    } else {
      console.log("🚶 Normal motion detected");
    }
  }
}

// Example 4: Frame monitoring with custom processing
async function frameMonitoringExample() {
  console.log("🎬 Frame Monitoring Example\n");

  const client = new DepthAIClient();
  let frameCount = 0;

  console.log("Monitoring frames for 30 seconds...");
  const startTime = Date.now();

  for await (const frameInfo of client.streamFrames("rgb", 500)) {
    if (frameInfo) {
      frameCount++;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = frameCount / elapsed;

      console.log(
        `Frame ${frameCount}: ${frameInfo.fileName} (${DepthAIUtils.formatBytes(frameInfo.size)}) - Rate: ${rate.toFixed(1)}/s`
      );
    }

    // Stop after 30 seconds
    if (Date.now() - startTime > 30000) break;
  }

  console.log(`Processed ${frameCount} frames in 30 seconds`);
}

// Example 5: Custom dashboard creation
async function customDashboardExample() {
  console.log("📊 Custom Dashboard Example\n");

  const client = new DepthAIClient();

  // Get current data
  const status = await client.getStatus();
  const config = await client.getConfig();
  const exportData = await client.exportData();

  // Create custom HTML with additional features
  const customHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>My Custom DepthAI Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        .container { max-width: 1000px; margin: 0 auto; }
        .card { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; margin: 20px 0; backdrop-filter: blur(10px); }
        .metric { font-size: 24px; font-weight: bold; margin: 10px 0; }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 My Custom DepthAI Dashboard</h1>
        
        <div class="card">
            <h2>Current Status</h2>
            <div class="status-grid">
                    <div class="metric">${status?.status === "running" ? "✅ Running" : "❌ Stopped"}</div>
                </div>
                <div>
                    <div>Current FPS</div>
                    <div class="metric">${status?.stats?.current_fps?.toFixed(1) || "N/A"}</div>
                </div>
                <div>
                    <div>Temperature</div>
                    <div class="metric">${status?.stats?.current_temperature_c?.toFixed(1) || "N/A"}°C</div>
                </div>
                <div>
                    <div>Total Frames</div>
                    <div class="metric">${status?.stats?.total_frames?.toLocaleString() || "N/A"}</div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h2>Configuration Summary</h2>
            <p><strong>Resolution:</strong> ${config?.camera?.rgb_resolution?.join("x") || "Unknown"}</p>
            <p><strong>Depth Enabled:</strong> ${config?.camera?.depth_enabled ? "Yes" : "No"}</p>
            <p><strong>IMU Enabled:</strong> ${config?.camera?.imu_enabled ? "Yes" : "No"}</p>
            <p><strong>AI Model:</strong> ${config?.ai?.model_enabled ? "Enabled" : "Disabled"}</p>
        </div>
        
        <div class="card">
            <h2>Data Summary</h2>
            <p><strong>Export Timestamp:</strong> ${new Date(exportData.timestamp).toLocaleString()}</p>
            <p><strong>Recent IMU Samples:</strong> ${exportData.recent_imu_data.length}</p>
            <p><strong>RGB Frames:</strong> ${exportData.latest_frames.rgb.length}</p>
            <p><strong>Depth Frames:</strong> ${exportData.latest_frames.depth.length}</p>
            <p><strong>Log Entries:</strong> ${exportData.recent_logs.length}</p>
        </div>
    </div>
</body>
</html>`;

  await writeFile("my-custom-dashboard.html", customHTML);
  console.log("📊 Custom dashboard created: my-custom-dashboard.html");
}

// Example 6: Configuration management
async function configManagementExample() {
  console.log("⚙️ Configuration Management Example\n");

  const client = new DepthAIClient();

  // Get current configuration
  const currentConfig = await client.getConfig();
  console.log("Current RGB FPS:", currentConfig?.camera?.rgb_fps);

  // Update configuration
  const updateSuccess = await client.updateConfig({
    camera: {
      rgb_resolution: [1920, 1080], // example resolution
      rgb_fps: 25, // Lower FPS for better performance
      depth_enabled: true, // or false, as needed
      imu_enabled: true, // or false, as needed
      imu_frequency: 100, // example frequency
    },
  });

  if (updateSuccess) {
    console.log("✅ Configuration updated successfully");
    console.log(
      "💡 Remember to reload the daemon: sudo systemctl kill -s HUP depthai-daemon"
    );
  }
}

// Example 7: Health monitoring with alerts
async function healthMonitoringExample() {
  console.log("🏥 Health Monitoring Example\n");

  const client = new DepthAIClient();

  // Check current health
  const isHealthy = await client.isHealthy();
  console.log(`Overall health: ${isHealthy ? "Healthy" : "Unhealthy"}`);

  // Get detailed status
  const status = await client.getStatus();
  if (status) {
    // Check various health indicators
    const checks = {
      "Service Running": status.status === "running",
      "FPS Above 20": status.stats.current_fps > 20,
      "Temperature Normal":
        !status.stats.current_temperature_c ||
        status.stats.current_temperature_c < 70,
      "Low Error Rate":
        status.stats.error_count / Math.max(status.stats.total_frames, 1) <
        0.01,
      "No Health Issues": status.health.issues.length === 0,
    };

    console.log("\nHealth Checks:");
    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`  ${passed ? "✅" : "❌"} ${check}`);
    });

    // Overall health score
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const healthScore = (passedChecks / Object.keys(checks).length) * 100;
    console.log(`\nHealth Score: ${healthScore.toFixed(0)}%`);
  }
}

// Example 8: Data export and reporting
async function dataExportExample() {
  console.log("💾 Data Export Example\n");

  const client = new DepthAIClient();

  // Export raw data
  const exportData = await client.exportData();
  await writeFile("export-data.json", JSON.stringify(exportData, null, 2));
  console.log("📄 Raw data exported to: export-data.json");

  // Generate comprehensive report
  const reportHTML = HTMLTemplates.generateSystemReport(exportData);
  await writeFile("system-report.html", reportHTML);
  console.log("📋 HTML report generated: system-report.html");

  // Create status page
  const statusHTML = HTMLTemplates.generateStatusPage(exportData.status);
  await writeFile("status-page.html", statusHTML);
  console.log("📄 Status page created: status-page.html");

  // Generate IMU plot if data available
  if (exportData.imu_analysis) {
    const plotHTML = HTMLTemplates.generateIMUPlot(exportData.imu_analysis);
    await writeFile("imu-analysis.html", plotHTML);
    console.log("📊 IMU plot generated: imu-analysis.html");
  }
}

// Example 9: Custom client with different paths
async function customClientExample() {
  console.log("🔧 Custom Client Example\n");

  // Create client with custom paths (useful for testing or different setups)
  const client = new DepthAIClient({
    statusPath: "/tmp/my-depthai-status.json",
    configPath: "/tmp/my-depthai-config.json",
    outputDir: "/tmp/my-depthai-frames",
    logPath: "/tmp/my-depthai.log",
  });

  console.log("Created client with custom paths");

  // Use the client normally
  const status = await client.getStatus();
  console.log("Status check completed (may fail if custom paths don't exist)");
}

// Example 10: Utility functions demonstration
async function utilityFunctionsExample() {
  console.log("🛠️ Utility Functions Example\n");

  // Format various values
  console.log("Formatting examples:");
  console.log(`Uptime: ${DepthAIUtils.formatUptime(3665)}`); // 1h 1m 5s
  console.log(`File size: ${DepthAIUtils.formatBytes(1048576)}`); // 1.0 MB
  console.log(`Timestamp: ${DepthAIUtils.formatTimestamp(new Date())}`);

  // Calculate IMU magnitude
  const accMagnitude = DepthAIUtils.calculateMagnitude(1.2, -0.8, 9.8);
  console.log(`Acceleration magnitude: ${accMagnitude.toFixed(3)} m/s²`);

  // Check if values are in normal ranges
  console.log(
    `High acceleration normal: ${DepthAIUtils.isAccelerometerNormal(15)}`
  ); // false
  console.log(`Normal rotation: ${DepthAIUtils.isGyroscopeNormal(0.5)}`); // true

  // Validate data structures
  const testIMU = {
    timestamp: new Date().toISOString(),
    sequence_num: 123,
    accelerometer: { x: 1, y: 2, z: 3 },
  };
  console.log(`Valid IMU data: ${DepthAIUtils.validateIMUData(testIMU)}`);
}

// Example 11: Error handling and resilience
async function errorHandlingExample() {
  console.log("🛡️ Error Handling Example\n");

  const client = new DepthAIClient();

  try {
    // Attempt to get status
    const status = await client.getStatus();
    if (status) {
      console.log("✅ Status retrieved successfully");
    } else {
      console.log("⚠️ Status not available, but no error thrown");
    }

    // Attempt to get non-existent frames
    const frames = await client.getLatestFrames(5, "nonexistent");
    console.log(
      `📁 Found ${frames.length} frames (expected 0 for invalid type)`
    );

    // Attempt to update config with invalid data
    const updateResult = await client.updateConfig({
      camera: {
        rgb_resolution: [1920, 1080], // Example resolution
        rgb_fps: -1, // Invalid FPS
        depth_enabled: true, // Example value
        imu_enabled: true, // Example value
        imu_frequency: 100, // Example value
      },
    });
    console.log(`Configuration update: ${updateResult ? "Success" : "Failed"}`);
  } catch (error) {
    console.log(`❌ Error caught: ${error}`);
  }
}

// Main example runner
async function runAllExamples() {
  console.log("🚀 DepthAI Client Library Examples\n");
  console.log("=".repeat(50));

  const examples = [
    { name: "Basic Status", fn: basicStatusExample },
    { name: "Custom Monitoring", fn: customMonitoringExample },
    { name: "IMU Analysis", fn: imuAnalysisExample },
    { name: "Frame Monitoring", fn: frameMonitoringExample },
    { name: "Custom Dashboard", fn: customDashboardExample },
    { name: "Config Management", fn: configManagementExample },
    { name: "Health Monitoring", fn: healthMonitoringExample },
    { name: "Data Export", fn: dataExportExample },
    { name: "Custom Client", fn: customClientExample },
    { name: "Utility Functions", fn: utilityFunctionsExample },
    { name: "Error Handling", fn: errorHandlingExample },
  ];

  for (const example of examples) {
    try {
      console.log(`\n📋 Running: ${example.name}`);
      console.log("-".repeat(30));
      await example.fn();
      console.log("✅ Completed successfully");
    } catch (error) {
      console.log(`❌ Error in ${example.name}: ${error}`);
    }

    // Small delay between examples
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n🎉 All examples completed!");
  console.log("\nGenerated files:");
  console.log("  - my-custom-dashboard.html");
  console.log("  - export-data.json");
  console.log("  - system-report.html");
  console.log("  - status-page.html");
  console.log("  - imu-analysis.html (if IMU data available)");
}

// Run examples if this file is executed directly
if (import.meta.main) {
  await runAllExamples();
}

// Export examples for individual use
export {
  basicStatusExample,
  customMonitoringExample,
  imuAnalysisExample,
  frameMonitoringExample,
  customDashboardExample,
  configManagementExample,
  healthMonitoringExample,
  dataExportExample,
  customClientExample,
  utilityFunctionsExample,
  errorHandlingExample,
  runAllExamples,
};
