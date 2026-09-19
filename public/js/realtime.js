/* Shared HTTP realtime bridge for Vercel and regular Node hosting. */
(() => {
    class Hub {
        constructor() {
            this.listeners = new Map();
        }

        on(event, handler) {
            if (!this.listeners.has(event)) this.listeners.set(event, new Set());
            this.listeners.get(event).add(handler);
            return this;
        }

        off(event, handler) {
            this.listeners.get(event)?.delete(handler);
            return this;
        }

        emit(event, ...args) {
            for (const handler of this.listeners.get(event) || []) {
                try {
                    handler(...args);
                } catch (error) {
                    console.error(`[AGP] ${event} handler failed`, error);
                }
            }
        }
    }

    function storageGet(key) {
        try {
            return localStorage.getItem(key) || "";
        } catch (_) {
            return "";
        }
    }

    function storageSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (_) {}
    }

    function createToken() {
        try {
            if (window.crypto?.randomUUID) return window.crypto.randomUUID();
            if (window.crypto?.getRandomValues) {
                const bytes = new Uint8Array(24);
                window.crypto.getRandomValues(bytes);
                return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
            }
        } catch (_) {}

        return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }

    function createRealtimeClient(role) {
        const isScreen = role === "screen";
        const tokenKey = isScreen ? "agp.screenToken.v4" : "agp.playerToken.v4";
        let token = storageGet(tokenKey);
        if (!/^[a-zA-Z0-9_-]{16,120}$/.test(token)) {
            token = createToken();
            storageSet(tokenKey, token);
        }

        const events = new Hub();
        const ioEvents = new Hub();
        const socket = {
            id: token,
            connected: false,
            io: ioEvents,
            on(event, handler) {
                events.on(event, handler);
                return socket;
            },
            off(event, handler) {
                events.off(event, handler);
                return socket;
            },
            emit(event, data, ack) {
                dispatch(event, data, ack, 7000);
                return socket;
            },
            timeout(ms) {
                return {
                    emit(event, data, ack) {
                        dispatch(event, data, ack, Number(ms) || 7000);
                    }
                };
            },
            disconnect() {
                stopPolling();
                setDisconnected("client_disconnect");
            }
        };

        ioEvents.engine = { transport: { name: "polling" } };

        let pollTimer = null;
        let polling = false;
        let stopped = false;
        let reconnectAttempt = 0;
        let lastState = null;
        let firstState = true;

        function emitLocal(event, ...args) {
            events.emit(event, ...args);
        }

        function setConnected(reconnected = false) {
            const wasConnected = socket.connected;
            socket.connected = true;
            ioEvents.engine.transport.name = "polling";

            if (!wasConnected) {
                if (reconnected) ioEvents.emit("reconnect", reconnectAttempt);
                emitLocal("connect");
            }
        }

        function setDisconnected(reason) {
            if (!socket.connected) return;
            socket.connected = false;
            emitLocal("disconnect", reason || "network-error");
        }

        function errorFromResponse(data, status) {
            const error = new Error(data?.message || `HTTP ${status}`);
            error.code = data?.code || `HTTP_${status}`;
            error.status = status;
            error.payload = data;
            return error;
        }

        async function request(url, options = {}, timeoutMs = 7000) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    ...options,
                    cache: "no-store",
                    signal: controller.signal,
                    headers: {
                        Accept: "application/json",
                        ...(options.body ? { "Content-Type": "application/json" } : {}),
                        ...(options.headers || {})
                    }
                });

                let data = null;
                try {
                    data = await response.json();
                } catch (_) {}

                if (!response.ok) throw errorFromResponse(data, response.status);
                return data || {};
            } finally {
                clearTimeout(timer);
            }
        }

        function playerComparable(players) {
            return JSON.stringify((players || []).map(player => ({
                number: player.number,
                name: player.name,
                algorithm: player.algorithm,
                ready: player.ready,
                walls: player.walls || [],
                terrain: player.terrain || [],
                heuristicWeight: player.heuristicWeight,
                prediction: player.prediction
            })));
        }

        function resultComparable(results) {
            return JSON.stringify(results || null);
        }

        function applyState(state) {
            if (!state?.maze) return;

            const previous = lastState;
            const playersChanged = !previous || playerComparable(previous.players) !== playerComparable(state.players);
            const mazeChanged = !previous ||
                Number(previous.round) !== Number(state.round) ||
                Number(previous.maze?.id) !== Number(state.maze?.id) ||
                Number(previous.maze?.seed) !== Number(state.maze?.seed);
            const resultsChanged = !previous || resultComparable(previous.results) !== resultComparable(state.results);
            const raceChanged = !previous || previous.raceState !== state.raceState;

            if (Number(previous?.round || 0) !== Number(state.round || 0) && !firstState) {
                emitLocal("round_reset", {
                    round: state.round,
                    maze: state.maze,
                    players: state.players || []
                });
            }

            if (playersChanged) emitLocal("players_updated", state.players || []);
            if (mazeChanged) emitLocal("maze_selected", state.maze);

            if (state.raceState === "racing" && (firstState || (raceChanged && previous?.raceState !== "racing"))) {
                emitLocal("race_start", {
                    round: state.round,
                    maze: state.maze,
                    players: state.players || []
                });
            }

            if (state.raceState === "finished" && ((raceChanged && previous?.raceState !== "finished") || (resultsChanged && state.results))) {
                emitLocal("race_finished", state.results || null);
                if (state.results) emitLocal("race_results", state.results);
            }

            if (firstState && state.results) emitLocal("race_results", state.results);

            lastState = state;
            firstState = false;
        }

        async function join(reconnect = false) {
            if (stopped) return;

            if (reconnect) {
                reconnectAttempt += 1;
                ioEvents.emit("reconnect_attempt", reconnectAttempt);
            }

            try {
                const savedName = role === "player"
                    ? storageGet("agp.playerName").trim().replace(/\s+/g, " ").slice(0, 20)
                    : "";
                const response = await request("/api/realtime/join", {
                    method: "POST",
                    body: JSON.stringify({ role, token, name: savedName })
                }, 9000);

                socket.id = response?.token || token;
                reconnectAttempt = 0;
                setConnected(reconnect);

                emitLocal("server_info", response.serverInfo || {});
                applyState(response.state);

                if (role === "player" && Number.isInteger(response.number)) {
                    const playerState = response.state?.players?.find(
                        player => player.number === response.number
                    ) || null;
                    emitLocal("player_assigned", {
                        number: response.number,
                        name: response.name || playerState?.name || "",
                        nameError: response.nameError || null,
                        player: playerState,
                        size: response.state?.maze?.size || 71
                    });
                }

                if (role === "player" && response.nameError) {
                    if (response.nameError.code === "NAME_CONFLICT") {
                        emitLocal("name_conflict", { message: response.nameError.message });
                    } else {
                        emitLocal("name_invalid", { message: response.nameError.message });
                    }
                }

                schedulePoll();
            } catch (error) {
                setDisconnected(error.code || error.message);
                emitLocal("connect_error", error);
                if (error.code === "GAME_FULL") {
                    emitLocal("game_full");
                    stopPolling();
                    return;
                }
                scheduleReconnect();
            }
        }

        function schedulePoll() {
            clearTimeout(pollTimer);
            pollTimer = setTimeout(poll, isScreen ? 700 : 1000);
        }

        function scheduleReconnect() {
            if (stopped) return;
            clearTimeout(pollTimer);
            pollTimer = setTimeout(() => join(true), Math.min(4000, 750 + reconnectAttempt * 250));
        }

        async function poll() {
            if (stopped || polling) return;
            polling = true;

            try {
                const response = await request("/api/realtime/state", {
                    method: "POST",
                    body: JSON.stringify({ role, token })
                }, 7000);
                if (!socket.connected) {
                    setConnected(true);
                    ioEvents.emit("reconnect", reconnectAttempt);
                }
                applyState(response.state);
                schedulePoll();
            } catch (error) {
                if (error.code === "SESSION_NOT_FOUND") {
                    setDisconnected(error.code);
                    await join(true);
                } else if (error.code === "SCREEN_REPLACED") {
                    setDisconnected(error.code);
                    stopPolling();
                    emitLocal("connect_error", error);
                } else {
                    setDisconnected(error.code || error.message);
                    ioEvents.emit("reconnect_error", error);
                    scheduleReconnect();
                }
            } finally {
                polling = false;
            }
        }

        async function dispatch(event, data, ack, timeoutMs) {
            if (stopped) return;

            if (event === "request_maze") {
                try {
                    const response = await request("/api/realtime/state", {
                        method: "POST",
                        body: JSON.stringify({ role, token })
                    }, timeoutMs);
                    applyState(response.state);
                    if (typeof ack === "function") ack(null, response);
                } catch (error) {
                    if (typeof ack === "function") ack(error, null);
                    emitLocal("connect_error", error);
                }
                return;
            }

            try {
                const response = await request("/api/realtime/event", {
                    method: "POST",
                    body: JSON.stringify({ role, token, event, data })
                }, timeoutMs);

                applyState(response.state);
                handleActionResult(event, response);
                if (typeof ack === "function") ack(null, response);
            } catch (error) {
                handleActionError(event, error);
                if (typeof ack === "function") ack(error, error.payload || null);
                if (error.code === "SESSION_NOT_FOUND") {
                    setDisconnected(error.code);
                    await join(true);
                } else if (error.code === "SCREEN_REPLACED") {
                    setDisconnected(error.code);
                    stopPolling();
                    emitLocal("connect_error", error);
                }
            }
        }

        function handleActionResult(event, response) {
            if (response?.ok === false) {
                handleActionError(event, response);
                return;
            }

            if (event === "player_name" && response.name) emitLocal("name_saved", { name: response.name });
        }

        function handleActionError(event, error) {
            const payload = error?.payload || error || {};
            const code = payload.code || error?.code;

            if (event === "player_name") {
                if (code === "NAME_CONFLICT") emitLocal("name_conflict");
                else emitLocal("name_invalid", { message: payload.message || "Could not save your name." });
                return;
            }

            if (event === "algorithm_selected" || event === "player_ready") {
                if (code === "ALGORITHM_CONFLICT") emitLocal("algorithm_conflict", { algorithm: payload.algorithm || "Algorithm" });
                return;
            }

            if (event === "wall_placed" || event === "terrain_placed") {
                if (code === "UNSAFE_WALL" || code === "INVALID_PLACEMENT" || code === "LIMIT_REACHED") {
                    emitLocal("placement_rejected", {
                        type: payload.type || (event === "terrain_placed" ? "terrain" : "wall"),
                        reason: payload.reason || payload.message || "Placement rejected."
                    });
                }
                return;
            }

            if (event === "new_round") {
                emitLocal("new_round_rejected", { message: payload.message || "New round could not start." });
            }
        }

        function stopPolling() {
            clearTimeout(pollTimer);
            stopped = true;
        }

        setTimeout(() => join(false), 0);
        return socket;
    }

    window.createRealtimeClient = createRealtimeClient;
})();
