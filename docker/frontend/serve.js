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
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
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
  console.log(`[frontend-web] http://0.0.0.0:${port} gateway=${gateway || "(same-origin /api)"}`);
});
