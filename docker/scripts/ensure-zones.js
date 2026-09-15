"use strict";

const { execSync } = require("child_process");

function osType() {
  try {
    return execSync('docker info --format "{{.OSType}}"', {
      encoding: "utf8",
    }).trim();
  } catch {
    return "linux";
  }
}

// Windows containers: driver = nat (bridge plugin does not exist)
const type = osType();
const driver =
  process.env.DOCKER_NETWORK_DRIVER || (type === "windows" ? "nat" : "bridge");
const zones = ["zone-frontend", "zone-backend", "zone-platform", "zone-data"];

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (err) {
    return (err.stdout || "") + (err.stderr || "");
  }
}

console.log(`[zones] engine OSType=${type} driver=${driver}`);

for (const name of zones) {
  let found = false;
  try {
    execSync(`docker network inspect ${name}`, { stdio: "ignore" });
    found = true;
  } catch {
    found = false;
  }

  if (found) {
    console.log(`[zones] exists ${name}`);
    continue;
  }

  execSync(
    `docker network create --driver ${driver} --label demo.zone=${name.replace("zone-", "")} ${name}`,
    { stdio: "inherit" }
  );
  console.log(`[zones] created ${name} driver=${driver}`);
}

console.log("[zones] ready:", zones.join(", "));
