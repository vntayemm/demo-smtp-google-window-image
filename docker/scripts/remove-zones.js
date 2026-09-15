"use strict";

const { execSync } = require("child_process");

const zones = ["zone-frontend", "zone-backend", "zone-platform", "zone-data"];

for (const name of zones) {
  try {
    execSync(`docker network rm ${name}`, { stdio: "inherit" });
    console.log(`[zones] removed ${name}`);
  } catch {
    console.log(`[zones] skip ${name}`);
  }
}
