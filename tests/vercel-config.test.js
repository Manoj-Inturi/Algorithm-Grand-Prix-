const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

assert.ok(server.includes("VERCEL_DEPLOYMENT_ID"));
assert.ok(server.includes("VERCEL_URL"));
assert.ok(server.includes("VERCEL_BRANCH_URL"));
assert.ok(server.includes('const STATE_KEY = `algorithm-grand-prix:${projectNamespace}:${STATE_VERSION}:state`;'));
assert.ok(server.includes('const IS_VERCEL = Boolean(process.env.VERCEL);'));
assert.ok(server.includes('"SHARED_STATE_REQUIRED"'));
assert.ok(server.includes('"REDIS_UNAVAILABLE"'));
assert.ok(server.includes('"STATE_BUSY"'));

console.log("VERCEL STATE ISOLATION / ERROR HANDLING CHECKS PASSED");
