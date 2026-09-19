const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const realtime = fs.readFileSync(path.join(root, "public", "js", "realtime.js"), "utf8");
const screenJs = fs.readFileSync(path.join(root, "public", "js", "screen.js"), "utf8");
const controllerJs = fs.readFileSync(path.join(root, "public", "js", "controller.js"), "utf8");
const screenHtml = fs.readFileSync(path.join(root, "public", "screen.html"), "utf8");
const controllerHtml = fs.readFileSync(path.join(root, "public", "controller.html"), "utf8");

for (const route of [
    '/api/realtime/join',
    '/api/realtime/state',
    '/api/realtime/heartbeat',
    '/api/realtime/event'
]) assert.ok(server.includes(route), `missing ${route}`);

for (const marker of [
    'findPlayer(current, token)',
    'PLAYER_TTL_MS',
    'SCREEN_REPLACED',
    'GAME_FULL',
    'PLAYER_CONNECTED',
    'NAME_SET_ON_JOIN',
    'NAME_SET_ON_REJOIN',
    'ALGORITHM_CONFLICT',
    'WALL_PLACED',
    'SAND_PLACED',
    'PLAYER_READY',
    'RACE_START',
    'RACE_FINISHED',
    'ROUND_READY',
    'resetPlayerForRound'
]) assert.ok(server.includes(marker), `server missing ${marker}`);

assert.ok(server.includes('if (state.raceState !== "waiting") return;'), "stale player cleanup should not erase live race participants");
assert.ok(server.includes('if (!player.name && requestedName && current.raceState === "waiting")'), "rejoin should restore a saved name only when safe");
assert.ok(server.includes('current.players.length >= PLAYER_LIMIT'), "player cap missing");
assert.ok(server.includes('current.players.some(other =>'), "server should validate duplicates");
assert.ok(server.includes('new Set(players.map(player => player.algorithm)).size === PLAYER_LIMIT'), "all four algorithms must stay unique");
assert.ok(server.includes('player.name = ""') && server.includes('player.algorithm = null') && server.includes('player.ready = false'), "round reset should clear game selections");

assert.ok(realtime.includes('emitLocal("round_reset"'), "round reset must reach clients");
assert.ok(realtime.includes('emitLocal("players_updated"'), "player state must reach clients");
assert.ok(realtime.includes('emitLocal("maze_selected"'), "maze state must reach clients");
assert.ok(realtime.includes('emitLocal("race_start"'), "race start must reach clients");
assert.ok(realtime.includes('emitLocal("race_finished"'), "race finish must reach clients");
assert.ok(realtime.includes('emitLocal("race_results"'), "race results must reach clients");
assert.ok(realtime.includes('SESSION_NOT_FOUND'), "session expiry must trigger rejoin");
assert.ok(realtime.includes('scheduleReconnect'), "transient errors must retry");
assert.ok(realtime.includes('setTimeout(() => join(false), 0)'), "initial join must wait until page listeners are attached");

assert.ok(controllerJs.includes('socket.on("player_assigned"'), "controller must receive a stable player assignment");
assert.ok(controllerJs.includes('socket.on("players_updated"'), "controller must consume shared player state");
assert.ok(controllerJs.includes('socket.on("round_reset"'), "controller must react to new rounds");
assert.ok(controllerJs.includes('socket.on("race_start"'), "controller must react to race start");
assert.ok(controllerJs.includes('socket.on("race_results"'), "controller must receive final report results");
assert.ok(screenJs.includes('socket.on("players_updated"'), "screen must consume shared player state");
assert.ok(screenJs.includes('socket.on("round_reset"'), "screen must react to new rounds");
assert.ok(screenJs.includes('socket.on("race_start"'), "screen must start the visual race");
assert.ok(screenJs.includes('socket.emit("race_finished"'), "screen must publish final results");

assert.ok(controllerHtml.includes('/js/realtime.js'), "controller must load the realtime bridge first");
assert.ok(screenHtml.includes('/js/realtime.js'), "screen must load the realtime bridge first");
assert.ok(!controllerHtml.includes('/socket.io/socket.io.js'));
assert.ok(!screenHtml.includes('/socket.io/socket.io.js'));

console.log("NETWORK / ROUND / SESSION STATIC CHECKS PASSED");
