#!/usr/bin/env bun
/**
 * DepthAI CLI Application
 *
 * Command-line interface for the DepthAI daemon using the separated client library
 */

import { write as writeFile, spawn } from "bun";
import DepthAIClient, { DepthAIUtils } from "./client.js";
import HTMLTemplates from "./templates.js";

class DepthAICLI {
  private client: DepthAIClient;

  constructor() {
    this.client = new DepthAIClient();
  }

  async run(args: string[]) {
    const command = args[2] || "status";

    try {
      switch (command) {
        case "status":
          await this.showStatus();
          break;
        case "monitor":
          await this.monitorStatus();
          break;
        case "config":
          await this.showConfig();
          break;
        case "imu":
          const count = parseInt(args[3]) || 5;
          await this.showIMUData(count);
          break;
        case "imu-analysis":
          const samples = parseInt(args[3]) || 100;
          await this.showIMUAnalysis(samples);
          break;
        case "frames":
          const frameCount = parseInt(args[3]) || 10;
          await this.showFrames(frameCount);
          break;
        case "logs":
          const lineCount = parseInt(args[3]) || 20;
          await this.showLogs(lineCount);
          break;
        case "export":
          const outputPath = args[3] || `depthai-export-${Date.now()}.json`;
          await this.exportData(outputPath);
          break;
        case "health":
          await this.checkHealth();
          break;
        case "set-fps":
          const fps = parseInt(args[3]);
          if (fps && fps > 0 && fps <= 60) {
            await this.setFPS(fps);
          } else {
            console.error("❌ Invalid FPS value. Must be between 1 and 60.");
          }
          break;
        case "plot-imu":
          const plotSamples = parseInt(args[3]) || 100;
          const plotOutput = args[4];
          await this.plotIMUData(plotSamples, plotOutput);
          break;
        case "stream":
          const frameType = args[3] || "rgb";
          await this.streamFrames(frameType);
          break;
        case "display":
          const framePath = args[3];
          if (framePath) {
            await this.displayFrame(framePath);
          } else {
            console.error("❌ Frame path required");
          }
          break;
        case "dashboard":
          const dashPath = args[3];
          await this.createDashboard(dashPath);
          break;
        case "report":
          const reportPath = args[3];
          await this.generateReport(reportPath);
          break;
        case "status-page":
          const statusPagePath = args[3];
          await this.createStatusPage(statusPagePath);
          break;
        default:
          this.showHelp();
      }
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  }

  async showStatus() {
    console.log("🔍 DepthAI Daemon Status\n");

    const status = await this.client.getStatus();
    if (!status) {
      console.log("❌ Daemon not running or status unavailable");
      return;
    }

    const stats = status.stats;
    console.log(
      `📊 Service Status: ${status.status === "running" ? "✅ Running" : "❌ Stopped"}`
    );
    console.log(`🆔 Process ID: ${status.pid}`);
    console.log(
      `⏱️  Uptime: ${DepthAIUtils.formatUptime(stats.uptime_seconds)}`
    );
    console.log(`🎬 Total Frames: ${stats.total_frames.toLocaleString()}`);
    console.log(`📈 Current FPS: ${stats.current_fps.toFixed(1)}`);
    console.log(`📊 Average FPS: ${stats.average_fps.toFixed(1)}`);
    console.log(`❌ Errors: ${stats.error_count}`);

    if (stats.imu_data_count > 0) {
      console.log(`🧭 IMU Samples: ${stats.imu_data_count.toLocaleString()}`);
    }

    if (stats.current_temperature_c) {
      console.log(
        `🌡️  Temperature: ${stats.current_temperature_c.toFixed(1)}°C`
      );
    }

    console.log(
      `\n🏥 Health: ${status.health.status === "healthy" ? "✅ Healthy" : "⚠️ " + status.health.status}`
    );
    if (status.health.issues.length > 0) {
      console.log("⚠️  Issues:");
      status.health.issues.forEach((issue) => console.log(`   • ${issue}`));
    }
  }

  async monitorStatus() {
    console.log("🔄 Monitoring DepthAI Daemon (Press Ctrl+C to stop)\n");

    try {
      for await (const status of this.client.monitorStatus(2000)) {
        if (!status) {
          console.log("❌ Daemon not available");
          continue;
        }

        // Clear screen and show updated status
        console.clear();
        console.log("🔄 Real-time DepthAI Monitor\n");

        const stats = status.stats;
        console.log(
          `Status: ${status.status} | FPS: ${stats.current_fps.toFixed(1)} | Frames: ${stats.total_frames.toLocaleString()}`
        );

        if (stats.current_temperature_c) {
          console.log(
            `Temperature: ${stats.current_temperature_c.toFixed(1)}°C`
          );
        }

        if (stats.imu_data_count > 0) {
          console.log(`IMU: ${stats.imu_data_count.toLocaleString()} samples`);
        }

        console.log(
          `Health: ${status.health.status} | Uptime: ${DepthAIUtils.formatUptime(stats.uptime_seconds)}`
        );
        console.log(`Last update: ${new Date().toLocaleTimeString()}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("SIGINT")) {
        console.log("\n📴 Monitoring stopped");
      } else {
        throw error;
      }
    }
  }

  async showConfig() {
    console.log("⚙️  DepthAI Configuration\n");

    const config = await this.client.getConfig();
    if (!config) {
      console.log("❌ Configuration unavailable");
      return;
    }

    console.log("📷 Camera Settings:");
    console.log(`   Resolution: ${config.camera.rgb_resolution.join("x")}`);
    console.log(`   FPS: ${config.camera.rgb_fps}`);
    console.log(`   Depth: ${config.camera.depth_enabled ? "✅" : "❌"}`);
    console.log(`   IMU: ${config.camera.imu_enabled ? "✅" : "❌"}`);
    if (config.camera.imu_enabled) {
      console.log(`   IMU Frequency: ${config.camera.imu_frequency}Hz`);
    }

    console.log("\n🤖 AI Settings:");
    console.log(`   Model: ${config.ai.model_enabled ? "✅" : "❌"}`);
    if (config.ai.model_enabled) {
      console.log(`   Path: ${config.ai.model_path}`);
      console.log(`   Confidence: ${config.ai.confidence_threshold}`);
    }

    console.log("\n💾 Output Settings:");
    console.log(`   Save Frames: ${config.output.save_frames ? "✅" : "❌"}`);
    console.log(`   Directory: ${config.output.output_directory}`);
    console.log(`   Max Files: ${config.output.max_files}`);
  }

  async showIMUData(count: number) {
    console.log("🧭 Latest IMU Data\n");

    const imuData = await this.client.getLatestIMUData(count);
    if (imuData.length === 0) {
      console.log("❌ No IMU data available");
      return;
    }

    imuData.forEach((data, index) => {
      console.log(
        `📊 Sample ${index + 1} (${DepthAIUtils.formatTimestamp(data.timestamp)}):`
      );

      if (data.accelerometer) {
        const acc = data.accelerometer;
        const magnitude = DepthAIUtils.calculateMagnitude(acc.x, acc.y, acc.z);
        console.log(
          `   Accelerometer: x=${acc.x.toFixed(3)}, y=${acc.y.toFixed(3)}, z=${acc.z.toFixed(3)} m/s² (|a|=${magnitude.toFixed(3)})`
        );
        if (!DepthAIUtils.isAccelerometerNormal(magnitude)) {
          console.log(`   ⚠️  High acceleration detected`);
        }
      }

      if (data.gyroscope) {
        const gyro = data.gyroscope;
        const magnitude = DepthAIUtils.calculateMagnitude(
          gyro.x,
          gyro.y,
          gyro.z
        );
        console.log(
          `   Gyroscope: x=${gyro.x.toFixed(3)}, y=${gyro.y.toFixed(3)}, z=${gyro.z.toFixed(3)} rad/s (|ω|=${magnitude.toFixed(3)})`
        );
        if (!DepthAIUtils.isGyroscopeNormal(magnitude)) {
          console.log(`   ⚠️  High rotation detected`);
        }
      }

      if (data.magnetometer) {
        const mag = data.magnetometer;
        console.log(
          `   Magnetometer: x=${mag.x.toFixed(3)}, y=${mag.y.toFixed(3)}, z=${mag.z.toFixed(3)} µT`
        );
      }

      console.log();
    });
  }

  async showIMUAnalysis(samples: number) {
    console.log(`🧭 IMU Data Analysis (${samples} samples)\n`);

    const analysis = await this.client.analyzeIMUData(samples);
    if (!analysis) {
      console.log("❌ No IMU data available for analysis");
      return;
    }

    console.log(`📊 Analysis Results:`);
    console.log(`   Sample Count: ${analysis.sample_count}`);

    console.log("\n📈 Accelerometer Statistics (m/s²):");
    console.log(
      `   X-axis: μ=${analysis.accelerometer.x_mean.toFixed(3)}, σ=${analysis.accelerometer.x_std.toFixed(3)}`
    );
    console.log(
      `   Y-axis: μ=${analysis.accelerometer.y_mean.toFixed(3)}, σ=${analysis.accelerometer.y_std.toFixed(3)}`
    );
    console.log(
      `   Z-axis: μ=${analysis.accelerometer.z_mean.toFixed(3)}, σ=${analysis.accelerometer.z_std.toFixed(3)}`
    );

    console.log("\n🌀 Gyroscope Statistics (rad/s):");
    console.log(
      `   X-axis: μ=${analysis.gyroscope.x_mean.toFixed(3)}, σ=${analysis.gyroscope.x_std.toFixed(3)}`
    );
    console.log(
      `   Y-axis: μ=${analysis.gyroscope.y_mean.toFixed(3)}, σ=${analysis.gyroscope.y_std.toFixed(3)}`
    );
    console.log(
      `   Z-axis: μ=${analysis.gyroscope.z_mean.toFixed(3)}, σ=${analysis.gyroscope.z_std.toFixed(3)}`
    );

    if (analysis.magnetometer) {
      console.log("\n🧲 Magnetometer Statistics (µT):");
      console.log(
        `   X-axis: μ=${analysis.magnetometer.x_mean.toFixed(3)}, σ=${analysis.magnetometer.x_std.toFixed(3)}`
      );
      console.log(
        `   Y-axis: μ=${analysis.magnetometer.y_mean.toFixed(3)}, σ=${analysis.magnetometer.y_std.toFixed(3)}`
      );
      console.log(
        `   Z-axis: μ=${analysis.magnetometer.z_mean.toFixed(3)}, σ=${analysis.magnetometer.z_std.toFixed(3)}`
      );
    }
  }

  async showFrames(count: number) {
    console.log("🎬 Latest Frames\n");

    const rgbFrames = await this.client.getLatestFrames(count, "rgb");
    const depthFrames = await this.client.getLatestFrames(count, "depth");

    if (rgbFrames.length === 0 && depthFrames.length === 0) {
      console.log("❌ No frames available");
      return;
    }

    if (rgbFrames.length > 0) {
      console.log(`📷 RGB Frames (${rgbFrames.length} found):`);
      rgbFrames.forEach((frame, index) => {
        console.log(`   ${index + 1}. ${frame.split("/").pop()}`);
      });
    }

    if (depthFrames.length > 0) {
      console.log(`\n🔍 Depth Frames (${depthFrames.length} found):`);
      depthFrames.forEach((frame, index) => {
        console.log(`   ${index + 1}. ${frame.split("/").pop()}`);
      });
    }
  }

  async showLogs(lines: number) {
    console.log(`📝 Recent Logs (${lines} lines)\n`);

    const logs = await this.client.getLogs(lines);
    if (logs.length === 0) {
      console.log("❌ No logs available");
      return;
    }

    logs.forEach((log) => console.log(log));
  }

  async exportData(outputPath: string) {
    console.log("💾 Exporting DepthAI data...");

    const success = await this.client.saveExportData(outputPath);
    if (success) {
      console.log(`✅ Export completed: ${outputPath}`);
    } else {
      console.log("❌ Export failed");
    }
  }

  async checkHealth() {
    console.log("🏥 Health Check\n");

    const isHealthy = await this.client.isHealthy();
    console.log(`Status: ${isHealthy ? "✅ Healthy" : "❌ Unhealthy"}`);

    const status = await this.client.getStatus();
    if (status?.health?.issues?.length) {
      console.log("\n⚠️  Issues:");
      status.health.issues.forEach((issue) => console.log(`   • ${issue}`));
    }
  }

  async setFPS(fps: number) {
    console.log(`🎬 Setting FPS to ${fps}...`);

    // Get current config to preserve other settings
    const currentConfig = await this.client.getConfig();
    if (!currentConfig) {
      console.log("❌ Could not read current configuration");
      return;
    }

    const success = await this.client.updateConfig({
      camera: {
        rgb_resolution: currentConfig.camera.rgb_resolution,
        rgb_fps: fps,
        depth_enabled: currentConfig.camera.depth_enabled,
        imu_enabled: currentConfig.camera.imu_enabled,
        imu_frequency: currentConfig.camera.imu_frequency,
      },
    });

    if (success) {
      console.log("✅ FPS updated");
    } else {
      console.log("❌ Failed to update FPS");
    }
  }

  async plotIMUData(samples: number, outputPath?: string) {
    console.log(`📊 Generating IMU plot for ${samples} samples...`);

    const analysis = await this.client.analyzeIMUData(samples);
    if (!analysis) {
      console.log("❌ No IMU data available for plotting");
      return;
    }

    const html = HTMLTemplates.generateIMUPlot(analysis);
    const plotPath = outputPath || `imu-plot-${Date.now()}.html`;

    await writeFile(plotPath, html);
    console.log(`📊 IMU plot saved to: ${plotPath}`);

    // Try to open in browser
    this.openInBrowser(plotPath);
  }

  async streamFrames(frameType: string) {
    console.log(`🎬 Streaming ${frameType} frames. Press Ctrl+C to stop.`);

    try {
      for await (const frameInfo of this.client.streamFrames(frameType, 100)) {
        if (frameInfo) {
          const sizeStr = DepthAIUtils.formatBytes(frameInfo.size);
          console.log(
            `📸 [${frameInfo.timestamp.toLocaleTimeString()}] New ${frameType}: ${frameInfo.fileName} (${sizeStr})`
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("SIGINT")) {
        console.log("\n📴 Frame streaming stopped");
      } else {
        throw error;
      }
    }
  }

  async displayFrame(framePath: string) {
    console.log(`📷 Displaying frame: ${framePath}`);

    const frameInfo = await this.client.displayFrame(framePath);
    if (frameInfo) {
      console.log(`   Size: ${DepthAIUtils.formatBytes(frameInfo.size)}`);
      console.log(
        `   Modified: ${frameInfo.modified ? DepthAIUtils.formatTimestamp(frameInfo.modified) : "Unknown"}`
      );
      if (frameInfo.info) {
        console.log(`   Info: ${frameInfo.info}`);
      }
      console.log("📖 Frame opened in default viewer");
    }
  }

  async createDashboard(outputPath?: string) {
    console.log("📊 Creating live monitoring dashboard...");

    const html = HTMLTemplates.generateLiveDashboard();
    const dashPath = outputPath || `depthai-dashboard-${Date.now()}.html`;

    await writeFile(dashPath, html);
    console.log(`📊 Dashboard created: ${dashPath}`);

    // Try to open in browser
    this.openInBrowser(dashPath);
  }

  async generateReport(outputPath?: string) {
    console.log("📋 Generating comprehensive system report...");

    const exportData = await this.client.exportData();
    const html = HTMLTemplates.generateSystemReport(exportData);
    const reportPath = outputPath || `depthai-report-${Date.now()}.html`;

    await writeFile(reportPath, html);
    console.log(`📋 System report generated: ${reportPath}`);

    // Try to open in browser
    this.openInBrowser(reportPath);
  }

  async createStatusPage(outputPath?: string) {
    console.log("📄 Creating status page...");

    const status = await this.client.getStatus();
    const html = HTMLTemplates.generateStatusPage(status);
    const statusPath = outputPath || `depthai-status-${Date.now()}.html`;

    await writeFile(statusPath, html);
    console.log(`📄 Status page created: ${statusPath}`);
    console.log(`💡 This page auto-refreshes every 5 seconds`);

    // Try to open in browser
    this.openInBrowser(statusPath);
  }

  private async openInBrowser(filePath: string) {
    console.log(`🌐 Opening in browser: file://${process.cwd()}/${filePath}`);

    try {
      const proc = spawn(["xdg-open", filePath], { stdio: "ignore" });
      proc.unref();
    } catch {
      console.log("💡 Tip: Copy the file path to your browser to view");
    }
  }

  showHelp() {
    console.log("📖 DepthAI CLI Help\n");
    console.log("Usage: bun cli.ts [command] [options]\n");
    console.log("Commands:");
    console.log("  status                  - Show current daemon status");
    console.log("  monitor                 - Monitor daemon in real-time");
    console.log("  config                  - Show configuration");
    console.log(
      "  imu [count]             - Show latest IMU data (default: 5)"
    );
    console.log(
      "  imu-analysis [N]        - Analyze N IMU samples (default: 100)"
    );
    console.log("  frames [count]          - List recent frames (default: 10)");
    console.log(
      "  logs [lines]            - Show recent log lines (default: 20)"
    );
    console.log("  export [file]           - Export all data to JSON");
    console.log("  health                  - Check daemon health");
    console.log("  set-fps N               - Set camera FPS to N (1-60)");
    console.log(
      "  plot-imu [N] [file]     - Generate HTML plot of N IMU samples"
    );
    console.log("  stream [type]           - Stream frames (rgb/depth)");
    console.log("  display [path]          - Display frame information");
    console.log("  dashboard [file]        - Create live monitoring dashboard");
    console.log(
      "  report [file]           - Generate comprehensive HTML report"
    );
    console.log(
      "  status-page [file]      - Create auto-refreshing status page"
    );
    console.log("  help                    - Show this help");
    console.log("\nFeatures:");
    console.log("  🎬 Frame streaming and analysis");
    console.log("  🧭 IMU data analysis with statistics");
    console.log("  📊 Interactive HTML plots and dashboards");
    console.log("  📋 Comprehensive system reports");
    console.log("  🔄 Real-time monitoring");
    console.log("  ⚙️  Configuration management");
    console.log("\nExamples:");
    console.log("  bun cli.ts status                    # Quick status check");
    console.log(
      "  bun cli.ts monitor                   # Real-time monitoring"
    );
    console.log(
      "  bun cli.ts plot-imu 200              # Plot 200 IMU samples"
    );
    console.log(
      "  bun cli.ts dashboard my-dash.html    # Create custom dashboard"
    );
    console.log("  bun cli.ts stream rgb                # Stream RGB frames");
  }
}

// Run CLI if this file is executed directly
if (import.meta.main) {
  const cli = new DepthAICLI();

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    console.log("\n👋 Goodbye!");
    process.exit(0);
  });

  await cli.run(process.argv);
}

export { DepthAICLI };
export default DepthAICLI;
