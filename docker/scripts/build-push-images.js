"use strict";

/**
 * Cross-platform build (+ optional push) for frontend/backend images.
 *
 *   node docker/scripts/build-push-images.js --platform linux --push
 *   # luôn tag :demo (override: --tag / IMAGE_TAG)
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) {
    return process.argv[i + 1];
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sh(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

function dockerInfoOs() {
  try {
    return execSync('docker info --format "{{.OSType}}"', {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

const platform = arg("platform", process.env.IMAGE_PLATFORM || "linux");
const registry =
  process.env.IMAGE_REGISTRY || "registry.portlogics.com.vn";
const imageBase =
  process.env.IMAGE_BASE ||
  (platform === "windows"
    ? `${registry}/demo-smtp/win`
    : `${registry}/demo-smtp/linux`);
const tag = arg("tag", process.env.IMAGE_TAG) || "demo";
const windowsBase =
  process.env.WINDOWS_BASE ||
  "mcr.microsoft.com/windows/servercore:ltsc2019";
const doPush = hasFlag("push") || process.env.IMAGE_PUSH === "1";
const alsoLatest = hasFlag("latest") || process.env.IMAGE_ALSO_LATEST === "1";

const osType = dockerInfoOs();
if (platform === "windows" && osType !== "windows") {
  console.error(
    `Docker OSType=${osType}. Switch to Windows containers for --platform windows.`
  );
  process.exit(1);
}
if (platform === "linux" && osType !== "linux") {
  console.error(
    `Docker OSType=${osType}. Switch to Linux containers for --platform linux.`
  );
  process.exit(1);
}

const services = [
  {
    name: "gateway",
    dockerfile: `docker/backend/Dockerfile.${platform}`,
    buildArgs: [`SERVICE=gateway`],
  },
  {
    name: "recaptcha-service",
    dockerfile: `docker/backend/Dockerfile.${platform}`,
    buildArgs: [`SERVICE=recaptcha-service`],
  },
  {
    name: "smtp-service",
    dockerfile: `docker/backend/Dockerfile.${platform}`,
    buildArgs: [`SERVICE=smtp-service`],
  },
  {
    name: "frontend-web",
    dockerfile: `docker/frontend/Dockerfile.${platform}`,
    buildArgs: [],
  },
];

console.log(`Platform=${platform} ImageBase=${imageBase} Tag=${tag} Push=${doPush}`);

const images = [];

for (const svc of services) {
  const df = path.join(root, svc.dockerfile);
  if (!fs.existsSync(df)) {
    console.error(`Missing ${svc.dockerfile}`);
    process.exit(1);
  }
  const image = `${imageBase}/${svc.name}:${tag}`;
  const tags = [`-t ${image}`];
  if (alsoLatest) {
    tags.push(`-t ${imageBase}/${svc.name}:latest`);
  }
  const buildArgs = svc.buildArgs.map((a) => `--build-arg ${a}`);
  if (platform === "windows") {
    buildArgs.push(`--build-arg WINDOWS_BASE=${windowsBase}`);
  }
  sh(
    `docker build -f ${svc.dockerfile} ${tags.join(" ")} ${buildArgs.join(" ")} .`
  );
  images.push(image);
  if (alsoLatest) {
    images.push(`${imageBase}/${svc.name}:latest`);
  }
}

if (doPush) {
  if (process.env.REGISTRY_USER && process.env.REGISTRY_PASSWORD) {
    sh(
      `echo ${JSON.stringify(process.env.REGISTRY_PASSWORD)} | docker login ${registry} -u ${process.env.REGISTRY_USER} --password-stdin`
    );
  } else {
    console.log(`Assume already logged in to ${registry}`);
  }
  for (const img of [...new Set(images)]) {
    sh(`docker push ${img}`);
  }
}

console.log("\nServer pull:");
for (const svc of services) {
  console.log(`  docker pull ${imageBase}/${svc.name}:${tag}`);
}
console.log(`\nOr set IMAGE_TAG=${tag} then: npm run docker:pull:up`);
