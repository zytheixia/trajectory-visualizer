#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { exec, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const PORT = 5173;

const args = process.argv.slice(2);
let targetPathArg = "";
let adapterArg = "auto";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--adapter" || args[i] === "-a") {
    adapterArg = args[i + 1] || "auto";
    i++;
  } else if (!targetPathArg && !args[i].startsWith("-")) {
    targetPathArg = args[i];
  }
}

if (!targetPathArg) {
  console.log(`
🚀 Agent Trajectory Visualizer CLI

用法:
  visualize <轨迹文件路径> [--adapter auto|claude|identity|mapping]
  npm run open -- <轨迹文件路径> [-a claude]

示例:
  visualize ./my_trace.json
  visualize /home/user/logs/agent_run.jsonl --adapter claude
  npm run open -- ./samples/business.json -a claude
  `);
  process.exit(0);
}

const resolvedPath = path.resolve(process.cwd(), targetPathArg);

if (!fs.existsSync(resolvedPath)) {
  console.error(`❌ 错误: 找不到指定路径的文件: ${resolvedPath}`);
  process.exit(1);
}

console.log(`📄 准备导入运行轨迹文件: ${resolvedPath}`);

// Helper to check if server is running
function isServerRunning(port) {
  return new Promise(resolve => {
    const req = http.request({ host: "localhost", port, path: "/index.html", method: "HEAD", timeout: 500 }, res => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// Helper to open default browser
function openBrowser(url) {
  console.log(`🌐 正在打开浏览器访问: ${url}`);
  const platform = process.platform;
  let cmd = `xdg-open "${url}"`;
  if (platform === "darwin") cmd = `open "${url}"`;
  else if (platform === "win32") cmd = `start "" "${url}"`;

  exec(cmd, err => {
    if (err) {
      console.log(`💡 您可以在浏览器中手动打开该地址: ${url}`);
    }
  });
}

async function main() {
  const running = await isServerRunning(PORT);
  const targetUrl = `http://localhost:${PORT}/?file=${encodeURIComponent(resolvedPath)}&adapter=${encodeURIComponent(adapterArg)}`;

  if (!running) {
    console.log(`📡 正在启动本地 Trajectory Visualizer 服务 (Port ${PORT})...`);
    const serverProcess = spawn("node", [path.join(rootDir, "scripts", "server.js")], {
      cwd: rootDir,
      detached: true,
      stdio: "ignore"
    });
    serverProcess.unref();

    setTimeout(() => {
      openBrowser(targetUrl);
      process.exit(0);
    }, 600);
  } else {
    openBrowser(targetUrl);
    process.exit(0);
  }
}

main();
