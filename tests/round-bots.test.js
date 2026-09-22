const assert = require("assert");
const http = require("http");
const path = require("path");
const fs = require("fs");

function makeExpressStub() {
    const express = function () {
        const stack = [];
        function app(req, res) { dispatch(0, null, req, res); }
        app.use = middleware => stack.push({ type: "middleware", handler: middleware });
        app.get = (route, handler) => stack.push({ type: "route", method: "GET", route, handler });
        app.post = (route, handler) => stack.push({ type: "route", method: "POST", route, handler });
        async function dispatch(index, error, req, res) {
            if (index >= stack.length) {
                res.statusCode = error?.status || 404;
                return res.end(JSON.stringify(error ? (error.payload || { ok:false, message:error.message }) : { ok:false }));
            }
            const item = stack[index];
            if (item.type === "middleware") {
                if (error && item.handler.length !== 4) return dispatch(index + 1, error, req, res);
                try {
                    if (error) return await item.handler(error, req, res, err => dispatch(index+1, err, req, res));
                    return await item.handler(req, res, () => dispatch(index+1, null, req, res), err => dispatch(index+1, err, req, res));
                } catch (caught) { return dispatch(index+1, caught, req, res); }
            }
            if (error || req.method !== item.method || req.pathname !== item.route) return dispatch(index+1, error, req, res);
            try { await item.handler(req, res, err => dispatch(index+1, err, req, res)); }
            catch (caught) { await dispatch(index+1, caught, req, res); }
        }
        return app;
    };
    express.json = () => async (req, _res, next) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const text = Buffer.concat(chunks).toString("utf8");
        req.body = text ? JSON.parse(text) : {};
        next();
    };
    express.static = () => (_req, _res, next) => next();
    return express;
}

function patchResponse(res) {
    const originalEnd = res.end.bind(res);
    res.set = (key, value) => { res.setHeader(key, value); return res; };
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => { res.setHeader("Content-Type", "application/json"); originalEnd(JSON.stringify(value)); };
    res.type = value => { res.setHeader("Content-Type", value); return res; };
    res.send = value => originalEnd(String(value));
    res.redirect = (status, location) => { if (location === undefined) { location = status; status = 302; } res.statusCode = status; res.setHeader("Location", location); originalEnd(""); };
    res.sendFile = file => originalEnd(fs.readFileSync(file));
}

async function request(server, method, pathname, body) {
    return await new Promise((resolve, reject) => {
        const payload = body == null ? null : JSON.stringify(body);
        const req = http.request({ host:"127.0.0.1", port:server.address().port, method, path:pathname, headers:payload ? {"Content-Type":"application/json","Content-Length":Buffer.byteLength(payload)} : {} }, res => {
            const chunks=[];
            res.on("data", c=>chunks.push(c));
            res.on("end",()=>{ const text=Buffer.concat(chunks).toString("utf8"); let json=null; try{json=JSON.parse(text);}catch{} resolve({status:res.statusCode,json,text}); });
        });
        req.on("error",reject);
        if(payload) req.write(payload);
        req.end();
    });
}

async function main() {
    const Module = require("module");
    const fakeRoot = path.join(__dirname, ".runtime-bot-stubs");
    fs.mkdirSync(path.join(fakeRoot,"node_modules","express"), {recursive:true});
    fs.mkdirSync(path.join(fakeRoot,"node_modules","qrcode"), {recursive:true});
    fs.writeFileSync(path.join(fakeRoot,"node_modules","express","index.js"), `module.exports = (${makeExpressStub.toString()})();`);
    fs.writeFileSync(path.join(fakeRoot,"node_modules","qrcode","index.js"), `module.exports = { toDataURL: async value => "QR:" + value };`);
    const previousNodePath = process.env.NODE_PATH;
    process.env.NODE_PATH = path.join(fakeRoot,"node_modules");
    Module._initPaths();
    process.env.AGP_STATE_NAMESPACE = `bot-test-${Date.now()}`;
    process.env.VERCEL = "";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const serverApp = require("../server.js");
    const httpServer = http.createServer((req,res)=>{
        const u=new URL(req.url,"http://127.0.0.1");
        req.pathname=u.pathname; req.query=Object.fromEntries(u.searchParams); req.protocol="http"; patchResponse(res); serverApp(req,res);
    });
    await new Promise(resolve=>httpServer.listen(0,"127.0.0.1",resolve));
    try {
        const screen = await request(httpServer,"POST","/api/realtime/join",{role:"screen",token:"screen-token-12345678"});
        assert.strictEqual(screen.status,200);

        // Host can fill an empty lobby entirely with bots for a demo round.
        const fullBotLobby = await request(httpServer,"POST","/api/realtime/event",{role:"screen",token:"screen-token-12345678",event:"fill_bots"});
        assert.strictEqual(fullBotLobby.status,200);
        assert.strictEqual(fullBotLobby.json.state.players.length,4);
        assert.strictEqual(fullBotLobby.json.state.players.filter(p=>p.isBot).length,4);
        assert.strictEqual(fullBotLobby.json.state.raceState,"racing");

        const resetAfterBots = await request(httpServer,"POST","/api/realtime/event",{role:"screen",token:"screen-token-12345678",event:"race_finished",data:{ round:1, order:["BFS","DFS","DIJKSTRA","A*"], results:[] }});
        assert.strictEqual(resetAfterBots.status,200);
        const cleanRound = await request(httpServer,"POST","/api/realtime/event",{role:"screen",token:"screen-token-12345678",event:"new_round"});
        assert.strictEqual(cleanRound.status,200);
        assert.deepStrictEqual(cleanRound.json.state.players,[]);
        const p1 = await request(httpServer,"POST","/api/realtime/join",{role:"player",token:"player-one-12345678",name:"Alice"});
        const p2 = await request(httpServer,"POST","/api/realtime/join",{role:"player",token:"player-two-12345678",name:"Bob"});
        assert.strictEqual(p1.status,200); assert.strictEqual(p2.status,200);
        await request(httpServer,"POST","/api/realtime/event",{role:"player",token:"player-one-12345678",event:"algorithm_selected",data:{algorithm:"BFS"}});
        await request(httpServer,"POST","/api/realtime/event",{role:"player",token:"player-two-12345678",event:"algorithm_selected",data:{algorithm:"A*"}});
        const bots = await request(httpServer,"POST","/api/realtime/event",{role:"screen",token:"screen-token-12345678",event:"fill_bots"});
        assert.strictEqual(bots.status,200);
        assert.strictEqual(bots.json.state.players.length,4);
        assert.strictEqual(bots.json.state.players.filter(p=>p.isBot).length,2);
        assert.deepStrictEqual(bots.json.state.players.map(p=>p.algorithm).sort(), ["A*","BFS","DFS","DIJKSTRA"].sort());
        assert.strictEqual(bots.json.state.players.filter(p=>p.isBot && p.ready).length,2);
        assert.strictEqual(bots.json.state.players.filter(p=>p.isBot && ["BFS","DFS","DIJKSTRA","A*"].includes(p.prediction)).length,2);

        const ready1 = await request(httpServer,"POST","/api/realtime/event",{role:"player",token:"player-one-12345678",event:"player_ready",data:{algorithm:"BFS",heuristicWeight:1, walls:[], terrain:[], prediction:"BFS"}});
        const ready2 = await request(httpServer,"POST","/api/realtime/event",{role:"player",token:"player-two-12345678",event:"player_ready",data:{algorithm:"A*",heuristicWeight:1, walls:[], terrain:[], prediction:"A*"}});
        assert.strictEqual(ready1.status,200); assert.strictEqual(ready2.status,200);
        assert.strictEqual(ready2.json.state.raceState,"racing");

        // New round is blocked while live, then allowed after the screen publishes the finish.
        const blockedRound = await request(httpServer,"POST","/api/realtime/event",{role:"screen",token:"screen-token-12345678",event:"new_round"});
        assert.strictEqual(blockedRound.status,409);

        const finished = await request(httpServer,"POST","/api/realtime/event",{
            role:"screen",
            token:"screen-token-12345678",
            event:"race_finished",
            data:{ round:2, order:["BFS","A*","DFS","DIJKSTRA"], results:[] }
        });
        assert.strictEqual(finished.status,200);

        const newRound = await request(httpServer,"POST","/api/realtime/event",{role:"screen",token:"screen-token-12345678",event:"new_round"});
        assert.strictEqual(newRound.status,200);
        assert.deepStrictEqual(newRound.json.state.players, []);
        assert.strictEqual(newRound.json.state.round, 3);

        const stale = await request(httpServer,"POST","/api/realtime/join",{role:"player",token:"player-one-12345678",name:"Alice"});
        assert.strictEqual(stale.status,409);
        assert.strictEqual(stale.json.code,"ROUND_REJOIN_REQUIRED");

        const fresh = await request(httpServer,"POST","/api/realtime/join",{role:"player",token:"fresh-player-12345678",name:"Alice"});
        assert.strictEqual(fresh.status,200);
        assert.strictEqual(fresh.json.number,1);

        console.log("ROUND + BOT INTEGRATION TEST PASSED");
    } finally {
        httpServer.close();
        process.env.NODE_PATH = previousNodePath || "";
        fs.rmSync(fakeRoot,{recursive:true,force:true});
    }
}

main().catch(error=>{ console.error(error); process.exit(1); });
