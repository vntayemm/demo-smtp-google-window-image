"use strict";

const { execSync } = require("child_process");

const driver = process.env.DOCKER_NETWORK_DRIVER || "bridge";
const zones = ["zone-frontend", "zone-backend", "zone-platform", "zone-data"];

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (err) {
    return (err.stdout || "") + (err.stderr || "");
  }
}

for (const name of zones) {
  const exists = run(`docker network ls --format "{{.Name}}" | findstr /X /C:"${name}"`);
  // findstr may not exist on bash — also try grep via docker inspect
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
