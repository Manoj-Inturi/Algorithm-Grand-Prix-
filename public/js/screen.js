const socket = createRealtimeClient("screen");


let currentMaze = null;
let currentMap = null;
let currentPlayers = [];
let raceRuns = {};
let raceRunning = false;
let raceFinished = false;
let racePaused = false;
let raceStartPending = false;
let raceTimer = null;
let animationFrame = null;
let countdownTimer = null;
let finishOrder = [];
let lastRacePlayers = null;
let raceSpeed = 1;
let speedIndex = 1;
let learnMode = true;
let eventLog = [];
let raceClockStart = 0;
let raceResults = null;
let selectedLearningAlgorithm = "BFS";
let learningDemoRuns = {};
let learningDemoIndex = 0;
let learningDemoTimer = null;
let currentRound = 0;
let lastAudioPlayersSignature = null;
let lastMilestone = {};
let visibleAlgorithms = new Set(["BFS", "DFS", "DIJKSTRA", "A*"]);

const SPEEDS = [0.5, 1, 2, 4, 8, 16];
const START = { row: 1, col: 1 };
const PLAYER_COLORS = { 1: "#D32F2F", 2: "#1976D2", 3: "#388E3C", 4: "#F57C00" };
const PLACE_LABELS = { 1: "#1", 2: "#2", 3: "#3", 4: "#4" };
const ALGORITHM_COLORS = { BFS: "#D32F2F", DFS: "#1976D2", DIJKSTRA: "#388E3C", "A*": "#F57C00" };
const ROUND_FOCUS = {
    1: "OPEN GRID • WATCH THE SEARCH WAVES",
    2: "SERPENT • WATCH DEEP BRANCHES",
    3: "FORTRESS • WATCH OBSTACLES",
    4: "LABYRINTH • COMPARE EXPLORATION",
    5: "SWITCHBACK • WATCH GUIDANCE",
    6: "GAUNTLET • WATCH COST + OBSTACLES"
};

const canvas = document.getElementById("maze-canvas");
const ctx = canvas.getContext("2d");
const cards = document.querySelectorAll(".player-card");
const mazeContainer = document.querySelector(".maze-container");
const roundLabel = document.getElementById("round-number");
const raceStatus = document.getElementById("race-status");
const roundFocus = document.getElementById("round-focus");
const resultsPanel = document.getElementById("race-results");
const newRoundButton = document.getElementById("new-round");
const qrImage = document.getElementById("join-qr");
const qrBox = document.querySelector(".qr-box");
const joinUrl = document.getElementById("join-url");
const speedButton = document.getElementById("speed-button");
const pauseButton = document.getElementById("pause-button");
const stepButton = document.getElementById("step-button");
const learnButton = document.getElementById("learn-button");
const replayButton = document.getElementById("replay-button");
const reportButton = document.getElementById("report-button");
const mazeTooltip = document.getElementById("maze-tooltip");
const countdown = document.getElementById("countdown");
const learningPanel = document.getElementById("learning-panel");
const learningTitle = document.getElementById("learning-title");
const learningPersonality = document.getElementById("learning-personality");
const learningLive = document.getElementById("learning-live");
const decisionText = document.getElementById("decision-text");
const structureName = document.getElementById("structure-name");
const structureCount = document.getElementById("structure-count");
const structureList = document.getElementById("structure-list");
const eventLogElement = document.getElementById("event-log");
const eventCount = document.getElementById("event-count");
const reportCardModal = document.getElementById("report-card-modal");
const reportCardClose = document.getElementById("report-card-close");
const reportCardBody = document.getElementById("report-card-body");
const reportTabs = document.querySelectorAll("[data-report-algorithm]");
const qrModal = document.getElementById("qr-modal");
const qrModalClose = document.getElementById("qr-modal-close");
const qrLarge = document.getElementById("qr-large");
const qrModalUrl = document.getElementById("qr-modal-url");
const learningSelectorButtons = document.querySelectorAll("[data-learn-algorithm]");
const learningDemoPlay = document.getElementById("learning-demo-play");
const learningDemoStep = document.getElementById("learning-demo-step");
const learningDemoReset = document.getElementById("learning-demo-reset");
const fillBotsButton = document.getElementById("fill-bots-button");
const playersNeededScreen = document.getElementById("players-needed");
const telemetryTime = document.getElementById("telemetry-time");
const telemetryConnected = document.getElementById("telemetry-connected");
const telemetryReady = document.getElementById("telemetry-ready");
const telemetryAlgorithms = document.getElementById("telemetry-algorithms");
const battleList = document.getElementById("battle-list");
const roundIntel = document.getElementById("round-intel");
const algorithmActivity = document.getElementById("algorithm-activity");
const activityCaption = document.getElementById("activity-caption");
const calculationHistory = document.getElementById("calculation-history");
const calculationCount = document.getElementById("calculation-count");
const searchStats = document.getElementById("search-stats");
const searchStatsStatus = document.getElementById("search-stats-status");
const mazeFilterInputs = document.querySelectorAll("[data-maze-filter]");
const displayFilterCount = document.getElementById("display-filter-count");
const showAllAlgorithms = document.getElementById("show-all-algorithms");
const hideAllAlgorithms = document.getElementById("hide-all-algorithms");

function syncDisplayFilterUI() {
    mazeFilterInputs.forEach(input => {
        input.checked = visibleAlgorithms.has(input.dataset.mazeFilter);
    });
    if (displayFilterCount) displayFilterCount.textContent = `${visibleAlgorithms.size} / 4`;
}

function selectLearningFromVisibleAlgorithms() {
    if (visibleAlgorithms.size !== 1) return;
    const only = [...visibleAlgorithms][0];
    if (only === selectedLearningAlgorithm) return;
    selectedLearningAlgorithm = only;
    learningSelectorButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.learnAlgorithm === only));
    resetLearningDemo();
}

function setVisibleAlgorithms(algorithms) {
    visibleAlgorithms = new Set(algorithms.filter(algorithm => ["BFS", "DFS", "DIJKSTRA", "A*"].includes(algorithm)));
    syncDisplayFilterUI();
    selectLearningFromVisibleAlgorithms();
    addEvent(visibleAlgorithms.size === 0
        ? "MAZE VIEW • SEARCH LAYERS HIDDEN"
        : `MAZE VIEW • ${[...visibleAlgorithms].join(" + ")} VISIBLE`);
    updateLearningPanel(getCurrentLearningRun());
    drawMaze();
}

mazeFilterInputs.forEach(input => input.addEventListener("change", () => {
    const next = new Set([...visibleAlgorithms]);
    if (input.checked) next.add(input.dataset.mazeFilter);
    else next.delete(input.dataset.mazeFilter);
    setVisibleAlgorithms([...next]);
    RaceAudio.click();
}));

showAllAlgorithms?.addEventListener("click", () => {
    setVisibleAlgorithms(["BFS", "DFS", "DIJKSTRA", "A*"]);
    RaceAudio.click();
});

hideAllAlgorithms?.addEventListener("click", () => {
    setVisibleAlgorithms([]);
    RaceAudio.click();
});

socket.on("connect", () => {
    addEvent(`SCREEN CONNECTED • ${socket.io.engine.transport.name.toUpperCase()}`);
    console.log("[GP] screen connected", { socketId: socket.id, transport: socket.io.engine.transport.name });
});
socket.on("connect_error", error => {
    const code = error?.code;
    const message = code === "SHARED_STATE_REQUIRED"
        ? "SERVER NOT READY • CONNECT UPSTASH REDIS IN VERCEL"
        : (error?.message || "unknown");
    addEvent(`SCREEN CONNECTION ERROR • ${message}`);
    console.error("[GP] screen connect_error", error);
});
socket.io.on("reconnect_attempt", attempt => addEvent(`SCREEN RECONNECTING • ${attempt}`));
socket.io.on("reconnect", () => addEvent(`SCREEN RECONNECTED • ${socket.io.engine.transport.name.toUpperCase()}`));
socket.io.on("reconnect_error", error => console.error("[GP] screen reconnect_error", error));
socket.on("server_info", info => {
    console.log("[GP] server_info", info);
    if (Array.isArray(info?.addresses)) addEvent(`JOIN NETWORK • ${info.addresses.join(", ")}`);
});
socket.on("server_log", entry => {
    if (!entry) return;
    eventLog.push(`${entry.time || "--:--:--"} • [${String(entry.level || "INFO").toUpperCase()}] ${entry.message || entry.event || "SERVER EVENT"}`);
    if (eventLog.length > 24) eventLog.shift();
    renderEventLog();
});

socket.on("players_updated", players => {
    const nextPlayers = Array.isArray(players) ? players : [];
    if (Array.isArray(lastAudioPlayersSignature)) {
        const previousReal = lastAudioPlayersSignature.filter(player => !player.isBot).length;
        const nextReal = nextPlayers.filter(player => !player.isBot).length;
        const previousBots = lastAudioPlayersSignature.filter(player => player.isBot).length;
        const nextBots = nextPlayers.filter(player => player.isBot).length;
        const previousReady = lastAudioPlayersSignature.filter(player => player.ready).length;
        const nextReady = nextPlayers.filter(player => player.ready).length;
        if (nextReal > previousReal) RaceAudio.join();
        if (nextBots > previousBots) RaceAudio.bot();
        if (nextReady > previousReady && nextBots <= previousBots) RaceAudio.ready();
    }
    lastAudioPlayersSignature = nextPlayers.map(player => ({
        number: player.number,
        name: player.name,
        algorithm: player.algorithm,
        ready: player.ready,
        isBot: player.isBot
    }));
    currentPlayers = nextPlayers;
    updatePlayerCards();
    updateLobbySummary();
    updateBattlePanel();
    updateActivityPanel();
    updateLearningPanel(getCurrentLearningRun());
    drawMaze();
});

socket.on("round_reset", payload => {
    currentRound = Number(payload?.round) || currentRound;
    currentPlayers = Array.isArray(payload?.players) ? payload.players : [];
    addEvent(`ROUND ${String(currentRound).padStart(2, "0")} RESET • ALL OLD PLAYERS + BOTS REMOVED`);
    lastAudioPlayersSignature = [];
    RaceAudio.roundReset();
    resetRaceVisuals();
    updateRoundLabel();
    updateLobbySummary();
    updateBattlePanel();
    updateActivityPanel();
    updateLearningPanel(null);
    renderReportCard(getDefaultReportAlgorithm());
    drawMaze();
});

socket.on("new_round_rejected", payload => {
    addEvent(`NEW ROUND REJECTED • ${payload?.message || "unknown reason"}`);
    alert(payload?.message || "New round could not start.");
});

socket.on("maze_selected", mazeMap => {
    if (!mazeMap) return;
    currentRound = Number(mazeMap.round) || currentRound;
    currentMap = mazeMap;
    currentMaze = Array.isArray(mazeMap.maze)
        ? mazeMap.maze
        : generateMaze(mazeMap.size || MAZE_SIZE, mazeMap.seed);
    resetRaceVisuals();
    updateRoundLabel();
    if (roundFocus) roundFocus.textContent = `MAZE #${mazeMap.id || "—"} • ${String(mazeMap.name || "UNKNOWN MAZE").toUpperCase()} • ${ROUND_FOCUS[mazeMap.id] || "WATCH HOW THE ALGORITHMS THINK"}`;
    resetLearningDemo();
    updateActivityPanel();
    updateLearningPanel(null);
    drawMaze();
});

socket.on("race_start", data => {
    if (!data || !currentMaze || raceRunning || raceStartPending) return;
    if (data.round && currentRound && Number(data.round) !== currentRound) {
        addEvent(`IGNORED STALE RACE START • ROUND ${data.round}`);
        return;
    }
    startCountdown(data.players || currentPlayers);
});

socket.on("race_finished", payload => {
    if (!raceFinished) {
        raceFinished = true;
        raceRunning = false;
        if (payload && payload.results) raceResults = payload.results;
        renderFinalResults(payload?.order || finishOrder);
    }
});
socket.on("race_results", payload => {
    if (!payload) return;
    if (payload.round && currentRound && Number(payload.round) !== currentRound) {
        addEvent(`IGNORED STALE RESULTS • ROUND ${payload.round}`);
        return;
    }
    raceFinished = true;
    raceRunning = false;
    raceResults = payload.results || null;
    if (raceResults) {
        renderFinalResults(payload.order || raceResults.map(item => item.algorithm));
        updatePlayerCards();
    }
});

window.addEventListener("resize", drawMaze);

newRoundButton?.addEventListener("click", () => {
    if (raceRunning) {
        alert("Finish the current race before starting a new round.");
        return;
    }
    addEvent("NEW ROUND REQUESTED • CLEARING ALL PLAYER SESSIONS");
    RaceAudio.roundReset();
    newRoundButton.disabled = true;
    socket.emit("new_round", null, () => {});
});

fillBotsButton?.addEventListener("click", () => {
    if (raceRunning) return;
    RaceAudio.bot();
    fillBotsButton.disabled = true;
    socket.timeout(7000).emit("fill_bots", null, (error, response) => {
        if (error || !response?.ok) {
            fillBotsButton.disabled = false;
            if (response?.message) alert(response.message);
            return;
        }
        addEvent(`BOTS ADDED • ${response.algorithms?.join(" + ") || "remaining algorithms"}`);
        if (response.state?.players?.length >= 4) RaceAudio.fullLobby();
        updateLobbySummary(response.state?.players);
        updateBattlePanel(response.state?.players);
    });
});
reportButton?.addEventListener("click", () => {
    RaceAudio.report();
    reportCardModal?.classList.remove("hidden");
    renderReportCard(getDefaultReportAlgorithm());
});

speedButton?.addEventListener("click", () => {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    raceSpeed = SPEEDS[speedIndex];
    speedButton.textContent = `SPEED ${raceSpeed}×`;
    if (raceRunning && !racePaused) restartRaceTimer();
    RaceAudio.click();
});

pauseButton?.addEventListener("click", () => {
    if (!raceRunning) return;
    racePaused = !racePaused;
    pauseButton.textContent = racePaused ? "RESUME" : "PAUSE";
    pauseButton.classList.toggle("active", racePaused);
    if (racePaused) {
        clearRaceTimer();
        addEvent("RACE PAUSED • use STEP to advance one tick");
        RaceAudio.pause();
    } else {
        restartRaceTimer();
        addEvent("RACE RESUMED");
        RaceAudio.click();
    }
});

stepButton?.addEventListener("click", () => {
    if (!raceRunning) return;
    if (!racePaused) {
        racePaused = true;
        pauseButton.textContent = "RESUME";
        pauseButton.classList.add("active");
        clearRaceTimer();
    }
    advanceRace();
    RaceAudio.step();
});

learnButton?.addEventListener("click", () => {
    learnMode = !learnMode;
    learningPanel.classList.toggle("hidden-panel", !learnMode);
    learnButton.textContent = learnMode ? "LEARN ON" : "LEARN OFF";
    learnButton.classList.toggle("active", learnMode);
});

replayButton?.addEventListener("click", () => {
    if (!lastRacePlayers || !currentMaze || raceRunning) return;
    RaceAudio.replay();
    startCountdown(lastRacePlayers, true);
});

function updateLobbySummary(players = currentPlayers) {
    const list = Array.isArray(players) ? players : [];
    const connected = list.length;
    const ready = list.filter(player => player.ready).length;
    const bots = list.filter(player => player.isBot).length;
    const realPlayers = connected - bots;

    if (telemetryConnected) telemetryConnected.textContent = `${connected} / 4`;
    if (telemetryReady) telemetryReady.textContent = `${ready} / 4`;
    if (telemetryAlgorithms) {
        const algorithms = list.map(player => player.algorithm).filter(Boolean);
        telemetryAlgorithms.textContent = algorithms.length ? algorithms.join(" • ") : "—";
    }

    if (playersNeededScreen) {
        if (connected < 4) {
            const missing = 4 - connected;
            playersNeededScreen.textContent = `${missing} MORE PLAYER${missing === 1 ? "" : "S"} NEEDED TO START`;
        } else if (ready < 4) {
            const missing = 4 - ready;
            playersNeededScreen.textContent = `${missing} PLAYER${missing === 1 ? "" : "S"} STILL NEED TO READY`;
        } else {
            playersNeededScreen.textContent = bots ? `${bots} BOT${bots === 1 ? "" : "S"} FILLING EMPTY SLOTS` : "ALL 4 PLAYERS READY";
        }
    }

    if (fillBotsButton) {
        const realHaveAlgorithms = realPlayers === 0 || list.filter(player => !player.isBot).every(player => player.algorithm);
        fillBotsButton.disabled = raceRunning || connected >= 4 || !realHaveAlgorithms;
        fillBotsButton.textContent = connected >= 4 ? "LOBBY FULL" : "FILL LOBBY WITH BOTS";
    }

    updateBattlePanel(list);
}

function updateBattlePanel(players = currentPlayers) {
    if (!battleList) return;
    const list = Array.isArray(players) ? players : [];
    if (!list.length) {
        battleList.innerHTML = '<span class="support-muted">Waiting for players.</span>';
        return;
    }
    battleList.innerHTML = list.slice().sort((a,b) => Number(a.number) - Number(b.number)).map(player => {
        const algorithm = player.algorithm || "—";
        const run = raceRuns[algorithm];
        const explored = run ? run.exploredIndex : 0;
        const state = run?.reachedGoal ? "FINISHED" : run ? "RUNNING" : player.ready ? "READY" : "SETUP";
        const label = player.isBot ? `🤖 ${player.name}` : player.name;
        const loadout = algorithm === "DIJKSTRA"
            ? `SAND ${player.terrain?.length || 0}`
            : `WALLS ${player.walls?.length || 0}`;
        return `<div class="battle-row"><strong style="border-left:2px solid ${PLAYER_COLORS[player.number] || "#fff"};padding-left:6px">${escapeHtml(label || `PLAYER ${player.number}`)}</strong><span>${escapeHtml(algorithm)}</span><span>${state}</span><span>${loadout}</span></div>`;
    }).join("");
}

function updateRoundIntel() {
    if (!roundIntel) return;
    const players = currentPlayers.slice().sort((a,b) => Number(a.number) - Number(b.number));
    const bots = players.filter(player => player.isBot).length;
    const ready = players.filter(player => player.ready).length;
    const openCells = currentMaze ? currentMaze.reduce((sum, row) => sum + row.filter(cell => cell === 0).length, 0) : 0;
    const mazeLabel = currentMap ? `#${currentMap.id} • ${currentMap.name}` : "Waiting";

    const playerRows = players.length
        ? players.map(player => {
            const color = PLAYER_COLORS[player.number] || "#aaa";
            const status = player.ready ? (raceFinished ? "FINISHED" : raceRunning ? "READY" : "READY") : "CHOOSING";
            return `<div class="round-player-row"><span style="color:${color}">P${player.number}</span><strong>${escapeHtml(player.name || `PLAYER ${player.number}`)}</strong><span>${escapeHtml(player.algorithm || "CHOOSING")}</span><span>${player.isBot ? "BOT" : "REAL"} • ${status}</span></div>`;
        }).join("")
        : '<div class="round-player-row"><span>—</span><strong>No players connected</strong><span>—</span><span>SCAN QR</span></div>';

    let phase = "LOBBY";
    if (raceRunning) phase = "LIVE RACE";
    else if (raceFinished) phase = "ROUND COMPLETE";

    roundIntel.innerHTML = `
        <div class="round-intel-grid">
            <div><span>MAZE</span><strong>${escapeHtml(mazeLabel)}</strong></div>
            <div><span>SIZE</span><strong>${currentMaze ? `${currentMaze.length} × ${currentMaze[0]?.length || 0}` : "71 × 71"}</strong></div>
            <div><span>OPEN CELLS</span><strong>${openCells ? openCells.toLocaleString() : "—"}</strong></div>
            <div><span>PHASE</span><strong>${phase}</strong></div>
            <div><span>CONNECTED</span><strong>${players.length} / 4</strong></div>
            <div><span>READY</span><strong>${ready} / 4</strong></div>
            <div><span>BOTS</span><strong>${bots}</strong></div>
            <div><span>ALGORITHMS</span><strong>${players.map(p => p.algorithm).filter(Boolean).join(" • ") || "—"}</strong></div>
        </div>
        <div class="round-intel-player-list">
            <div class="round-intel-list-title">CONNECTED PLAYERS</div>
            ${playerRows}
        </div>`;
}

function updateRoundLabel() {
    if (roundLabel && currentMap) roundLabel.textContent = String(currentMap.round || currentMap.id || 1).padStart(2, "0");
}

function updatePlayerCards() {
    cards.forEach(card => {
        const heading = card.querySelector("h2");
        const status = card.querySelector("p");
        const dot = card.querySelector(".player-dot");
        const number = Number(card.dataset.playerCard);
        if (heading) {
            heading.textContent = `PLAYER ${number}`;
            heading.style.color = PLAYER_COLORS[number] || "#fff";
        }
        if (status) status.textContent = "WAITING";
        if (dot) dot.style.background = PLAYER_COLORS[number] || "#444";
        card.style.borderLeftColor = PLAYER_COLORS[number] || "#242424";
        card.classList.remove("active");
    });

    currentPlayers.forEach(player => {
        const card = document.querySelector(`[data-player-card="${player.number}"]`);
        if (!card) return;
        const heading = card.querySelector("h2");
        const status = card.querySelector("p");
        const dot = card.querySelector(".player-dot");
        const name = player.name || `PLAYER ${player.number}`;
        const algorithm = player.algorithm || "CHOOSING";
        if (heading) {
            heading.textContent = player.isBot ? name : name;
            heading.style.color = PLAYER_COLORS[player.number] || ALGORITHM_COLORS[player.algorithm] || "#fff";
        }
        if (dot) dot.style.background = PLAYER_COLORS[player.number] || "#444";
        card.style.borderLeftColor = PLAYER_COLORS[player.number] || "#242424";
        if (!status) return;

        const run = player.algorithm ? raceRuns[player.algorithm] : null;
        if (player.isBot && !raceRunning && !raceFinished) {
            const loadout = algorithm === "DIJKSTRA" ? `SAND ${player.terrain?.length || 0}` : `WALLS ${player.walls?.length || 0}`;
            status.textContent = `BOT • ${algorithm} • READY • ${loadout}`;
        } else if (raceRunning && run) {
            status.textContent = run.reachedGoal
                ? `P${player.number} • ${algorithm} • FINISHED • E ${run.exploredIndex}`
                : `P${player.number} • ${algorithm} • RUNNING • E ${run.exploredIndex}`;
            card.classList.toggle("active", true);
        } else if (raceFinished && run) {
            status.textContent = `P${player.number} • ${algorithm} • FINISHED • E ${run.explored.length}`;
        } else if (!player.algorithm) {
            status.textContent = `P${player.number} • CHOOSING ALGORITHM`;
        } else if (!player.ready) {
            status.textContent = `P${player.number} • ${algorithm} • SETTING UP`;
        } else {
            const h = algorithm === "A*" ? ` • H ${(player.heuristicWeight ?? 1).toFixed(1)}` : "";
            const prediction = player.prediction ? ` • PREDICT ${player.prediction}` : "";
            status.textContent = `P${player.number} • ${algorithm} • READY${h}${prediction}`;
        }
    });
}

function resetRaceVisuals() {
    clearRaceTimer();
    if (learningDemoTimer) clearInterval(learningDemoTimer);
    learningDemoTimer = null;
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    raceRuns = {};
    raceRunning = false;
    raceFinished = false;
    racePaused = false;
    raceStartPending = false;
    finishOrder = [];
    lastRacePlayers = null;
    raceResults = null;
    lastMilestone = {};
    eventLog = [];
    renderEventLog();
    if (pauseButton) { pauseButton.textContent = "PAUSE"; pauseButton.classList.remove("active"); }
    if (replayButton) replayButton.disabled = true;
    if (raceStatus) raceStatus.textContent = "WAITING FOR 4 PLAYERS";
    if (resultsPanel) resultsPanel.innerHTML = "";
    if (countdown) { countdown.textContent = ""; countdown.classList.remove("show"); }
    if (newRoundButton) newRoundButton.disabled = false;
    updateLearningPanel(null);
    updateLobbySummary();
    updateRoundIntel();
}

function startCountdown(players, replay = false) {
    if (!currentMaze) return;
    resetForRaceStart();
    lastRacePlayers = players.map(player => ({
        ...player,
        walls: [...(player.walls || [])],
        terrain: [...(player.terrain || [])]
    }));
    raceStartPending = true;
    let count = 3;
    countdown.textContent = String(count);
    countdown.classList.add("show");
    raceStatus.textContent = replay ? "REPLAY STARTING" : "GET READY";
    RaceAudio.countdown(count);

    countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
            countdown.textContent = String(count);
            RaceAudio.countdown(count);
            return;
        }
        clearInterval(countdownTimer);
        countdownTimer = null;
        countdown.textContent = "GO!";
        RaceAudio.go();
        RaceAudio.raceStart();
        setTimeout(() => {
            countdown.classList.remove("show");
            raceStartPending = false;
            startRace(players);
        }, 350);
    }, 750);
}

function startRace(players) {
    resetForRaceStart();
    const start = { ...START };
    const goal = { row: currentMaze.length - 2, col: currentMaze[0].length - 2 };
    const validPlayers = players.filter(player => player.ready && player.algorithm);

    for (const player of validPlayers) {
        let result = null;
        if (player.algorithm === "BFS") result = runBFS(currentMaze, start, goal, player.walls || []);
        if (player.algorithm === "DFS") result = runDFS(currentMaze, start, goal, player.walls || []);
        if (player.algorithm === "DIJKSTRA") result = runDijkstra(currentMaze, start, goal, player.walls || [], player.terrain || []);
        if (player.algorithm === "A*") result = runAStar(currentMaze, start, goal, player.walls || [], Number(player.heuristicWeight) || 1);
        if (!result) continue;

        const goalIndex = result.explored.findIndex(cell => cell.row === goal.row && cell.col === goal.col);
        raceRuns[player.algorithm] = {
            player,
            explored: result.explored || [],
            path: result.path || [],
            trace: result.trace || [],
            resultCost: result.cost,
            found: result.found,
            exploredIndex: 0,
            pathIndex: 0,
            goalIndex,
            reachedGoal: false,
            finished: false,
            finishTick: null
        };
    }

    if (Object.keys(raceRuns).length !== 4) {
        raceStatus.textContent = "WAITING FOR ALL 4 ALGORITHMS";
        return;
    }

    raceRunning = true;
    raceFinished = false;
    racePaused = false;
    finishOrder = [];
    raceClockStart = performance.now();
    raceResults = null;
    eventLog = [];
    addEvent("RACE STARTED • all four searches are running");
    raceStatus.textContent = "RACE IN PROGRESS";
    updateRoundIntel();
    updateBattlePanel();
    restartRaceTimer();
    startAnimationLoop();
    advanceRace();
}

function resetForRaceStart() {
    clearRaceTimer();
    if (learningDemoTimer) clearInterval(learningDemoTimer);
    learningDemoTimer = null;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    raceRuns = {};
    raceRunning = false;
    raceFinished = false;
    racePaused = false;
    finishOrder = [];
    eventLog = [];
    if (pauseButton) { pauseButton.textContent = "PAUSE"; pauseButton.classList.remove("active"); }
    if (replayButton) replayButton.disabled = true;
    renderEventLog();
    if (resultsPanel) resultsPanel.innerHTML = "";
}

function restartRaceTimer() {
    clearRaceTimer();
    if (!raceRunning || racePaused) return;
    const interval = Math.max(4, Math.round(42 / raceSpeed));
    raceTimer = setInterval(advanceRace, interval);
}

function clearRaceTimer() {
    if (raceTimer) clearInterval(raceTimer);
    raceTimer = null;
}

function startAnimationLoop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    const loop = () => {
        if (!raceRunning) { animationFrame = null; return; }
        drawMaze();
        animationFrame = requestAnimationFrame(loop);
    };
    animationFrame = requestAnimationFrame(loop);
}

function advanceRace() {
    if (!raceRunning) return;
    let active = false;

    for (const [algorithm, run] of Object.entries(raceRuns)) {
        if (!run.reachedGoal) {
            active = true;
            if (run.exploredIndex < run.explored.length) {
                run.exploredIndex++;
                const trace = run.trace[run.exploredIndex - 1];
                if (trace && run.exploredIndex % 5 === 0) RaceAudio.explore(algorithm);
                if (trace && run.exploredIndex === 1) addEvent(`${algorithm} started at ${formatCell(trace.cell)}`);
            }
            if (run.goalIndex >= 0 && run.exploredIndex > run.goalIndex) {
                run.reachedGoal = true;
                run.finished = true;
                run.finishTick = performance.now();
                finishOrder.push(algorithm);
                RaceAudio.finish(finishOrder.length);
                addEvent(`${run.player.name} • ${algorithm} reached the goal #${finishOrder.length}`);
            }
        } else if (run.pathIndex < run.path.length) {
            active = true;
            run.pathIndex++;
        }
    }

    updateLearningPanel(getCurrentLearningRun());
    updatePlayerCards();
    updateBattlePanel();
    updateTelemetryClock();

    if (finishOrder.length) raceStatus.textContent = `🏁 ${finishOrder[0]} • ${raceRuns[finishOrder[0]].player.name} FINISHED FIRST`;

    const allReached = Object.values(raceRuns).every(run => run.reachedGoal);
    const pathsDone = Object.values(raceRuns).every(run => run.pathIndex >= run.path.length);
    if (!active || (allReached && pathsDone)) finishRace();
}

function updateTelemetryClock() {
    if (!telemetryTime) return;
    if (!raceRunning || !raceClockStart) {
        telemetryTime.textContent = "00:00.00";
        return;
    }
    const seconds = Math.max(0, (performance.now() - raceClockStart) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    telemetryTime.textContent = `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function finishRace() {
    if (!raceRunning) return;
    clearRaceTimer();
    raceRunning = false;
    raceFinished = true;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    RaceAudio.victory();
    raceStatus.textContent = "RACE COMPLETE";
    addEvent(`RACE COMPLETE • order: ${finishOrder.join(" → ")}`);
    renderFinalResults(finishOrder);
    updatePlayerCards();
    updateRoundIntel();
    updateBattlePanel();
    updateActivityPanel();
    updateCalculationPanels(getCurrentLearningRun());
    replayButton.disabled = false;
    raceResults = buildRaceResults();
    renderReportCard(getDefaultReportAlgorithm());
    socket.emit("race_finished", { round: currentRound, order: finishOrder, results: raceResults });
}

function renderFinalResults(order) {
    if (!resultsPanel) return;
    resultsPanel.innerHTML = "";
    const title = document.createElement("div");
    title.className = "results-title";
    title.textContent = "RACE ANALYSIS • WHY THEY WON OR LOST";
    resultsPanel.appendChild(title);

    order.forEach((algorithm, index) => {
        const run = raceRuns[algorithm];
        if (!run) return;
        const learning = getAlgorithmLearning(algorithm);
        const row = document.createElement("article");
        row.className = "result-row";
        const place = document.createElement("div");
        place.className = "result-place";
        place.textContent = PLACE_LABELS[index + 1] || `#${index + 1}`;
        const placeColor = ({1:"#C62828",2:"#1565C0",3:"#2E7D32",4:"#EF6C00"})[index + 1] || "#fff";
        place.style.color = placeColor;
        
        const name = document.createElement("strong");
        name.textContent = run.player.name || `PLAYER ${run.player.number}`;
        const algo = document.createElement("span");
        algo.className = "result-algorithm";
        algo.textContent = algorithm;
        const cost = run.resultCost ?? (run.path.length ? run.path.length - 1 : 0);
        const stats = document.createElement("span");
        stats.className = "result-stats";
        stats.textContent = `EXPLORED ${run.explored.length} • PATH ${run.path.length} • COST ${cost}`;
        const explanation = document.createElement("div");
        explanation.className = "result-explanation";
        explanation.textContent = index === 0 ? learning.finish : learning.lost;
        const prediction = document.createElement("div");
        prediction.className = "result-prediction";
        if (run.player.prediction) {
            prediction.textContent = run.player.prediction === order[0]
                ? `PREDICTION ✓ ${run.player.prediction}`
                : `PREDICTION ✕ ${run.player.prediction}`;
        } else prediction.textContent = "NO PREDICTION";
        row.append(place, name, algo, stats, explanation, prediction);
        resultsPanel.appendChild(row);
    });
}

function getCurrentLearningRun() {
    const active = Object.values(raceRuns).filter(run => run.exploredIndex > 0 && !run.reachedGoal);
    if (active.length) return active.reduce((best, run) => run.exploredIndex > best.exploredIndex ? run : best, active[0]);
    if (finishOrder.length) return raceRuns[finishOrder[finishOrder.length - 1]];
    const first = Object.values(raceRuns).find(run => run.exploredIndex > 0);
    return first || null;
}


function algorithmForPlayerNumber(number) {
    const player = currentPlayers.find(item => Number(item.number) === Number(number));
    return player?.algorithm || `P${number}`;
}

function updateActivityPanel() {
    if (!algorithmActivity) return;
    const ordered = currentPlayers.slice().sort((a,b) => Number(a.number) - Number(b.number));
    const algorithms = ordered.length ? ordered : [
        { number: 1, algorithm: "BFS", name: "PLAYER 1" },
        { number: 2, algorithm: "DFS", name: "PLAYER 2" },
        { number: 3, algorithm: "DIJKSTRA", name: "PLAYER 3" },
        { number: 4, algorithm: "A*", name: "PLAYER 4" }
    ];
    algorithmActivity.innerHTML = algorithms.map(player => {
        const algorithm = player.algorithm || "—";
        const run = raceRuns[algorithm];
        const explored = run?.exploredIndex || 0;
        const total = run?.explored?.length || 0;
        const progress = total ? Math.min(100, (explored / total) * 100) : 0;
        const state = run?.reachedGoal ? "finished" : run ? "active" : "";
        const color = PLAYER_COLORS[player.number] || ALGORITHM_COLORS[algorithm] || "#777";
        const value = run ? `${Math.min(explored,total || explored)}` : "—";
        return `<div class="activity-row ${state}" style="--activity-color:${color}">\n            <div class="activity-name">${escapeHtml(player.isBot ? player.name : (player.name || `PLAYER ${player.number}`))}</div>\n            <div class="activity-track"><div class="activity-fill" style="width:${progress}%"></div><div class="activity-dot" style="left:${progress}%"></div></div>\n            <div class="activity-value">${escapeHtml(value)}</div>\n        </div>`;
    }).join("");
    if (!currentPlayers.length) {
        activityCaption.textContent = "Four tracks become active when the race starts.";
    } else if (raceRunning) {
        const active = Object.values(raceRuns).filter(run => run.exploredIndex > 0 && !run.reachedGoal).length;
        activityCaption.textContent = `${active} search${active === 1 ? " is" : "es are"} actively exploring. The pulse follows live node progress.`;
    } else if (raceFinished) {
        activityCaption.textContent = "All four searches finished. Track length reflects exploration progress.";
    } else {
        activityCaption.textContent = "Ready state shown. Track movement begins at GO.";
    }
}

function renderCalculationHistory(run) {
    if (!calculationHistory) return;
    if (!run || !run.trace?.length) {
        calculationHistory.innerHTML = "<span>Waiting for the first decision.</span>";
        if (calculationCount) calculationCount.textContent = "0";
        return;
    }
    const limit = 10;
    const end = Math.max(0, Math.min(run.trace.length, run.exploredIndex || 0));
    const start = Math.max(0, end - limit);
    const rows = run.trace.slice(start, end);
    if (calculationCount) calculationCount.textContent = String(end);
    calculationHistory.innerHTML = rows.map((item, offset) => {
        const step = start + offset + 1;
        const node = item.cell ? `${item.cell.row},${item.cell.col}` : "—";
        let action = item.reason || "Decision made";
        if (run.player.algorithm === "BFS") action = step === end ? "DEQUEUE → explore layer" : "VISITED / QUEUED";
        if (run.player.algorithm === "DFS") action = step === end ? "POP → continue deep" : "PUSH / BACKTRACK";
        if (run.player.algorithm === "DIJKSTRA") action = `g=${Number(item.g || 0).toFixed(0)} → lowest cost`;
        if (run.player.algorithm === "A*") action = `g=${Number(item.g || 0).toFixed(0)} h=${Number(item.h || 0).toFixed(0)} f=${Number(item.f || 0).toFixed(0)}`;
        return `<div class="calculation-row ${offset === rows.length-1 ? "latest" : ""}"><span class="calculation-step">${step}</span><span class="calculation-node">(${node})</span><span class="calculation-action">${escapeHtml(action)}</span></div>`;
    }).join("");
    calculationHistory.scrollTop = calculationHistory.scrollHeight;
}

function renderSearchStats(run) {
    if (!searchStats) return;
    if (!run) {
        searchStats.innerHTML = "";
        if (searchStatsStatus) searchStatsStatus.textContent = "—";
        return;
    }
    const explored = run.exploredIndex || 0;
    const discovered = new Set((run.explored || []).slice(0, explored).map(cell => `${cell.row},${cell.col}`)).size;
    const frontier = Array.isArray(run.trace?.[Math.max(0, explored - 1)]?.structure) ? run.trace[Math.max(0, explored - 1)].structure.length : 0;
    const path = run.reachedGoal ? run.path.length : "—";
    const cost = run.reachedGoal ? (run.resultCost ?? Math.max(0, run.path.length - 1)) : "—";
    const stats = [
        ["EXPLORED", explored],
        ["DISCOVERED", discovered],
        ["FRONTIER", frontier],
        ["PATH", path],
        ["COST", cost],
        ["BACKTRACKS", run.player.algorithm === "DFS" ? Math.max(0, explored - (run.path.length || 0)) : 0]
    ];
    searchStatsStatus.textContent = run.reachedGoal ? "DONE" : "LIVE";
    searchStats.innerHTML = stats.map(([label,value]) => `<div class="search-stat"><span>${label}</span><strong>${typeof value === "number" ? value.toLocaleString() : escapeHtml(value)}</strong></div>`).join("");
}

function updateCalculationPanels(run = getCurrentLearningRun()) {
    renderCalculationHistory(run);
    renderSearchStats(run);
}

function updateLearningPanel(run) {
    if (!run) {
        learningTitle.textContent = "WAITING";
        learningPersonality.textContent = "THE RACE WILL EXPLAIN ITSELF";
        learningLive.textContent = "When the race starts, this panel explains why the selected algorithm is exploring its current cell.";
        decisionText.textContent = "—";
        structureName.textContent = "DATA STRUCTURE";
        structureCount.textContent = "0";
        structureList.innerHTML = "<span>Waiting for the race.</span>";
        updateCalculationPanels(null);
        return;
    }

    const learning = getAlgorithmLearning(run.player.algorithm);
    const trace = run.trace[Math.max(0, Math.min(run.trace.length - 1, run.exploredIndex - 1))] || {};
    learningTitle.textContent = `${run.player.name || `P${run.player.number}`} • ${run.player.algorithm}`;
    learningTitle.style.color = learning.color;
    learningPersonality.textContent = learning.personality;
    learningLive.textContent = run.reachedGoal ? learning.finish : learning.live;
    decisionText.textContent = buildDecision(run.player.algorithm, trace, run.player.heuristicWeight);

    const structureLabels = {
        BFS: "QUEUE",
        DFS: "STACK",
        DIJKSTRA: "PRIORITY QUEUE",
        "A*": "OPEN SET"
    };
    structureName.textContent = structureLabels[run.player.algorithm] || "DATA STRUCTURE";
    const items = Array.isArray(trace.structure) ? trace.structure : [];
    structureCount.textContent = String(items.length);
    structureList.innerHTML = "";
    if (!items.length) {
        const empty = document.createElement("span");
        empty.textContent = "empty / waiting";
        structureList.appendChild(empty);
    } else {
        items.slice(0, 8).forEach(item => {
            const chip = document.createElement("span");
            if (typeof item.priority === "number") chip.textContent = `${item.row},${item.col} • ${item.priority.toFixed(1)}`;
            else chip.textContent = `${item.row},${item.col}`;
            structureList.appendChild(chip);
        });
    }
    updateCalculationPanels(run);
}

function buildDecision(algorithm, trace, weight) {
    if (!trace || !trace.cell) return "Waiting for a search decision.";
    const cell = formatCell(trace.cell);
    if (algorithm === "BFS") return `${cell} • oldest item in the queue → next layer`;
    if (algorithm === "DFS") return `${cell} • newest stack item → keep diving`;
    if (algorithm === "DIJKSTRA") return `${cell} • g(n) = ${Number(trace.g || 0).toFixed(0)} → cheapest known route`;
    return `${cell} • g=${Number(trace.g || 0).toFixed(0)} + ${(Number(weight) || 1).toFixed(1)}×h=${Number(trace.h || 0).toFixed(1)} → f=${Number(trace.f || 0).toFixed(1)}`;
}

function addEvent(message) {
    eventLog.push(`${new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })} • ${message}`);
    if (eventLog.length > 24) eventLog.shift();
    renderEventLog();
}

function renderEventLog() {
    if (!eventLogElement) return;
    eventLogElement.innerHTML = "";
    eventLog.slice(-8).reverse().forEach(message => {
        const row = document.createElement("div");
        row.textContent = message;
        eventLogElement.appendChild(row);
    });
    if (eventCount) eventCount.textContent = String(eventLog.length);
}

function formatCell(cell) { return `(${cell.row}, ${cell.col})`; }

function drawMaze() {
    if (!currentMaze || !mazeContainer) return;
    const rows = currentMaze.length;
    const cols = currentMaze[0].length;
    const width = mazeContainer.clientWidth;
    const height = mazeContainer.clientHeight;
    const cellSize = Math.min(width / cols, height / rows);
    const mazeWidth = cellSize * cols;
    const mazeHeight = cellSize * rows;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = mazeWidth * dpr;
    canvas.height = mazeHeight * dpr;
    canvas.style.width = `${mazeWidth}px`;
    canvas.style.height = `${mazeHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, mazeWidth, mazeHeight);

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = col * cellSize;
            const y = row * cellSize;
            if (currentMaze[row][col] === 1) {
                ctx.fillStyle = "#6B4423";
                ctx.fillRect(x, y, cellSize, cellSize);
                ctx.strokeStyle = "#3E2817";
                ctx.lineWidth = Math.max(1, cellSize * .08);
                ctx.strokeRect(x, y, cellSize, cellSize);
            } else {
                ctx.fillStyle = "#F2E8D5";
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        }
    }

    currentPlayers.forEach(player => {
        if (player.algorithm !== "DIJKSTRA") return;
        (player.terrain || []).forEach(cell => drawSand(cell, cellSize, player.number));
    });

    currentPlayers.forEach(player => {
        (player.walls || []).forEach(wall => {
            ctx.fillStyle = PLAYER_COLORS[player.number] || "#fff";
            ctx.fillRect(wall.col * cellSize, wall.row * cellSize, cellSize, cellSize);
            ctx.fillStyle = "rgba(255,255,255,.18)";
            ctx.fillRect(wall.col * cellSize + cellSize*.2, wall.row * cellSize + cellSize*.2, cellSize*.6, Math.max(1, cellSize*.08));
        });
    });

    drawRaceOverlay(cellSize);
    drawRunnerMarkers(cellSize);
    drawMarker(1, 1, cellSize, "S");
    drawMarker(rows - 2, cols - 2, cellSize, "G");
}

function drawSand(cell, cellSize, number) {
    const x = cell.col * cellSize;
    const y = cell.row * cellSize;
    ctx.fillStyle = "#D8C28A";
    ctx.fillRect(x, y, cellSize, cellSize);
    ctx.fillStyle = "#B9A36F";
    const dot = Math.max(1, cellSize*.08);
    ctx.fillRect(x+cellSize*.25, y+cellSize*.3, dot, dot);
    ctx.fillRect(x+cellSize*.7, y+cellSize*.65, dot, dot);
    ctx.strokeStyle = PLAYER_COLORS[number] || "#fff";
    ctx.lineWidth = Math.max(1, cellSize*.06);
    ctx.strokeRect(x+1, y+1, Math.max(0, cellSize-2), Math.max(0, cellSize-2));
}

function drawRaceOverlay(cellSize) {
    // Exploration uses the player's normal slot colour and fills each searched
    // cell completely. A fresh open cell remains neutral so the search spread
    // is easy to explain from a distance.
    for (const [algorithm, run] of Object.entries(raceRuns)) {
        if (!visibleAlgorithms.has(algorithm) || run.reachedGoal) continue;
        const color = PLAYER_COLORS[run.player.number] || ALGORITHM_COLORS[algorithm];
        const start = Math.max(0, run.exploredIndex - 1200);
        for (let i = start; i < run.exploredIndex; i++) {
            const cell = run.explored[i];
            if (!cell || isStartOrGoal(cell)) continue;
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.82;
            ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize, cellSize);
            ctx.globalAlpha = 1;
        }
    }

    // Final route: one normal-colour continuous line, no gold, glow,
    // highlight, or brighter outline.
    for (const [algorithm, run] of Object.entries(raceRuns)) {
        if (!visibleAlgorithms.has(algorithm)) continue;
        const color = PLAYER_COLORS[run.player.number] || ALGORITHM_COLORS[algorithm];
        const pathCells = (run.path || []).slice(0, run.pathIndex);
        if (pathCells.length < 2) continue;

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.6, cellSize * 0.34);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const first = pathCells[0];
        ctx.moveTo(first.col * cellSize + cellSize / 2, first.row * cellSize + cellSize / 2);
        for (let i = 1; i < pathCells.length; i++) {
            const cell = pathCells[i];
            ctx.lineTo(cell.col * cellSize + cellSize / 2, cell.row * cellSize + cellSize / 2);
        }
        ctx.stroke();
        ctx.restore();
    }
}

function drawRunnerMarkers(cellSize) {
    const pulse = .5 + Math.sin(Date.now()/130)*.18;
    for (const [algorithm, run] of Object.entries(raceRuns)) {
        if (!visibleAlgorithms.has(algorithm) || run.exploredIndex <= 0) continue;
        const cell = run.reachedGoal ? run.path[run.path.length-1] : run.explored[Math.min(run.exploredIndex-1, run.explored.length-1)];
        if (!cell || isStartOrGoal(cell)) continue;
        const x = cell.col*cellSize+cellSize/2;
        const y = cell.row*cellSize+cellSize/2;
        const radius = Math.max(2, cellSize*(.24+pulse*.03));
        ctx.save();
        ctx.fillStyle = PLAYER_COLORS[run.player.number] || ALGORITHM_COLORS[algorithm];
        ctx.fillRect(x-radius, y-radius, radius*2, radius*2);
        ctx.restore();
    }
}

function isStartOrGoal(cell) {
    return (cell.row===1 && cell.col===1) || (cell.row===currentMaze.length-2 && cell.col===currentMaze[0].length-2);
}

function drawMarker(row,col,cellSize,text) {
    const x=col*cellSize+cellSize/2, y=row*cellSize+cellSize/2;
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle="#f7f2ea";
    ctx.fillRect(x-Math.max(3,cellSize*.24), y-Math.max(3,cellSize*.24), Math.max(6,cellSize*.48), Math.max(6,cellSize*.48));
    ctx.fillStyle="#1a1a1a";
    ctx.font=`bold ${Math.max(8,cellSize*.35)}px Arial`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(text,x,y);
    ctx.restore();
}

canvas.addEventListener("pointermove", showMazeTooltip);
canvas.addEventListener("pointerleave", hideMazeTooltip);

function showMazeTooltip(event) {
    if (!currentMaze || !mazeTooltip) return;
    const rect=canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const col=Math.floor(((event.clientX-rect.left)/rect.width)*currentMaze[0].length);
    const row=Math.floor(((event.clientY-rect.top)/rect.height)*currentMaze.length);
    if (row<0 || row>=currentMaze.length || col<0 || col>=currentMaze[0].length) return hideMazeTooltip();

    const wallOwner=currentPlayers.find(p=>(p.walls||[]).some(c=>c.row===row&&c.col===col));
    const sandOwner=currentPlayers.find(p=>p.algorithm==="DIJKSTRA"&&(p.terrain||[]).some(c=>c.row===row&&c.col===col));
    let owner=wallOwner||sandOwner;
    let type=wallOwner?"WALL":sandOwner?"SAND":"";

    if (!owner) {
        const runner=Object.values(raceRuns).find(run=>run.exploredIndex>0 && (()=>{const c=run.reachedGoal?run.path[run.path.length-1]:run.explored[Math.min(run.exploredIndex-1,run.explored.length-1)]; return c&&c.row===row&&c.col===col;})());
        if (runner) { owner=runner.player; type="SEARCHER"; }
    }
    if (!owner) return hideMazeTooltip();
    const name=owner.name||`PLAYER ${owner.number}`;
    const algorithm=owner.algorithm||"UNKNOWN";
    const extra=type==="SAND"?"<br>Movement cost: 6":"";
    mazeTooltip.innerHTML=`<strong>${type} • PLAYER ${owner.number}</strong>${escapeHtml(name)} • ${escapeHtml(algorithm)}<br>Cell ${row}, ${col}${extra}`;
    mazeTooltip.style.display="block";
    const cr=mazeContainer.getBoundingClientRect();
    mazeTooltip.style.left=`${Math.min(event.clientX-cr.left+12,Math.max(0,cr.width-270))}px`;
    mazeTooltip.style.top=`${Math.min(event.clientY-cr.top+12,Math.max(0,cr.height-65))}px`;
}

function hideMazeTooltip(){ if(mazeTooltip) mazeTooltip.style.display="none"; }
function escapeHtml(value){ return String(value).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[ch])); }

function loadQR() {
    fetch("/api/join", { cache: "no-store" })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (qrImage && data.qr) {
                qrImage.src = data.qr;
                qrImage.style.display = "block";
            }
            if (joinUrl && data.url) joinUrl.textContent = data.url;
            if (Array.isArray(data.addresses) && data.addresses.length) {
                addEvent(`QR READY • ${data.addresses.join(", ")}`);
            } else if (data.url) {
                addEvent(`QR READY • ${data.url}`);
            }
            console.log("[GP] QR join data", data);
        })
        .catch(error => {
            const fallback = `${location.origin}/controller?join=new`;
            if (joinUrl) joinUrl.textContent = fallback;
            addEvent(`QR ERROR • ${error.message}`);
            console.error("QR error:", error);
        });
}

syncDisplayFilterUI();
loadQR();
updateLobbySummary();
updateRoundIntel();

function getDefaultReportAlgorithm() {
    return raceResults?.length ? raceResults[0].algorithm : (currentPlayers.find(p => p.algorithm)?.algorithm || "BFS");
}

function getBaselineMetrics() {
    if (!currentMaze) return { pathLength: 0, cost: 0 };
    const goal = { row: currentMaze.length - 2, col: currentMaze[0].length - 2 };
    const baseline = runBFS(currentMaze, START, goal, []);
    return {
        pathLength: baseline.path?.length || 0,
        cost: baseline.path?.length ? baseline.path.length - 1 : 0
    };
}

function countOpenCells() {
    if (!currentMaze) return 0;
    let count = 0;
    for (const row of currentMaze) for (const cell of row) if (cell === 0) count++;
    return count;
}

function countPathTurns(path) {
    if (!Array.isArray(path) || path.length < 3) return 0;
    let turns = 0;
    let prev = null;
    for (let i = 1; i < path.length; i++) {
        const direction = `${Math.sign(path[i].row - path[i-1].row)},${Math.sign(path[i].col - path[i-1].col)}`;
        if (prev && direction !== prev) turns++;
        prev = direction;
    }
    return turns;
}

function buildRaceResults() {
    const baseline = getBaselineMetrics();
    const openCells = countOpenCells();
    const raw = finishOrder.map((algorithm, index) => {
        const run = raceRuns[algorithm];
        if (!run) return null;
        const player = run.player;
        const timeMs = Math.max(0, (run.finishTick || performance.now()) - raceClockStart);
        const pathLength = run.path.length;
        const weightedCost = run.resultCost ?? (pathLength ? pathLength - 1 : 0);
        const peakFrontier = run.trace.length
            ? Math.max(...run.trace.map(item => Array.isArray(item.structure) ? item.structure.length : 0))
            : 0;
        const goalExploreIndex = run.explored.findIndex(cell => cell.row === currentMaze.length - 2 && cell.col === currentMaze[0].length - 2);
        const exploredPercent = openCells ? Number(((run.explored.length / openCells) * 100).toFixed(1)) : 0;
        const extraSteps = pathLength && baseline.pathLength ? Math.max(0, pathLength - baseline.pathLength) : 0;
        return {
            round: currentRound,
            mazeName: currentMap?.name || "—",
            mazeSeed: currentMap?.seed || 0,
            place: index + 1,
            algorithm,
            playerNumber: player.number,
            playerName: player.name || `PLAYER ${player.number}`,
            timeMs,
            timeSeconds: Number((timeMs / 1000).toFixed(2)),
            explored: run.explored.length,
            openCells,
            exploredPercent,
            pathLength,
            baselinePathLength: baseline.pathLength,
            extraSteps,
            cost: weightedCost,
            baselineCost: baseline.cost,
            peakFrontier,
            decisions: run.trace.length,
            goalExploreIndex: goalExploreIndex >= 0 ? goalExploreIndex + 1 : null,
            pathTurns: countPathTurns(run.path),
            walls: player.walls || [],
            terrain: player.terrain || [],
            heuristicWeight: Number(player.heuristicWeight || 1),
            prediction: player.prediction || null,
            predictionCorrect: player.prediction === algorithm,
            found: Boolean(run.found),
            traceLength: run.trace.length
        };
    }).filter(Boolean);

    const winnerTime = raw.length ? raw[0].timeSeconds : 0;
    return raw.map(result => ({
        ...result,
        gapFromWinnerSeconds: Number(Math.max(0, result.timeSeconds - winnerTime).toFixed(2)),
        routeFocusPercent: result.explored ? Number(((result.pathLength / result.explored) * 100).toFixed(1)) : 0
    }));
}

function resultForAlgorithm(algorithm) {
    if (Array.isArray(raceResults)) {
        const found = raceResults.find(item => item.algorithm === algorithm);
        if (found) return found;
    }
    const run = raceRuns[algorithm];
    if (!run) return null;
    const index = finishOrder.indexOf(algorithm);
    return {
        place: index >= 0 ? index + 1 : 4,
        algorithm,
        playerNumber: run.player.number,
        playerName: run.player.name || `PLAYER ${run.player.number}`,
        timeMs: Math.max(0, (run.finishTick || performance.now()) - raceClockStart),
        timeSeconds: Number((Math.max(0, (run.finishTick || performance.now()) - raceClockStart) / 1000).toFixed(2)),
        explored: run.explored.length,
        pathLength: run.path.length,
        cost: run.resultCost ?? Math.max(0, run.path.length - 1),
        walls: run.player.walls || [],
        terrain: run.player.terrain || [],
        heuristicWeight: Number(run.player.heuristicWeight || 1),
        prediction: run.player.prediction || null
    };
}

function reportExplanation(result) {
    if (!result) return "No result yet.";
    const rankLine = result.place === 1
        ? "This search reached the goal first."
        : `This search finished in ${result.place}${result.place === 2 ? "nd" : result.place === 3 ? "rd" : "th"} place.`;
    const learning = getAlgorithmLearning(result.algorithm);
    const extra = Number(result.extraSteps ?? 0);
    const efficiency = Number(result.routeFocusPercent ?? (result.explored ? ((result.pathLength / result.explored) * 100) : 0)).toFixed(1);
    return `${rankLine} ${learning.finish} It explored ${Number(result.explored || 0).toLocaleString()} of ${Number(result.openCells || 0).toLocaleString()} open cells, produced a ${result.pathLength || 0}-cell route, and used ${result.cost ?? 0} travel cost. Baseline route: ${result.baselinePathLength || "—"}; extra steps: ${extra}. Search focus ratio: ${efficiency}%.`;
}

function formatCells(cells) {
    if (!Array.isArray(cells) || !cells.length) return "None";
    return cells.map(cell => `(${cell.row}, ${cell.col})`).join(" • ");
}

function renderReportCard(algorithm) {
    const result = resultForAlgorithm(algorithm);
    if (!reportCardBody) return;
    reportTabs.forEach(button => button.classList.toggle("active", button.dataset.reportAlgorithm === algorithm));
    if (!result) {
        reportCardBody.innerHTML = `<div class="report-card-note">Waiting for ${escapeHtml(algorithm)} to race.</div>`;
        return;
    }

    const h = algorithm === "A*" ? Number(result.heuristicWeight || 1).toFixed(1) : "—";
    const terrain = result.terrain?.length || 0;
    const walls = result.walls?.length || 0;
    const prediction = result.prediction || "—";
    const predictionResult = result.prediction ? (result.predictionCorrect ? "CORRECT" : "MISS") : "—";

    reportCardBody.innerHTML = `
        <div class="report-card-section-title">IDENTITY</div>
        <div class="report-card-grid">
            <div class="report-stat"><span>PLAYER</span><strong>${escapeHtml(result.playerName)}</strong></div>
            <div class="report-stat"><span>PLAYER #</span><strong>${result.playerNumber}</strong></div>
            <div class="report-stat"><span>POSITION</span><strong>#${result.place}</strong></div>
            <div class="report-stat"><span>ALGORITHM</span><strong>${escapeHtml(result.algorithm)}</strong></div>
            <div class="report-stat"><span>ROUND</span><strong>${result.round ?? currentRound}</strong></div>
            <div class="report-stat"><span>MAZE</span><strong>${escapeHtml(result.mazeName || currentMap?.name || "—")}</strong></div>
        </div>

        <div class="report-card-section-title">RACE PERFORMANCE</div>
        <div class="report-card-grid">
            <div class="report-stat"><span>FINISH TIME</span><strong>${Number(result.timeSeconds || 0).toFixed(2)}s</strong></div>
            <div class="report-stat"><span>GAP FROM WINNER</span><strong>${Number(result.gapFromWinnerSeconds || 0).toFixed(2)}s</strong></div>
            <div class="report-stat"><span>NODES EXPLORED</span><strong>${Number(result.explored || 0).toLocaleString()}</strong></div>
            <div class="report-stat"><span>OPEN CELLS</span><strong>${Number(result.openCells || 0).toLocaleString()}</strong></div>
            <div class="report-stat"><span>EXPLORATION COVERAGE</span><strong>${Number(result.exploredPercent || 0).toFixed(1)}%</strong></div>
            <div class="report-stat"><span>GOAL DISCOVERED AT</span><strong>${result.goalExploreIndex ?? "—"}</strong></div>
        </div>

        <div class="report-card-section-title">ROUTE QUALITY</div>
        <div class="report-card-grid">
            <div class="report-stat"><span>PATH LENGTH</span><strong>${result.pathLength || 0}</strong></div>
            <div class="report-stat"><span>BASELINE SHORTEST</span><strong>${result.baselinePathLength || "—"}</strong></div>
            <div class="report-stat"><span>EXTRA STEPS</span><strong>${result.extraSteps ?? "—"}</strong></div>
            <div class="report-stat"><span>TRAVEL COST</span><strong>${Number(result.cost || 0).toFixed(0)}</strong></div>
            <div class="report-stat"><span>BASELINE COST</span><strong>${Number(result.baselineCost || 0).toFixed(0)}</strong></div>
            <div class="report-stat"><span>PATH TURNS</span><strong>${result.pathTurns ?? "—"}</strong></div>
        </div>

        <div class="report-card-section-title">ALGORITHM BEHAVIOR</div>
        <div class="report-card-grid">
            <div class="report-stat"><span>PEAK FRONTIER</span><strong>${result.peakFrontier ?? "—"}</strong></div>
            <div class="report-stat"><span>DECISIONS</span><strong>${result.decisions ?? result.traceLength ?? "—"}</strong></div>
            <div class="report-stat"><span>SEARCH FOCUS</span><strong>${Number(result.routeFocusPercent || 0).toFixed(1)}%</strong></div>
            <div class="report-stat"><span>HEURISTIC</span><strong>${h}</strong></div>
            <div class="report-stat"><span>WALLS</span><strong>${walls}</strong></div>
            <div class="report-stat"><span>SAND</span><strong>${terrain}</strong></div>
        </div>

        <div class="report-card-section-title">PLAYER DECISIONS</div>
        <div class="report-card-note"><strong>PREDICTION:</strong> ${escapeHtml(prediction)} • <strong>${predictionResult}</strong><br><strong>WALL CELLS:</strong> ${escapeHtml(formatCells(result.walls))}<br><strong>SAND CELLS:</strong> ${escapeHtml(formatCells(result.terrain))}</div>

        <div class="report-card-note">${escapeHtml(reportExplanation(result))}</div>
    `;
}

reportTabs.forEach(button => button.addEventListener("click", () => {
    renderReportCard(button.dataset.reportAlgorithm);
}));
reportCardClose?.addEventListener("click", () => reportCardModal?.classList.add("hidden"));
resultsPanel?.addEventListener("click", event => {
    if (event.target.closest(".result-row")) {
        reportCardModal?.classList.remove("hidden");
        const row = event.target.closest(".result-row");
        const algo = row.querySelector(".result-algorithm")?.textContent;
        if (algo) renderReportCard(algo);
    }
});
resultsPanel?.addEventListener("dblclick", () => reportCardModal?.classList.remove("hidden"));

function openQrModal() {
    if (!qrImage?.src) return;
    RaceAudio.report();
    qrLarge.src = qrImage.src;
    qrModalUrl.textContent = joinUrl?.textContent || "";
    qrModal.classList.remove("hidden");
}
qrBox?.addEventListener("click", openQrModal);
qrBox?.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openQrModal();
    }
});
qrModalClose?.addEventListener("click", () => qrModal?.classList.add("hidden"));
qrModal?.addEventListener("click", event => {
    if (event.target === qrModal) qrModal.classList.add("hidden");
});

learningSelectorButtons.forEach(button => button.addEventListener("click", () => {
    selectedLearningAlgorithm = button.dataset.learnAlgorithm;
    learningSelectorButtons.forEach(btn => btn.classList.toggle("active", btn === button));
    resetLearningDemo();
    updateLearningPanel();
    drawMaze();
}));

learningDemoStep?.addEventListener("click", () => {
    ensureLearningDemo();
    const run = learningDemoRuns[selectedLearningAlgorithm];
    if (!run) return;
    learningDemoIndex = Math.min(run.explored.length, learningDemoIndex + 1);
    RaceAudio.step();
    updateLearningPanel();
    drawMaze();
});

learningDemoReset?.addEventListener("click", () => {
    resetLearningDemo();
    RaceAudio.click();
    updateLearningPanel();
    drawMaze();
});

learningDemoPlay?.addEventListener("click", () => {
    ensureLearningDemo();
    const run = learningDemoRuns[selectedLearningAlgorithm];
    if (!run) return;
    if (learningDemoTimer) {
        clearInterval(learningDemoTimer);
        learningDemoTimer = null;
        learningDemoPlay.textContent = "PLAY";
        return;
    }
    learningDemoPlay.textContent = "PAUSE";
    learningDemoTimer = setInterval(() => {
        if (learningDemoIndex >= run.explored.length) {
            clearInterval(learningDemoTimer);
            learningDemoTimer = null;
            learningDemoPlay.textContent = "PLAY";
            return;
        }
        learningDemoIndex++;
        updateLearningPanel();
        drawMaze();
    }, 35);
});

function ensureLearningDemo() {
    if (!currentMaze) return;
    if (!learningDemoRuns[selectedLearningAlgorithm]) {
        const goal = { row: currentMaze.length - 2, col: currentMaze[0].length - 2 };
        if (selectedLearningAlgorithm === "BFS") learningDemoRuns.BFS = runBFS(currentMaze, START, goal, []);
        if (selectedLearningAlgorithm === "DFS") learningDemoRuns.DFS = runDFS(currentMaze, START, goal, []);
        if (selectedLearningAlgorithm === "DIJKSTRA") learningDemoRuns.DIJKSTRA = runDijkstra(currentMaze, START, goal, [], []);
        if (selectedLearningAlgorithm === "A*") learningDemoRuns["A*"] = runAStar(currentMaze, START, goal, [], 1);
    }
}

function resetLearningDemo() {
    if (learningDemoTimer) clearInterval(learningDemoTimer);
    learningDemoTimer = null;
    learningDemoRuns = {};
    learningDemoPlay && (learningDemoPlay.textContent = "PLAY");
    learningDemoIndex = 0;
    if (currentMaze) ensureLearningDemo();
    learningSelectorButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.learnAlgorithm === selectedLearningAlgorithm));
}

const originalUpdateLearningPanel = updateLearningPanel;
updateLearningPanel = function(run) {
    if (raceRunning && raceRuns[selectedLearningAlgorithm]) {
        originalUpdateLearningPanel(raceRuns[selectedLearningAlgorithm]);
        return;
    }
    if (!raceRunning && !raceFinished && learnMode) {
        ensureLearningDemo();
        const demo = learningDemoRuns[selectedLearningAlgorithm];
        if (!demo) return originalUpdateLearningPanel(run);
        const trace = demo.trace[Math.max(0, Math.min(demo.trace.length - 1, learningDemoIndex - 1))] || demo.trace[0] || {};
        const learning = getAlgorithmLearning(selectedLearningAlgorithm);
        learningTitle.textContent = `${learning.title}`;
        learningTitle.style.color = learning.color;
        learningPersonality.textContent = `${learning.personality} • ${learningDemoIndex}/${demo.explored.length}`;
        learningLive.textContent = learning.live;
        decisionText.textContent = buildDecision(selectedLearningAlgorithm, trace, 1);
        const structureLabels = { BFS:"QUEUE", DFS:"STACK", DIJKSTRA:"PRIORITY QUEUE", "A*":"OPEN SET" };
        structureName.textContent = structureLabels[selectedLearningAlgorithm];
        const items = Array.isArray(trace.structure) ? trace.structure : [];
        structureCount.textContent = String(items.length);
        structureList.innerHTML = items.slice(0,8).map(item =>
            `<span>${item.row},${item.col}${typeof item.priority === "number" ? ` • ${Number(item.priority).toFixed(1)}` : ""}</span>`
        ).join("") || "<span>empty</span>";
        return;
    }
    originalUpdateLearningPanel(run);
};

const originalDrawMaze = drawMaze;
drawMaze = function() {
    originalDrawMaze();
    if (!raceRunning && learnMode && currentMaze) {
        ensureLearningDemo();
        if (!visibleAlgorithms.has(selectedLearningAlgorithm)) return;
        const run = learningDemoRuns[selectedLearningAlgorithm];
        if (!run) return;
        const width = mazeContainer.clientWidth;
        const height = mazeContainer.clientHeight;
        const rows = currentMaze.length;
        const cols = currentMaze[0].length;
        const cellSize = Math.min(width / cols, height / rows);
        const maxNodes = Math.min(learningDemoIndex, run.explored.length);
        ctx.save();
        ctx.globalAlpha = .28;
        ctx.fillStyle = ALGORITHM_COLORS[selectedLearningAlgorithm];
        for (let i = 0; i < maxNodes; i++) {
            const cell = run.explored[i];
            if (isStartOrGoal(cell)) continue;
            ctx.fillRect(cell.col * cellSize + cellSize*.12, cell.row * cellSize + cellSize*.12, cellSize*.76, cellSize*.76);
        }
        if (learningDemoIndex >= run.explored.length && run.path.length > 1) {
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.strokeStyle = ALGORITHM_COLORS[selectedLearningAlgorithm];
            ctx.lineWidth = Math.max(1.6, cellSize * 0.34);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            const first = run.path[0];
            ctx.moveTo(first.col * cellSize + cellSize / 2, first.row * cellSize + cellSize / 2);
            for (let i = 1; i < run.path.length; i++) {
                const cell = run.path[i];
                ctx.lineTo(cell.col * cellSize + cellSize / 2, cell.row * cellSize + cellSize / 2);
            }
            ctx.stroke();
        }
        ctx.restore();
    }
};

window.addEventListener("resize", drawMaze);
