"use strict";

/**
 * Pick Windows vs Linux compose path from `docker info OSType`.
 * Usage: node docker/scripts/docker-up.js
 */
const { execSync } = require("child_process");
const path = require("path");

function osType() {
  try {
    return execSync('docker info --format "{{.OSType}}"', { encoding: "utf8" }).trim();
  } catch {
    return "linux";
  }
}

const root = path.resolve(__dirname, "../..");
const type = osType();
const script = type === "windows" ? "docker:up:windows" : "docker:up:linux";

console.log(`[docker-up] engine OSType=${type} → npm run ${script}`);
execSync(`npm run ${script}`, { cwd: root, stdio: "inherit", env: process.env });
