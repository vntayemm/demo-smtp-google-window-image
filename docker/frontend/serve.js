"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || "8080");
const gateway =
  process.env.DEMO_GATEWAY !== undefined ? process.env.DEMO_GATEWAY : "";

/** Same-origin /api → proxy sang gateway (cùng zone-frontend). */
const gatewayProxyHost = process.env.GATEWAY_PROXY_HOST || "gateway";
const gatewayProxyPort = Number(process.env.GATEWAY_PROXY_PORT || "7080");

function loadDotEnv() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const i = trimmed.indexOf("=");
    if (i <= 0) {
      continue;
    }
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnv();

function localConfig() {
  const enabled =
    (process.env.RECAPTCHA_ENABLED || "true").toLowerCase() === "true";
  return {
    recaptchaEnabled: enabled,
    siteKey: process.env.RECAPTCHA_SITE_KEY || "",
    jaegerUi: "http://127.0.0.1:16686",
    maxSendCount: Number(process.env.DEMO_MAX_SEND_COUNT || "5000"),
  };
}

function injectGateway(html) {
  const marker = 'var GATEWAY = window.DEMO_GATEWAY || "";';
  const replacement = `var GATEWAY = window.DEMO_GATEWAY || ${JSON.stringify(gateway)};`;
  return html.includes(marker) ? html.replace(marker, replacement) : html;
}

function proxyApi(req, res) {
  const options = {
    hostname: gatewayProxyHost,
    port: gatewayProxyPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${gatewayProxyHost}:${gatewayProxyPort}` },
    timeout: 8000,
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("timeout", () => {
    proxyReq.destroy(new Error("gateway timeout"));
  });
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  // Config local từ .env → widget reCAPTCHA hiện dù gateway publish port đang lỗi
  if (req.url && req.url.split("?")[0] === "/api/config") {
    const body = JSON.stringify(localConfig());
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(body);
    return;
  }

  if (req.url && req.url.startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }

  if (req.url === "/" || req.url === "/index.html") {
    const html = injectGateway(
      fs.readFileSync(path.join(__dirname, "index.html"), "utf8")
    );
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(port, "0.0.0.0", () => {
  const cfg = localConfig();
  console.log(
    `[frontend-web] http://0.0.0.0:${port} gateway=${gateway || "(same-origin /api)"} recaptcha=${cfg.recaptchaEnabled} siteKey=${cfg.siteKey ? "set" : "missing"}`
  );
});
