const express = require("express");
const os = require("os");
const path = require("path");
const QRCode = require("qrcode");
const { MAZE_SIZE, MAZE_MAPS } = require("./public/js/maze/maps");
const { generateMaze } = require("./public/js/maze/generator");
const { buildPlayableMaze, isWallPlacementSafe } = require("./public/js/maze/safety");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const ALGORITHMS = ["BFS", "DFS", "DIJKSTRA", "A*"];
const PREDICTIONS = [...ALGORITHMS];
const START = { row: 1, col: 1 };
const GOAL = { row: MAZE_SIZE - 2, col: MAZE_SIZE - 2 };
const PLAYER_LIMIT = 4;
const PLAYER_TTL_MS = 20_000;
const HEARTBEAT_WRITE_INTERVAL_MS = 5_000;
const STATE_VERSION = "v4";
const IS_VERCEL = Boolean(process.env.VERCEL);
const DEPLOYMENT_ID = String(
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_URL ||
    process.env.VERCEL_BRANCH_URL ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "local"
);

const serverLogs = [];
const MAX_SERVER_LOGS = 120;
let localState = null;

app.use(express.json({ limit: "100kb" }));

const screenPage = path.join(PUBLIC_DIR, "screen.html");
const controllerPage = path.join(PUBLIC_DIR, "controller.html");

app.get("/screen.html", (_req, res) => res.redirect(308, "/screen"));
app.get("/controller.html", (_req, res) => res.redirect(308, "/controller"));
app.get("/screen", (_req, res) => res.sendFile(screenPage));
app.get("/screen/", (_req, res) => res.sendFile(screenPage));
app.get("/controller", (_req, res) => res.sendFile(controllerPage));
app.get("/controller/", (_req, res) => res.sendFile(controllerPage));
app.get("/join", (_req, res) => res.redirect(302, "/controller"));

app.use(express.static(PUBLIC_DIR));

function now() {
    return Date.now();
}

function timestamp() {
    return new Date().toLocaleTimeString([], { hour12: false });
}

function gpLog(level, event, details = {}) {
    const entry = { time: timestamp(), level, event, details };
    serverLogs.push(entry);
    if (serverLogs.length > MAX_SERVER_LOGS) serverLogs.shift();

    const suffix = Object.keys(details).length
        ? ` ${JSON.stringify(details)}`
        : "";
    console.log(`[${entry.time}] [${level.toUpperCase()}] ${event}${suffix}`);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getRedisConfig() {
    const url = String(
        process.env.UPSTASH_REDIS_REST_URL ||
        process.env.KV_REST_API_URL ||
        ""
    ).replace(/\/$/, "");

    const token = String(
        process.env.UPSTASH_REDIS_REST_TOKEN ||
        process.env.KV_REST_API_TOKEN ||
        ""
    );

    return url && token ? { url, token } : null;
}

const redisConfig = getRedisConfig();
const sharedStateEnabled = Boolean(redisConfig);
const projectNamespace = String(
    process.env.AGP_STATE_NAMESPACE ||
    [
        process.env.VERCEL_PROJECT_ID || "local",
        process.env.VERCEL_ENV || "local",
        DEPLOYMENT_ID
    ].join(":")
).replace(/[^a-zA-Z0-9:_-]/g, "-");
const STATE_KEY = `algorithm-grand-prix:${projectNamespace}:${STATE_VERSION}:state`;
const LOCK_KEY = `${STATE_KEY}:lock`;

async function redisCommand(command) {
    if (!redisConfig) throw new Error("Shared state is not configured.");

    let response;
    try {
        response = await fetch(redisConfig.url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${redisConfig.token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(command)
        });
    } catch (cause) {
        const error = new Error(`Redis network error: ${cause?.message || "request failed"}`);
        error.code = "REDIS_ERROR";
        error.status = 503;
        throw error;
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`Redis returned HTTP ${response.status}`);
    }

    if (!response.ok || data?.error) {
        const error = new Error(data?.error || `Redis returned HTTP ${response.status}`);
        error.code = "REDIS_ERROR";
        error.status = 503;
        throw error;
    }

    return data?.result;
}

async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireLock() {
    const token = `${process.pid}-${now()}-${Math.random().toString(36).slice(2)}`;

    for (let attempt = 0; attempt < 30; attempt++) {
        const result = await redisCommand([
            "SET",
            LOCK_KEY,
            token,
            "NX",
            "PX",
            8_000
        ]);

        if (result === "OK") return token;
        await sleep(75);
    }

    const error = new Error("The shared race state is busy. Please retry in a moment.");
    error.code = "STATE_LOCK_TIMEOUT";
    error.status = 503;
    throw error;
}

async function releaseLock() {
    try {
        await redisCommand(["DEL", LOCK_KEY]);
    } catch (error) {
        gpLog("warn", "STATE_LOCK_RELEASE_FAILED", { message: error.message });
    }
}

function chooseRandomMaze(excludeId = null) {
    const available = MAZE_MAPS.filter(map => map.id !== excludeId);
    const source = available.length ? available : MAZE_MAPS;
    return source[Math.floor(Math.random() * source.length)];
}

function createInitialState() {
    const firstMaze = chooseRandomMaze();
    return {
        version: STATE_VERSION,
        roundNumber: 1,
        currentMazeMap: {
            id: firstMaze.id,
            name: firstMaze.name,
            seed: firstMaze.seed
        },
        currentMaze: buildPlayableMaze(
            MAZE_SIZE,
            firstMaze.seed,
            START,
            GOAL,
            generateMaze
        ),
        raceState: "waiting",
        lastRaceResults: null,
        players: [],
        screen: null,
        updatedAt: now()
    };
}

async function ensureSharedState() {
    const raw = await redisCommand(["GET", STATE_KEY]);
    if (raw) return JSON.parse(raw);

    const initial = createInitialState();
    const setResult = await redisCommand([
        "SET",
        STATE_KEY,
        JSON.stringify(initial),
        "NX"
    ]);

    if (setResult === "OK") {
        gpLog("info", "SHARED_STATE_CREATED", {
            key: STATE_KEY,
            round: initial.roundNumber,
            map: initial.currentMazeMap.name
        });
        return initial;
    }

    const retry = await redisCommand(["GET", STATE_KEY]);
    if (!retry) throw new Error("SHARED_STATE_INIT_FAILED");
    return JSON.parse(retry);
}

async function readState() {
    if (!sharedStateEnabled) {
        if (!localState) localState = createInitialState();
        return clone(localState);
    }

    return ensureSharedState();
}

async function writeState(state) {
    state.updatedAt = now();

    if (!sharedStateEnabled) {
        localState = clone(state);
        return;
    }

    await redisCommand([
        "SET",
        STATE_KEY,
        JSON.stringify(state)
    ]);
}

async function mutateState(mutator) {
    if (!sharedStateEnabled) {
        if (!localState) localState = createInitialState();
        const working = clone(localState);
        const result = await mutator(working);
        working.updatedAt = now();
        localState = working;
        return { result, state: clone(working) };
    }

    const lockToken = await acquireLock();
    try {
        const current = await readState();
        const working = clone(current);
        const result = await mutator(working);
        await writeState(working);
        return { result, state: working };
    } finally {
        await releaseLock();
    }
}

function validToken(token) {
    return typeof token === "string" && /^[a-zA-Z0-9_-]{16,120}$/.test(token);
}

function validRole(role) {
    return role === "screen" || role === "player";
}

function findPlayer(state, token) {
    return state.players.find(player => player.token === token) || null;
}

function findPlayerByNumber(state, number) {
    return state.players.find(player => player.number === number) || null;
}

function playerPublic(player) {
    return {
        number: player.number,
        name: player.name,
        algorithm: player.algorithm,
        ready: Boolean(player.ready),
        walls: Array.isArray(player.walls) ? player.walls : [],
        terrain: Array.isArray(player.terrain) ? player.terrain : [],
        heuristicWeight: Number(player.heuristicWeight || 1),
        prediction: player.prediction || null
    };
}

function publicPlayers(state) {
    return state.players
        .slice()
        .sort((a, b) => a.number - b.number)
        .map(playerPublic);
}

function joinPayload(state) {
    return {
        ...state.currentMazeMap,
        size: MAZE_SIZE,
        maze: state.currentMaze,
        start: START,
        goal: GOAL,
        round: state.roundNumber
    };
}

function publicState(state) {
    return {
        maze: joinPayload(state),
        players: publicPlayers(state),
        raceState: state.raceState,
        round: state.roundNumber,
        results: state.lastRaceResults,
        updatedAt: state.updatedAt
    };
}

function cleanupExpiredPlayers(state) {
    if (state.raceState !== "waiting") return;

    const cutoff = now() - PLAYER_TTL_MS;
    const before = state.players.length;
    state.players = state.players.filter(player => Number(player.lastSeen || 0) >= cutoff);

    if (before !== state.players.length) {
        gpLog("info", "STALE_PLAYERS_CLEANED", {
            removed: before - state.players.length,
            remaining: state.players.length
        });
    }
}

function resetPlayerForRound(player) {
    player.algorithm = null;
    player.ready = false;
    player.walls = [];
    player.terrain = [];
    player.heuristicWeight = 1;
    player.prediction = null;
}

function resetRoundState(state, keepNames = true) {
    state.raceState = "waiting";
    state.lastRaceResults = null;
    for (const player of state.players) {
        if (!keepNames) player.name = "";
        resetPlayerForRound(player);
    }
}

function selectMazeInState(state, mazeMap, incrementRound) {
    if (!mazeMap) return false;

    state.currentMazeMap = {
        id: mazeMap.id,
        name: mazeMap.name,
        seed: mazeMap.seed
    };
    state.currentMaze = buildPlayableMaze(
        MAZE_SIZE,
        mazeMap.seed,
        START,
        GOAL,
        generateMaze
    );

    if (incrementRound) state.roundNumber += 1;
    resetRoundState(state, true);
    return true;
}

function validOpenCell(state, cell) {
    return cell &&
        Number.isInteger(cell.row) &&
        Number.isInteger(cell.col) &&
        cell.row >= 0 && cell.row < MAZE_SIZE &&
        cell.col >= 0 && cell.col < MAZE_SIZE &&
        Array.isArray(state.currentMaze) &&
        state.currentMaze[cell.row]?.[cell.col] === 0 &&
        !(cell.row === START.row && cell.col === START.col) &&
        !(cell.row === GOAL.row && cell.col === GOAL.col);
}

function cellClaimedByAnotherPlayer(state, row, col, token) {
    return state.players.some(player => {
        if (player.token === token) return false;
        return (player.walls || []).some(cell => cell.row === row && cell.col === col) ||
            (player.terrain || []).some(cell => cell.row === row && cell.col === col);
    });
}

function allPlacedWalls(state, excludeToken = null) {
    const result = [];
    for (const player of state.players) {
        if (player.token === excludeToken) continue;
        result.push(...(player.walls || []));
    }
    return result;
}

function safeWall(state, player, candidate, wallList = player.walls) {
    const globalWalls = [...allPlacedWalls(state, player.token), ...(wallList || [])];
    return isWallPlacementSafe(
        state.currentMaze,
        START,
        GOAL,
        globalWalls,
        candidate
    );
}

function sanitizeWalls(state, player, cells) {
    if (!Array.isArray(cells)) return [];
    const accepted = [];

    for (const raw of cells.slice(0, 2)) {
        const cell = {
            row: Number(raw?.row),
            col: Number(raw?.col)
        };

        if (!validOpenCell(state, cell)) continue;
        if (accepted.some(item => item.row === cell.row && item.col === cell.col)) continue;
        if (cellClaimedByAnotherPlayer(state, cell.row, cell.col, player.token)) continue;
        if (!safeWall(state, player, cell, accepted)) continue;

        accepted.push(cell);
    }

    return accepted;
}

function sanitizeTerrain(state, player, cells) {
    if (!Array.isArray(cells)) return [];
    const accepted = [];

    for (const raw of cells.slice(0, 2)) {
        const cell = {
            row: Number(raw?.row),
            col: Number(raw?.col)
        };

        if (!validOpenCell(state, cell)) continue;
        if (accepted.some(item => item.row === cell.row && item.col === cell.col)) continue;
        if (cellClaimedByAnotherPlayer(state, cell.row, cell.col, player.token)) continue;

        accepted.push(cell);
    }

    return accepted;
}

function allReady(state) {
    if (state.players.length !== PLAYER_LIMIT) return false;

    const players = state.players;
    return players.every(player =>
        player.ready &&
        player.name &&
        ALGORITHMS.includes(player.algorithm)
    ) && new Set(players.map(player => player.algorithm)).size === PLAYER_LIMIT;
}

function startRaceIfReady(state) {
    if (allReady(state) && state.raceState === "waiting") {
        state.raceState = "racing";
        gpLog("info", "RACE_START", {
            round: state.roundNumber,
            players: state.players
                .slice()
                .sort((a, b) => a.number - b.number)
                .map(player => `${player.number}:${player.name}:${player.algorithm}`)
                .join(",")
        });
    }
}

function normalizeName(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 20);
}

function buildError(status, code, message, extra = {}) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    error.payload = {
        ok: false,
        code,
        message,
        ...extra
    };
    return error;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeOrigin(value) {
    if (!value) return null;
    try {
        const url = new URL(String(value).trim());
        if (!/^https?:$/.test(url.protocol)) return null;
        if (url.username || url.password) return null;
        return url.origin;
    } catch {
        return null;
    }
}

function hostNameFromHeader(hostHeader = "") {
    const value = String(hostHeader).trim();
    if (!value) return "";
    if (value.startsWith("[")) {
        const end = value.indexOf("]");
        return end >= 0 ? value.slice(1, end) : value;
    }
    return value.split(":")[0];
}

function firstForwardedValue(value) {
    return String(value || "").split(",")[0].trim();
}

function getLanAddresses() {
    if (process.env.JOIN_HOST) return [process.env.JOIN_HOST];

    const addresses = [];
    for (const [name, values] of Object.entries(os.networkInterfaces())) {
        for (const info of values || []) {
            if (info.family !== "IPv4" || info.internal) continue;
            const address = info.address;
            const interfaceName = name.toLowerCase();
            const excluded = /virtual|vmware|virtualbox|hyper-v|wsl|docker/.test(interfaceName);
            if (excluded) continue;

            const score = address.startsWith("192.168.") ? 1 :
                /^10\./.test(address) ? 2 :
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address) ? 3 : 9;
            addresses.push({ address, score, name });
        }
    }

    addresses.sort((a, b) => a.score - b.score || a.address.localeCompare(b.address));
    return [...new Set(addresses.map(item => item.address))];
}

function getLanAddress() {
    return getLanAddresses()[0] || "localhost";
}

function buildJoinOrigin({ host, protocol, originHint } = {}) {
    const hintedOrigin = normalizeOrigin(originHint);
    if (hintedOrigin) {
        const hintedHost = hostNameFromHeader(new URL(hintedOrigin).host);
        if (!LOCAL_HOSTNAMES.has(hintedHost)) return hintedOrigin;
    }

    const hostname = hostNameFromHeader(host);
    if (!hostname || LOCAL_HOSTNAMES.has(hostname)) {
        return `http://${getLanAddress()}:${PORT}`;
    }

    const safeProtocol = String(protocol || "http").toLowerCase() === "https"
        ? "https"
        : "http";
    return `${safeProtocol}://${host}`;
}

function normalizeJoinUrl(value) {
    if (!value) return null;
    try {
        const url = new URL(String(value).trim());
        if (!/^https?:$/.test(url.protocol)) return null;
        if (url.username || url.password) return null;
        if (url.search || url.hash) return null;
        const pathname = url.pathname.replace(/\/+$/, "");
        return `${url.origin}${pathname || "/controller"}`;
    } catch {
        return null;
    }
}

function buildJoinUrlFromRequest(req) {
    const forcedUrl = normalizeJoinUrl(process.env.JOIN_URL);
    if (forcedUrl) return forcedUrl;

    const forwardedProto = firstForwardedValue(req.headers["x-forwarded-proto"]);
    const forwardedHost = firstForwardedValue(req.headers["x-forwarded-host"]);
    const host = forwardedHost || req.headers.host || "";
    const protocol = forwardedProto || req.protocol || "http";
    const originHint = req.query?.origin;
    const origin = buildJoinOrigin({ host, protocol, originHint });
    return `${origin}/controller`;
}

function sendApiError(res, error) {
    let status = Number(error?.status) || 500;
    let payload = error?.payload;

    if (!payload && error?.code === "REDIS_ERROR") {
        status = 503;
        payload = {
            ok: false,
            code: "REDIS_UNAVAILABLE",
            message: "Shared race state is unavailable. Check the Vercel Upstash Redis integration and redeploy."
        };
    }

    if (!payload && error?.code === "STATE_LOCK_TIMEOUT") {
        status = 503;
        payload = {
            ok: false,
            code: "STATE_BUSY",
            message: "The shared race state is busy. Please retry in a moment."
        };
    }

    payload ||= {
        ok: false,
        code: "INTERNAL_ERROR",
        message: error?.message || "Internal server error."
    };

    return res.status(status).json(payload);
}

function assertSharedStateAvailable() {
    if (IS_VERCEL && !sharedStateEnabled) {
        throw buildError(
            503,
            "SHARED_STATE_REQUIRED",
            "Multiplayer deployment needs Upstash Redis. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel, then redeploy."
        );
    }
}

function assertSessionToken(token) {
    if (!validToken(token)) {
        throw buildError(400, "INVALID_SESSION", "This session token is invalid. Refresh the page to create a new one.");
    }
}

async function touchSession(role, token) {
    const changed = await mutateState(state => {
        cleanupExpiredPlayers(state);

        if (role === "screen") {
            if (!state.screen || state.screen.token !== token) {
                throw buildError(409, "SCREEN_REPLACED", "This screen session is no longer the active screen.");
            }
            state.screen.lastSeen = now();
            return { ok: true };
        }

        const player = findPlayer(state, token);
        if (!player) {
            throw buildError(404, "SESSION_NOT_FOUND", "Player session expired. Rejoining the race.");
        }
        player.lastSeen = now();
        return { ok: true, number: player.number };
    });

    return changed.state;
}

app.get("/robots.txt", (req, res) => {
    const origin = new URL(buildJoinUrlFromRequest(req)).origin;
    res.type("text/plain").send([
        "User-agent: *",
        "Allow: /",
        "Disallow: /screen",
        "Disallow: /controller",
        "Disallow: /diagnostics.html",
        "Disallow: /api/",
        `Sitemap: ${origin}/sitemap.xml`
    ].join("\n"));
});

app.get("/sitemap.xml", (req, res) => {
    const origin = new URL(buildJoinUrlFromRequest(req)).origin;
    const urls = [`${origin}/`];
    const body = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map(url => `  <url><loc>${url}</loc></url>`),
        "</urlset>"
    ].join("\n");
    res.type("application/xml").send(body);
});

app.get("/api/join", async (req, res) => {
    try {
        const joinUrl = buildJoinUrlFromRequest(req);
        const isLocalRequest = LOCAL_HOSTNAMES.has(hostNameFromHeader(req.headers.host));
        const qr = await QRCode.toDataURL(joinUrl, {
            margin: 2,
            width: 520,
            errorCorrectionLevel: "H"
        });

        res.set("Cache-Control", "no-store");
        res.json({
            ok: true,
            url: joinUrl,
            qr,
            addresses: isLocalRequest ? getLanAddresses() : [],
            port: PORT,
            realtime: "shared-http"
        });
    } catch (error) {
        sendApiError(res, error);
    }
});

app.get("/api/health", async (req, res) => {
    try {
        assertSharedStateAvailable();
        const state = await readState();
        const isLocalRequest = LOCAL_HOSTNAMES.has(hostNameFromHeader(req.headers.host));
        res.set("Cache-Control", "no-store");
        res.json({
            ok: true,
            service: "algorithm-grand-prix",
            realtime: "shared-http-polling",
            sharedState: sharedStateEnabled,
            round: state.roundNumber,
            raceState: state.raceState,
            players: state.players.length,
            size: MAZE_SIZE,
            joinUrl: buildJoinUrlFromRequest(req),
            addresses: isLocalRequest ? getLanAddresses() : [],
            deployment: IS_VERCEL ? DEPLOYMENT_ID : "local",
            stateKey: STATE_KEY,
            time: new Date().toISOString()
        });
    } catch (error) {
        sendApiError(res, error);
    }
});

app.get("/api/logs", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ logs: serverLogs.slice(-100) });
});

app.get("/api/network", (req, res) => {
    const addresses = getLanAddresses();
    res.set("Cache-Control", "no-store");
    res.json({
        hostname: os.hostname(),
        port: PORT,
        addresses,
        joinUrls: addresses.map(address => `http://${address}:${PORT}/controller`),
        publicJoinUrl: buildJoinUrlFromRequest(req)
    });
});

app.get("/api/state", async (_req, res) => {
    try {
        assertSharedStateAvailable();
        const state = await readState();
        res.set("Cache-Control", "no-store");
        res.json(publicState(state));
    } catch (error) {
        sendApiError(res, error);
    }
});

app.post("/api/realtime/join", async (req, res) => {
    try {
        assertSharedStateAvailable();
        const role = req.body?.role;
        const token = String(req.body?.token || "");
        const requestedName = normalizeName(req.body?.name);
        if (!validRole(role)) throw buildError(400, "INVALID_ROLE", "Unknown session role.");
        assertSessionToken(token);

        const { result, state } = await mutateState(current => {
            cleanupExpiredPlayers(current);

            if (role === "screen") {
                const replaced = Boolean(current.screen && current.screen.token !== token);
                current.screen = { token, lastSeen: now() };
                if (replaced) gpLog("warn", "SCREEN_REPLACED", { reason: "new_screen_joined" });
                return { ok: true, role, number: null, replaced };
            }

            let player = findPlayer(current, token);
            if (player) {
                let nameError = null;
                if (!player.name && requestedName && current.raceState === "waiting") {
                    const duplicate = current.players.some(other =>
                        other.token !== token &&
                        other.name &&
                        other.name.toLowerCase() === requestedName.toLowerCase()
                    );
                    if (duplicate) {
                        nameError = { code: "NAME_CONFLICT", message: "That name is already in this round." };
                    } else if (requestedName.length < 2) {
                        nameError = { code: "INVALID_NAME", message: "Enter at least 2 characters." };
                    } else {
                        player.name = requestedName;
                        gpLog("info", "NAME_SET_ON_REJOIN", { player: player.number, name: requestedName });
                    }
                }
                player.lastSeen = now();
                return {
                    ok: true,
                    role,
                    number: player.number,
                    restored: true,
                    name: player.name || "",
                    nameError
                };
            }

            if (current.players.length >= PLAYER_LIMIT) {
                throw buildError(409, "GAME_FULL", "All 4 player slots are occupied.");
            }

            const usedNumbers = new Set(current.players.map(item => item.number));
            let number = 1;
            while (usedNumbers.has(number)) number++;

            player = {
                token,
                number,
                name: "",
                algorithm: null,
                ready: false,
                walls: [],
                terrain: [],
                heuristicWeight: 1,
                prediction: null,
                lastSeen: now()
            };

            let nameError = null;
            if (requestedName) {
                if (requestedName.length < 2) {
                    nameError = { code: "INVALID_NAME", message: "Enter at least 2 characters." };
                } else {
                    const duplicate = current.players.some(other =>
                        other.name && other.name.toLowerCase() === requestedName.toLowerCase()
                    );
                    if (duplicate) {
                        nameError = { code: "NAME_CONFLICT", message: "That name is already in this round." };
                    } else {
                        player.name = requestedName;
                        gpLog("info", "NAME_SET_ON_JOIN", { player: number, name: requestedName });
                    }
                }
            }

            current.players.push(player);
            gpLog("info", "PLAYER_CONNECTED", { player: number, restoredName: Boolean(player.name) });
            return {
                ok: true,
                role,
                number,
                restored: false,
                name: player.name,
                nameError
            };
        });

        res.set("Cache-Control", "no-store");
        res.json({
            ...result,
            state: publicState(state),
            serverInfo: {
                joinUrl: buildJoinUrlFromRequest(req),
                realtime: "shared-http-polling",
                deployment: IS_VERCEL ? DEPLOYMENT_ID : "local"
            }
        });
    } catch (error) {
        sendApiError(res, error);
    }
});

app.post("/api/realtime/heartbeat", async (req, res) => {
    try {
        assertSharedStateAvailable();
        const role = req.body?.role;
        const token = String(req.body?.token || "");
        if (!validRole(role)) throw buildError(400, "INVALID_ROLE", "Unknown session role.");
        assertSessionToken(token);

        const state = await touchSession(role, token);
        res.set("Cache-Control", "no-store");
        res.json({ ok: true, number: role === "player" ? findPlayer(state, token)?.number ?? null : null });
    } catch (error) {
        sendApiError(res, error);
    }
});

async function handleRealtimeState(req, res) {
    try {
        assertSharedStateAvailable();
        const role = String(req.body?.role || req.query?.role || "");
        const token = String(req.body?.token || req.query?.token || "");
        if (!validRole(role)) throw buildError(400, "INVALID_ROLE", "Unknown session role.");
        assertSessionToken(token);

        let state = await readState();
        if (role === "screen") {
            if (!state.screen || state.screen.token !== token) {
                throw buildError(409, "SCREEN_REPLACED", "This screen session is no longer the active screen.");
            }
            if (now() - Number(state.screen.lastSeen || 0) >= HEARTBEAT_WRITE_INTERVAL_MS) {
                state = await touchSession(role, token);
            }
        } else {
            const player = findPlayer(state, token);
            if (!player) {
                throw buildError(404, "SESSION_NOT_FOUND", "Player session expired. Rejoining the race.");
            }
            if (now() - Number(player.lastSeen || 0) >= HEARTBEAT_WRITE_INTERVAL_MS) {
                state = await touchSession(role, token);
            }
        }

        res.set("Cache-Control", "no-store");
        res.json({ ok: true, state: publicState(state) });
    } catch (error) {
        sendApiError(res, error);
    }
}

app.post("/api/realtime/state", handleRealtimeState);
app.get("/api/realtime/state", handleRealtimeState);

app.post("/api/realtime/event", async (req, res) => {
    try {
        assertSharedStateAvailable();
        const role = req.body?.role;
        const token = String(req.body?.token || "");
        const event = String(req.body?.event || "");
        const data = req.body?.data;

        if (!validRole(role)) throw buildError(400, "INVALID_ROLE", "Unknown session role.");
        assertSessionToken(token);

        if (event === "request_maze") {
            const state = await readState();
            if (role === "screen") {
                if (!state.screen || state.screen.token !== token) {
                    throw buildError(409, "SCREEN_REPLACED", "This screen session is no longer the active screen.");
                }
            } else if (!findPlayer(state, token)) {
                throw buildError(404, "SESSION_NOT_FOUND", "Player session expired. Rejoining the race.");
            }
            return res.json({ ok: true, state: publicState(state) });
        }

        const { result, state } = await mutateState(current => {
            cleanupExpiredPlayers(current);

            if (role === "screen") {
                if (!current.screen || current.screen.token !== token) {
                    throw buildError(409, "SCREEN_REPLACED", "This screen session is no longer the active screen.");
                }
                current.screen.lastSeen = now();
            }

            const player = role === "player" ? findPlayer(current, token) : null;
            if (role === "player" && !player) {
                throw buildError(404, "SESSION_NOT_FOUND", "Player session expired. Rejoining the race.");
            }

            switch (event) {
                case "player_name": {
                    if (current.raceState === "racing") {
                        throw buildError(409, "RACE_IN_PROGRESS", "Names cannot change during the race.");
                    }

                    const name = normalizeName(data?.name);
                    if (name.length < 2) {
                        throw buildError(400, "INVALID_NAME", "Enter at least 2 characters.");
                    }

                    const duplicate = current.players.some(other =>
                        other.token !== token &&
                        other.name &&
                        other.name.toLowerCase() === name.toLowerCase()
                    );

                    if (duplicate) {
                        throw buildError(409, "NAME_CONFLICT", "That name is already in this round.");
                    }

                    player.name = name;
                    player.lastSeen = now();
                    gpLog("info", "NAME_SET", { player: player.number, name });
                    return { ok: true, name };
                }

                case "algorithm_selected": {
                    if (current.raceState !== "waiting" || !player.name) return { ok: false, code: "NOT_READY", message: "Enter your name first." };
                    if (!ALGORITHMS.includes(data?.algorithm)) {
                        throw buildError(400, "INVALID_ALGORITHM", "Unknown algorithm.");
                    }

                    const duplicate = current.players.some(other =>
                        other.token !== token && other.algorithm === data.algorithm
                    );

                    if (duplicate) {
                        throw buildError(409, "ALGORITHM_CONFLICT", `${data.algorithm} is already selected by another player.`, { algorithm: data.algorithm });
                    }

                    player.algorithm = data.algorithm;
                    player.ready = false;
                    player.walls = [];
                    player.terrain = [];
                    player.heuristicWeight = 1;
                    player.prediction = null;
                    player.lastSeen = now();
                    gpLog("info", "ALGORITHM_SET", { player: player.number, algorithm: data.algorithm });
                    return { ok: true, algorithm: data.algorithm };
                }

                case "prediction_selected": {
                    if (current.raceState !== "waiting" || !PREDICTIONS.includes(data)) return { ok: false, code: "NOT_AVAILABLE", message: "Prediction is closed." };
                    player.prediction = data;
                    player.ready = false;
                    player.lastSeen = now();
                    return { ok: true, prediction: data };
                }

                case "wall_placed": {
                    if (current.raceState !== "waiting" || !player.algorithm || player.algorithm === "DIJKSTRA") return { ok: false, code: "NOT_AVAILABLE", message: "Wall placement is unavailable." };
                    if ((player.walls || []).length >= 2) return { ok: false, code: "LIMIT_REACHED", message: "You already placed 2 walls." };

                    const cell = { row: Number(data?.row), col: Number(data?.col) };
                    if (!validOpenCell(current, cell) || cellClaimedByAnotherPlayer(current, cell.row, cell.col, token) || player.walls.some(item => item.row === cell.row && item.col === cell.col)) {
                        throw buildError(400, "INVALID_PLACEMENT", "That wall cannot be placed there.", { type: "wall", reason: "That wall cannot be placed there." });
                    }

                    if (!safeWall(current, player, cell)) {
                        throw buildError(409, "UNSAFE_WALL", "That wall would remove the remaining escape route. Choose another cell.", { type: "wall", reason: "That wall would remove the remaining escape route. Choose another cell." });
                    }

                    player.walls.push(cell);
                    player.ready = false;
                    player.lastSeen = now();
                    gpLog("info", "WALL_PLACED", { player: player.number, row: cell.row, col: cell.col });
                    return { ok: true, type: "wall", cell };
                }

                case "terrain_placed": {
                    if (current.raceState !== "waiting" || player.algorithm !== "DIJKSTRA") return { ok: false, code: "NOT_AVAILABLE", message: "Sand placement is unavailable." };
                    if ((player.terrain || []).length >= 2) return { ok: false, code: "LIMIT_REACHED", message: "You already placed 2 sand cells." };

                    const cell = { row: Number(data?.row), col: Number(data?.col) };
                    if (!validOpenCell(current, cell) || cellClaimedByAnotherPlayer(current, cell.row, cell.col, token) || player.terrain.some(item => item.row === cell.row && item.col === cell.col)) {
                        throw buildError(400, "INVALID_PLACEMENT", "That sand cell cannot be placed there.", { type: "terrain", reason: "That sand cell cannot be placed there." });
                    }

                    player.terrain.push(cell);
                    player.ready = false;
                    player.lastSeen = now();
                    gpLog("info", "SAND_PLACED", { player: player.number, row: cell.row, col: cell.col });
                    return { ok: true, type: "terrain", cell };
                }

                case "player_ready": {
                    if (current.raceState !== "waiting" || !player.name) {
                        throw buildError(409, "NOT_READY", "Enter your name before readying up.");
                    }
                    if (!ALGORITHMS.includes(data?.algorithm)) {
                        throw buildError(400, "INVALID_ALGORITHM", "Choose a valid algorithm.");
                    }

                    const duplicate = current.players.some(other =>
                        other.token !== token && other.algorithm === data.algorithm
                    );
                    if (duplicate) {
                        throw buildError(409, "ALGORITHM_CONFLICT", `${data.algorithm} is already selected by another player.`, { algorithm: data.algorithm });
                    }

                    player.algorithm = data.algorithm;
                    player.heuristicWeight = Math.max(0, Math.min(2, Number(data.heuristicWeight) || 1));
                    player.walls = player.algorithm === "DIJKSTRA"
                        ? []
                        : sanitizeWalls(current, player, data.walls);
                    player.terrain = player.algorithm === "DIJKSTRA"
                        ? sanitizeTerrain(current, player, data.terrain)
                        : [];
                    player.prediction = PREDICTIONS.includes(data.prediction) ? data.prediction : null;
                    player.ready = true;
                    player.lastSeen = now();
                    gpLog("info", "PLAYER_READY", {
                        player: player.number,
                        algorithm: player.algorithm,
                        walls: player.walls.length,
                        sand: player.terrain.length
                    });
                    startRaceIfReady(current);
                    return { ok: true, ready: true, raceState: current.raceState };
                }

                case "new_round": {
                    if (current.raceState === "racing") {
                        throw buildError(409, "RACE_IN_PROGRESS", "Finish the current race before starting a new round.");
                    }
                    const selected = chooseRandomMaze(current.currentMazeMap?.id);
                    if (!selectMazeInState(current, selected, true)) {
                        throw buildError(500, "NEW_ROUND_FAILED", "Could not build the new maze. Please try again.");
                    }
                    gpLog("info", "ROUND_READY", {
                        round: current.roundNumber,
                        map: current.currentMazeMap.name,
                        seed: current.currentMazeMap.seed,
                        size: MAZE_SIZE
                    });
                    return { ok: true, round: current.roundNumber };
                }

                case "race_finished": {
                    if (role !== "screen") {
                        throw buildError(403, "SCREEN_ONLY", "Only the main screen can finish a race.");
                    }
                    if (!Array.isArray(data?.results)) {
                        throw buildError(400, "INVALID_RESULTS", "Race results are missing.");
                    }
                    if (data.round && Number(data.round) !== current.roundNumber) {
                        throw buildError(409, "STALE_RESULTS", "These race results belong to another round.");
                    }

                    current.lastRaceResults = {
                        round: current.roundNumber,
                        order: Array.isArray(data.order)
                            ? data.order
                            : data.results.map(item => item.algorithm),
                        results: data.results,
                        finishedAt: now()
                    };
                    current.raceState = "finished";
                    gpLog("info", "RACE_FINISHED", {
                        round: current.roundNumber,
                        order: current.lastRaceResults.order.join(">").slice(0, 120)
                    });
                    return { ok: true, finished: true };
                }

                default:
                    throw buildError(400, "UNKNOWN_EVENT", `Unknown realtime event: ${event}`);
            }
        });

        res.set("Cache-Control", "no-store");
        res.json({
            ...result,
            state: publicState(state)
        });
    } catch (error) {
        sendApiError(res, error);
    }
});

app.use((error, _req, res, _next) => {
    sendApiError(res, error);
});

module.exports = app;

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        gpLog("info", "SERVER_READY", {
            port: PORT,
            realtime: "shared-http-polling",
            join: `http://${getLanAddress()}:${PORT}/controller`
        });
        gpLog("info", "NETWORK_ADDRESSES", {
            addresses: getLanAddresses().join(",") || "none"
        });
    });
}
