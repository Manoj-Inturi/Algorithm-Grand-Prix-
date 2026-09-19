const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const server = read("server.js");
const indexHtml = read("public/index.html");
const controllerHtml = read("public/controller.html");
const screenHtml = read("public/screen.html");
const controllerJs = read("public/js/controller.js");
const screenJs = read("public/js/screen.js");
const realtimeJs = read("public/js/realtime.js");
const vercel = JSON.parse(read("vercel.json"));

assert.ok(server.includes("module.exports = app"), "Vercel needs the Express app exported");
assert.ok(server.includes('app.listen(PORT, "0.0.0.0"'), "local Node start should still bind to all interfaces");
assert.ok(server.includes("VERCEL_DEPLOYMENT_ID"), "shared state must be isolated per Vercel deployment");
assert.ok(server.includes("VERCEL_URL"), "deployment URL should be a safe fallback namespace");
assert.ok(server.includes('const STATE_VERSION = "v4"'), "state protocol version should be bumped");
assert.ok(server.includes("UPSTASH_REDIS_REST_URL") && server.includes("UPSTASH_REDIS_REST_TOKEN"), "Upstash REST credentials are missing");

assert.ok(!server.includes("mkdirSync("), "server must not create runtime directories on Vercel");
assert.ok(!server.includes("appendFileSync("), "server must not write runtime files on Vercel");
assert.ok(!server.includes("socket.io/socket.io"), "old Socket.IO browser loader must be gone");
assert.ok(!controllerHtml.includes("/socket.io/socket.io.js"), "controller must not load the old Socket.IO client");
assert.ok(!screenHtml.includes("/socket.io/socket.io.js"), "screen must not load the old Socket.IO client");

assert.ok(server.includes('app.get("/screen"'), "clean screen route missing");
assert.ok(server.includes('app.get("/controller"'), "clean controller route missing");
assert.ok(server.includes('app.get("/join"'), "join alias missing");
assert.ok(server.includes('app.get("/screen.html"'), "screen HTML redirect missing");
assert.ok(server.includes('app.get("/controller.html"'), "controller HTML redirect missing");

assert.ok(server.includes('app.get("/api/join"'), "QR API missing");
assert.ok(server.includes("QRCode.toDataURL(joinUrl"), "QR generation missing");
assert.ok(server.includes("buildJoinUrlFromRequest"), "deployment-aware join URL helper missing");
assert.ok(server.includes("normalizeJoinUrl"), "JOIN_URL support missing");

assert.ok(server.includes('app.post("/api/realtime/join"'), "realtime join endpoint missing");
assert.ok(server.includes('app.post("/api/realtime/event"'), "realtime event endpoint missing");
assert.ok(server.includes('app.post("/api/realtime/state"'), "realtime state POST endpoint missing");
assert.ok(server.includes('app.post("/api/realtime/heartbeat"'), "heartbeat endpoint missing");
assert.ok(server.includes('"SHARED_STATE_REQUIRED"'), "Vercel Redis configuration failure should be explicit");
assert.ok(server.includes('code = "REDIS_ERROR"'), "Redis errors should be classified");

assert.ok(realtimeJs.includes('"agp.playerToken.v4"'), "player session token should be versioned");
assert.ok(realtimeJs.includes('"agp.screenToken.v4"'), "screen session token should be versioned");
assert.ok(realtimeJs.includes('body: JSON.stringify({ role, token, name: savedName })'), "saved player name should be sent during join");
assert.ok(realtimeJs.includes('request("/api/realtime/state"'), "polling state endpoint missing");
assert.ok(realtimeJs.includes('method: "POST"'), "realtime state should avoid putting session tokens in query strings");

assert.ok(controllerJs.includes('createRealtimeClient("player")'), "controller realtime client missing");
assert.ok(controllerJs.includes('socket.timeout(6000).emit("player_name"'), "name save must have a bounded acknowledgement");
assert.ok(controllerJs.includes('data?.name'), "controller should restore the server-confirmed name");
assert.ok(controllerJs.includes('SHARED_STATE_REQUIRED'), "controller should explain missing Redis instead of generic failure");
assert.ok(controllerJs.includes('localStorage.getItem("agp.playerName")'), "player name persistence missing");

assert.ok(screenJs.includes('createRealtimeClient("screen")'), "screen realtime client missing");
assert.ok(screenJs.includes('fetch("/api/join"'), "QR should use the current deployment request URL");
assert.ok(screenJs.includes('const fallback = `${location.origin}/controller`'), "QR fallback should point to the mobile controller");
assert.ok(!screenJs.includes("/api/join?origin="), "QR should not depend on a client-supplied deployment origin");

for (const id of [
    "round-number", "race-status", "new-round", "report-button", "report-card-modal",
    "join-qr", "qr-large", "event-log"
]) assert.ok(read("public/screen.html").includes(`id="${id}"`), `screen missing ${id}`);

for (const id of [
    "player-name", "save-name", "ready-button", "controller-maze-canvas",
    "mobile-results", "mobile-celebration", "connection-status"
]) assert.ok(controllerHtml.includes(`id="${id}"`), `controller missing ${id}`);

assert.ok(indexHtml.includes('href="/screen"'), "index must link directly to /screen");
assert.ok(indexHtml.includes('href="/controller"'), "index must link directly to /controller");
assert.ok(indexHtml.includes('"@type": "WebApplication"'), "structured SEO data missing");
assert.strictEqual(fs.readdirSync(root).some(name => name.endsWith(".txt")), false, "project root should not contain extra txt files");
assert.ok(indexHtml.includes('name="description"'), "SEO description missing");
assert.ok(indexHtml.includes('name="robots" content="index,follow'), "landing page should be indexable");
assert.ok(indexHtml.includes('href="/favicon.svg"'), "favicon missing");
assert.ok(controllerHtml.includes('name="robots" content="noindex,nofollow"'));
assert.ok(screenHtml.includes('name="robots" content="noindex,nofollow"'));
assert.ok(!screenHtml.includes('src="js/'), "screen asset URLs must work on /screen/");
assert.ok(!controllerHtml.includes('src="js/'), "controller asset URLs must work on /controller/");
assert.ok(!screenHtml.includes('href="css/'), "screen stylesheet URLs must work on /screen/");
assert.ok(!controllerHtml.includes('href="css/'), "controller stylesheet URLs must work on /controller/");
assert.ok(server.includes('app.get("/robots.txt"'));
assert.ok(server.includes('app.get("/sitemap.xml"'));
assert.ok(fs.existsSync(path.join(root, "public", "favicon.svg")));

assert.deepStrictEqual(
    vercel.rewrites,
    [
        { source: "/screen", destination: "/screen.html" },
        { source: "/screen/", destination: "/screen.html" },
        { source: "/controller", destination: "/controller.html" },
        { source: "/controller/", destination: "/controller.html" }
    ],
    "clean Vercel routes must stay stable"
);

const helperStart = server.indexOf('const LOCAL_HOSTNAMES');
const helperEnd = server.indexOf('function sendApiError');
assert.ok(helperStart >= 0 && helperEnd > helperStart, "URL helper block not found");

const context = vm.createContext({
    URL,
    os: { networkInterfaces: () => ({ Ethernet: [{ family: "IPv4", internal: false, address: "192.168.1.55" }] }) },
    process: { env: {} },
    console,
    PORT: 3000,
    getLanAddress: () => "192.168.1.55",
    getLanAddresses: () => ["192.168.1.55"]
});
vm.runInContext(server.slice(helperStart, helperEnd), context, { filename: "server.js:url-helpers" });

assert.strictEqual(
    vm.runInContext('buildJoinOrigin({ host: "example.com", protocol: "https" })', context),
    "https://example.com"
);
assert.strictEqual(
    vm.runInContext('buildJoinOrigin({ host: "example.com", protocol: "https", originHint: "https://custom.example.com" })', context),
    "https://custom.example.com"
);
assert.strictEqual(
    vm.runInContext('buildJoinOrigin({ host: "localhost:3000", protocol: "http" })', context),
    "http://192.168.1.55:3000"
);

const cloudRequest = {
    headers: {
        host: "internal.vercel.host",
        "x-forwarded-host": "algorithm-grand-prix.vercel.app",
        "x-forwarded-proto": "https"
    },
    protocol: "http",
    query: {}
};
context.req = cloudRequest;
assert.strictEqual(
    vm.runInContext("buildJoinUrlFromRequest(req)", context),
    "https://algorithm-grand-prix.vercel.app/controller"
);

const customRequest = {
    headers: { host: "deployment.host", "x-forwarded-proto": "https" },
    protocol: "https",
    query: { origin: "https://my-custom-domain.example" }
};
context.req = customRequest;
assert.strictEqual(
    vm.runInContext("buildJoinUrlFromRequest(req)", context),
    "https://my-custom-domain.example/controller"
);

context.process.env.JOIN_URL = "https://fixed.example/join";
context.req = cloudRequest;
assert.strictEqual(
    vm.runInContext("buildJoinUrlFromRequest(req)", context),
    "https://fixed.example/join"
);

console.log("DEPLOYMENT / QR / VERCEL STATIC CHECKS PASSED");
