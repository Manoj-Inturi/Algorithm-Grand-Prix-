const assert = require("assert");
const http = require("http");

function makeExpressStub() {
    const express = function () {
        const stack = [];

        function app(req, res) {
            dispatch(0, null, req, res);
        }

        app._stack = stack;
        app.use = middleware => stack.push({ type: "middleware", handler: middleware });
        app.get = (route, handler) => stack.push({ type: "route", method: "GET", route, handler });
        app.post = (route, handler) => stack.push({ type: "route", method: "POST", route, handler });
        app.listen = (port, host, callback) => {
            const server = http.createServer(app).listen(port, host, callback);
            return server;
        };

        async function dispatch(index, error, req, res) {
            if (index >= stack.length) {
                if (error) {
                    res.statusCode = error.status || 500;
                    res.end(JSON.stringify({ ok: false, message: error.message }));
                } else {
                    res.statusCode = 404;
                    res.end("not found");
                }
                return;
            }

            const item = stack[index];
            if (item.type === "middleware") {
                const fn = item.handler;
                if (error && fn.length === 4) {
                    return fn(error, req, res, nextError);
                }
                if (error) return dispatch(index + 1, error, req, res);
                try {
                    return await fn(req, res, next, nextError);
                } catch (caught) {
                    return nextError(caught);
                }
            }

            if (error || req.method !== item.method || req.pathname !== item.route) {
                return dispatch(index + 1, error, req, res);
            }

            try {
                await item.handler(req, res, nextError);
            } catch (caught) {
                await nextError(caught);
            }

            function next(err) { return dispatch(index + 1, err || null, req, res); }
            function nextError(err) { return dispatch(index + 1, err, req, res); }
        }

        return app;
    };

    express.json = () => async (req, _res, next) => {
        if (req.method === "POST") {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const text = Buffer.concat(chunks).toString("utf8");
            try { req.body = text ? JSON.parse(text) : {}; }
            catch { req.body = {}; }
        } else {
            req.body = {};
        }
        next();
    };

    express.static = () => (_req, _res, next) => next();

    return express;
}

function patchResponse(req, res) {
    const originalEnd = res.end.bind(res);
    res.set = (key, value) => { res.setHeader(key, value); return res; };
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => {
        res.setHeader("Content-Type", "application/json");
        originalEnd(JSON.stringify(value));
    };
    res.type = value => { res.setHeader("Content-Type", value); return res; };
    res.send = value => originalEnd(String(value));
    res.sendFile = file => {
        const fs = require("fs");
        originalEnd(fs.readFileSync(file));
    };
    res.redirect = (status, location) => {
        if (typeof location === "undefined") { location = status; status = 302; }
        res.statusCode = status;
        res.setHeader("Location", location);
        originalEnd("");
    };
}

async function request(port, method, pathname, body, headers = {}) {
    return await new Promise((resolve, reject) => {
        const payload = body == null ? null : JSON.stringify(body);
        const req = http.request({
            host: "127.0.0.1",
            port,
            method,
            path: pathname,
            headers: {
                ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
                ...headers
            }
        }, res => {
            const chunks = [];
            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                let json = null;
                try { json = JSON.parse(text); } catch (_) {}
                resolve({ status: res.statusCode, headers: res.headers, text, json });
            });
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function main() {
    const Module = require("module");
    const fakeRoot = require("path").join(__dirname, ".runtime-stubs");
    require("fs").mkdirSync(require("path").join(fakeRoot, "node_modules", "express"), { recursive: true });
    require("fs").mkdirSync(require("path").join(fakeRoot, "node_modules", "qrcode"), { recursive: true });
    require("fs").writeFileSync(require("path").join(fakeRoot, "node_modules", "express", "index.js"), `module.exports = (${makeExpressStub.toString()})();`);
    require("fs").writeFileSync(require("path").join(fakeRoot, "node_modules", "qrcode", "index.js"), `module.exports = { toDataURL: async value => "QR:" + value };`);

    const previousNodePath = process.env.NODE_PATH;
    process.env.NODE_PATH = require("path").join(fakeRoot, "node_modules");
    Module._initPaths();

    process.env.VERCEL = "";
    process.env.AGP_STATE_NAMESPACE = `runtime-test-${Date.now()}`;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const app = require("../server.js");
    const server = require("http").createServer((req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");
        req.pathname = url.pathname;
        req.query = Object.fromEntries(url.searchParams.entries());
        req.protocol = "http";
        req.body = {};
        patchResponse(req, res);
        app(req, res);
    });

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    try {
        const health = await request(port, "GET", "/api/health");
        assert.strictEqual(health.status, 200);
        assert.strictEqual(health.json.ok, true);
        assert.strictEqual(health.json.sharedState, false);

        const qr = await request(port, "GET", "/api/join");
        assert.strictEqual(qr.status, 200);
        assert.ok(qr.json.url.includes("/controller?join=new"), "QR target must always be the controller route");
        assert.ok(qr.json.url.includes("/controller?join=new"));
        assert.ok(qr.json.url.includes(":3000"));
        assert.ok(typeof qr.json.qr === "string" && qr.json.qr.length > 0, "QR image data must be returned");

        const screen = await request(port, "POST", "/api/realtime/join", { role: "screen", token: "screen-token-12345678" });
        assert.strictEqual(screen.status, 200);
        assert.strictEqual(screen.json.number, null);

        const p1 = await request(port, "POST", "/api/realtime/join", {
            role: "player",
            token: "player-token-12345678",
            name: "Manoj"
        });
        assert.strictEqual(p1.status, 200);
        assert.strictEqual(p1.json.number, 1);
        assert.strictEqual(p1.json.name, "Manoj");

        const p2 = await request(port, "POST", "/api/realtime/join", {
            role: "player",
            token: "player-token-22345678",
            name: "Ravi"
        });
        assert.strictEqual(p2.status, 200);
        assert.strictEqual(p2.json.number, 2);

        const state = await request(port, "POST", "/api/realtime/state", {
            role: "player",
            token: "player-token-12345678"
        });
        assert.strictEqual(state.status, 200);
        const me = state.json.state.players.find(player => player.number === 1);
        assert.strictEqual(me.name, "Manoj");

        const duplicate = await request(port, "POST", "/api/realtime/join", {
            role: "player",
            token: "player-token-32345678",
            name: "Manoj"
        });
        assert.strictEqual(duplicate.status, 200);
        assert.strictEqual(duplicate.json.number, 3);
        assert.strictEqual(duplicate.json.nameError.code, "NAME_CONFLICT");

        const leaveP2 = await request(port, "POST", "/api/realtime/leave", {
            role: "player",
            token: "player-token-22345678"
        });
        assert.strictEqual(leaveP2.status, 200);
        assert.strictEqual(leaveP2.json.removed, true);
        assert.strictEqual(leaveP2.json.state.players.some(player => player.number === 2), false);

        const replacementP2 = await request(port, "POST", "/api/realtime/join", {
            role: "player",
            token: "player-token-52345678",
            name: "Kiran"
        });
        assert.strictEqual(replacementP2.status, 200);
        assert.strictEqual(replacementP2.json.number, 2);

        const round = await request(port, "POST", "/api/realtime/event", {
            role: "screen",
            token: "screen-token-12345678",
            event: "new_round",
            data: {}
        });
        assert.strictEqual(round.status, 200);
        assert.strictEqual(round.json.ok, true);
        assert.strictEqual(round.json.state.round, 2);
        assert.deepStrictEqual(round.json.state.players, []);

        const staleAfterRound = await request(port, "POST", "/api/realtime/join", {
            role: "player",
            token: "player-token-12345678",
            name: "Manoj"
        });
        assert.strictEqual(staleAfterRound.status, 409);
        assert.strictEqual(staleAfterRound.json.code, "ROUND_REJOIN_REQUIRED");

        await new Promise(resolve => server.close(resolve));
        delete require.cache[require.resolve("../server.js")];
        process.env.VERCEL = "1";
        process.env.AGP_STATE_NAMESPACE = `vercel-test-${Date.now()}`;
        const vercelApp = require("../server.js");
        const vercelServer = require("http").createServer((req, res) => {
            const url = new URL(req.url, "http://example.vercel.app");
            req.pathname = url.pathname;
            req.query = Object.fromEntries(url.searchParams.entries());
            req.protocol = "https";
            req.body = {};
            patchResponse(req, res);
            vercelApp(req, res);
        });
        await new Promise(resolve => vercelServer.listen(0, "127.0.0.1", resolve));
        const vercelPort = vercelServer.address().port;

        const vercelQr = await request(vercelPort, "GET", "/api/join", null, { host: "algorithm-grand-prix.example" });
        assert.strictEqual(vercelQr.status, 200, "QR should not depend on Redis");
        assert.strictEqual(vercelQr.json.url, "https://algorithm-grand-prix.example/controller?join=new");

        const blockedJoin = await request(vercelPort, "POST", "/api/realtime/join", {
            role: "player",
            token: "player-token-42345678",
            name: "Cloud"
        });
        assert.strictEqual(blockedJoin.status, 503);
        assert.strictEqual(blockedJoin.json.code, "SHARED_STATE_REQUIRED");

        await new Promise(resolve => vercelServer.close(resolve));
        process.env.VERCEL = "";

        console.log("LOCAL + VERCEL CONFIGURATION RUNTIME CHECKS PASSED");
    } finally {
        await new Promise(resolve => server.close(resolve));
        if (previousNodePath === undefined) delete process.env.NODE_PATH;
        else process.env.NODE_PATH = previousNodePath;
        delete process.env.AGP_STATE_NAMESPACE;
        require("fs").rmSync(fakeRoot, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
