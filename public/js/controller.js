const socket = createRealtimeClient("player");


const algorithmButtons = document.querySelectorAll(".algorithm-card");
const selectedSection = document.getElementById("selected-section");
const selectedAlgorithmText = document.getElementById("selected-algorithm");
const astarControl = document.getElementById("astar-control");
const heuristicSlider = document.getElementById("heuristic");
const heuristicValue = document.getElementById("heuristic-value");
const readyButton = document.getElementById("ready-button");
const connectionStatus = document.getElementById("connection-status");
const mazeName = document.getElementById("maze-name");
const mazeMessage = document.getElementById("maze-message");
const canvas = document.getElementById("controller-maze-canvas");
const viewport = document.getElementById("maze-viewport");
const ctx = canvas.getContext("2d");
const zoomValue = document.getElementById("zoom-value");
const resetViewButton = document.getElementById("reset-view");
const subtitle = document.getElementById("player-subtitle");
const playerNameInput = document.getElementById("player-name");
const saveNameButton = document.getElementById("save-name");
const nameMessage = document.getElementById("name-message");
const nameState = document.getElementById("name-state");
const predictionSection = document.getElementById("prediction-section");
const predictionButtons = document.querySelectorAll(".prediction-button");
const predictionMessage = document.getElementById("prediction-message");
const mobileResults = document.getElementById("mobile-results");
const mobileRanking = document.getElementById("mobile-ranking");
const mobileOwnReport = document.getElementById("mobile-own-report");
const mobileCelebration = document.getElementById("mobile-celebration");
const celebrationPlace = document.getElementById("celebration-place");
const celebrationName = document.getElementById("celebration-name");
const mobileSound = document.getElementById("mobile-sound");
const algorithmHint = document.getElementById("algorithm-hint");

let playerNumber = null;
let selectedAlgorithm = null;
let playerName = "";
let prediction = null;
let currentMaze = null;
let playerWalls = [];
let playerTerrain = [];
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let pointerDown = false;
let pointerMoved = false;
let lastPointerX = 0;
let lastPointerY = 0;
let pinchDistance = null;
let currentRound = 0;
let reconnectingWithSavedName = false;
let nameSavePending = false;

function getStoredPlayerName() {
    try {
        return localStorage.getItem("agp.playerName") || "";
    } catch (_) {
        return "";
    }
}

function storePlayerName(name) {
    try {
        localStorage.setItem("agp.playerName", name);
    } catch (_) {}
}

function applyPlayerName(name) {
    playerName = String(name || "").trim();
    if (!playerName) return;
    storePlayerName(playerName);
    if (playerNameInput) {
        playerNameInput.value = playerName;
        playerNameInput.disabled = true;
    }
    if (saveNameButton) saveNameButton.disabled = true;
    if (nameState) nameState.textContent = "SET";
    if (nameMessage) {
        nameMessage.textContent = `Playing as ${playerName}`;
        nameMessage.className = "name-message success";
    }
    if (subtitle) subtitle.textContent = `PLAYER ${playerNumber} • ${playerName}`;
    algorithmButtons.forEach(button => {
        button.disabled = false;
    });
}

function showNameSaveError(message) {
    nameSavePending = false;
    if (saveNameButton) saveNameButton.disabled = false;
    if (playerNameInput) playerNameInput.disabled = false;
    if (nameMessage) {
        nameMessage.textContent = message;
        nameMessage.className = "name-message error";
    }
}

const storedPlayerName = getStoredPlayerName();
if (storedPlayerName && playerNameInput) {
    playerName = storedPlayerName;
    playerNameInput.value = storedPlayerName;
}

const MAX_WALLS = 2;
const MAX_TERRAIN = 2;
const PLAYER_COLORS = { 1: "#EF4056", 2: "#4B8DB8", 3: "#28A69A", 4: "#9B5DE5" };

const ALGORITHM_HINTS = {
    BFS: "Explorer • queue • layer by layer • shortest steps on equal-cost cells",
    DFS: "Diver • stack • deep branch first • backtracks when a branch fails",
    DIJKSTRA: "Accountant • priority queue • lowest cost first • sand costs 6",
    "A*": "Navigator • g + w·h • uses cost so far and goal estimate"
};

connectionStatus.textContent = "CONNECTING • RACE SERVER";

socket.on("connect", () => {
    connectionStatus.textContent = `CONNECTED • ${socket.io.engine.transport.name.toUpperCase()}`;
    console.log("[GP] controller connected", { socketId: socket.id, transport: socket.io.engine.transport.name, url: location.href });
    socket.emit("request_maze");
});

function friendlyConnectionError(error) {
    const code = error?.code;
    if (code === "SHARED_STATE_REQUIRED") return "SERVER NOT READY • CONNECT UPSTASH REDIS IN VERCEL";
    if (code === "REDIS_UNAVAILABLE") return "SERVER STORAGE UNAVAILABLE • CHECK UPSTASH REDIS";
    if (code === "GAME_FULL") return "RACE FULL • 4 PLAYERS ARE ALREADY CONNECTED";
    if (code === "SCREEN_REPLACED") return "MAIN SCREEN WAS REPLACED • SCAN THE NEW QR";
    if (code === "NETWORK_ERROR") return "NETWORK ERROR • CHECK YOUR CONNECTION";
    return `CONNECTION ERROR • ${error?.message || "TRY AGAIN IN A MOMENT"}`;
}

function syncAssignedPlayer(me) {
    if (!me) return;

    if (me.name) {
        applyPlayerName(me.name);
    }

    if (me.algorithm && me.algorithm !== selectedAlgorithm) {
        selectedAlgorithm = me.algorithm;
        selectedAlgorithmText.textContent = me.algorithm;
        selectedSection.classList.remove("hidden");
        astarControl.classList.toggle("hidden", me.algorithm !== "A*");
        algorithmButtons.forEach(button => {
            button.classList.toggle("selected", button.dataset.algorithm === me.algorithm);
        });
    }

    playerWalls = [...(me.walls || [])];
    playerTerrain = [...(me.terrain || [])];
    prediction = me.prediction || prediction;
    if (typeof me.heuristicWeight === "number" && heuristicSlider) {
        heuristicSlider.value = me.heuristicWeight;
        heuristicValue.textContent = Number(me.heuristicWeight).toFixed(1);
    }
    updatePredictionUI();
    updateInteractionMessage();
    drawMaze();
}

socket.on("connect_error", error => {
    connectionStatus.textContent = friendlyConnectionError(error);
    console.error("[GP] controller connect_error", error);
});

socket.io.on("reconnect_attempt", attempt => {
    connectionStatus.textContent = `RECONNECTING • ATTEMPT ${attempt}`;
    console.log("[GP] reconnect attempt", attempt);
});

socket.io.on("reconnect", attempt => {
    connectionStatus.textContent = `RECONNECTED • ${socket.io.engine.transport.name.toUpperCase()}`;
    console.log("[GP] reconnected", attempt);
});

socket.io.on("reconnect_error", error => console.error("[GP] reconnect_error", error));

socket.on("disconnect", reason => {
    connectionStatus.textContent = `DISCONNECTED • ${reason || "NETWORK"}`;
    console.warn("[GP] controller disconnected", reason);
});

socket.on("server_info", info => {
    console.log("[GP] server_info", info);
    if (info?.joinUrl && !socket.connected) {
        connectionStatus.textContent = `SERVER FOUND • CONNECTING`;
    }
});

window.addEventListener("online", () => { connectionStatus.textContent = "NETWORK ONLINE • RECONNECTING..."; });
window.addEventListener("offline", () => {
    connectionStatus.textContent = "PHONE OFFLINE • CHECK WI-FI";
    if (nameSavePending) showNameSaveError("Phone went offline. Reconnect and try again.");
});

socket.on("player_assigned", data => {
    playerNumber = data.number;

    if (data?.player) {
        syncAssignedPlayer(data.player);
    }

    if (data?.nameError) {
        nameSavePending = false;
        playerNameInput?.focus();
        return;
    }

    if (data?.name) {
        reconnectingWithSavedName = false;
        nameSavePending = false;
        applyPlayerName(data.name);
        return;
    }

    subtitle.textContent = playerName
        ? `PLAYER ${playerNumber} • SAVING ${playerName}`
        : `PLAYER ${playerNumber} • ENTER YOUR NAME`;

    if (playerName) {
        reconnectingWithSavedName = true;
        nameSavePending = true;
        if (nameMessage) {
            nameMessage.textContent = "Connecting your saved name...";
            nameMessage.className = "name-message";
        }
        socket.timeout(6000).emit("player_name", { name: playerName }, (error, response) => {
            nameSavePending = false;
            reconnectingWithSavedName = false;
            if (error || !response?.ok) {
                showNameSaveError(response?.message || error?.message || "Could not restore your saved name.");
                return;
            }
            applyPlayerName(response.name);
            if (selectedAlgorithm && !readyButton.disabled) {
                socket.emit("algorithm_selected", { algorithm: selectedAlgorithm });
            }
        });
    } else {
        playerNameInput?.focus();
    }
});

socket.on("players_updated", players => {
    const me = players.find(player => player.number === playerNumber);
    if (!me) return;
    syncAssignedPlayer(me);
});

socket.on("name_saved", data => {
    if (!data?.name) return;
    nameSavePending = false;
    reconnectingWithSavedName = false;
    applyPlayerName(data.name);
});

socket.on("name_invalid", data => {
    nameSavePending = false;
    saveNameButton.disabled = false;
    playerNameInput.disabled = false;
    nameMessage.textContent = data?.message || "Enter a valid name.";
    nameMessage.className = "name-message error";
});

socket.on("name_conflict", () => {
    nameSavePending = false;
    saveNameButton.disabled = false;
    playerNameInput.disabled = false;
    nameMessage.textContent = "That name is already in this round.";
    nameMessage.className = "name-message error";
});

socket.on("game_full", () => {
    document.body.innerHTML = `<main class="game-full"><p>ALGORITHM GRAND PRIX</p><h1>GAME FULL</h1><span>All 4 player slots are occupied.</span></main>`;
});

socket.on("algorithm_conflict", data => {
    alert(`${data.algorithm} is already selected by another player.`);
    clearAlgorithmSelection();
});

socket.on("maze_selected", mazeMap => {
    if (!mazeMap) return;
    currentRound = Number(mazeMap.round) || currentRound;
    resetMobileResults();
    currentMaze = Array.isArray(mazeMap.maze)
        ? mazeMap.maze
        : generateMaze(mazeMap.size || MAZE_SIZE, mazeMap.seed);
    mazeName.textContent = `MAZE ${mazeMap.id} • ${mazeMap.name}`;
    playerWalls = [];
    playerTerrain = [];
    prediction = null;
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    resetSelectionForRound();
    drawMaze();
    updateInteractionMessage();
    mazeMessage.classList.remove("hidden");
    mazeMessage.textContent = "SELECT AN ALGORITHM";
});

socket.on("select_first_maze", () => {
    mazeName.textContent = "WAITING";
    mazeMessage.textContent = "Waiting for the main screen to select a maze.";
    mazeMessage.classList.remove("hidden");
});

socket.on("race_start", data => {
    if (data?.round && Number(data.round) !== currentRound) return;
    readyButton.disabled = true;
    algorithmButtons.forEach(button => button.disabled = true);
    predictionButtons.forEach(button => button.disabled = true);
    mazeMessage.textContent = "RACE IN PROGRESS";
    mazeMessage.classList.remove("hidden");
});

socket.on("placement_rejected", data => {
    if (data?.type === "wall" && playerWalls.length) playerWalls.pop();
    if (data?.type === "terrain" && playerTerrain.length) playerTerrain.pop();
    updateInteractionMessage();
    drawMaze();
    alert(data?.reason || "Placement rejected.");
});

socket.on("race_results", payload => {
    if (!payload || !Array.isArray(payload.results)) return;
    if (payload.round && currentRound && Number(payload.round) !== currentRound) {
        console.warn("[GP] ignored stale race results", payload.round, currentRound);
        return;
    }
    renderMobileResults(payload.results);
});

socket.on("round_reset", payload => {
    currentRound = Number(payload?.round) || currentRound;
    resetMobileResults();
    reconnectingWithSavedName = false;
    console.log("[GP] ROUND RESET", currentRound);
});

socket.on("new_round_rejected", data => {
    alert(data?.message || "New round could not start.");
});

socket.on("race_finished", () => {
    mazeMessage.textContent = "ROUND COMPLETE • WAIT FOR NEXT ROUND";
    mazeMessage.classList.remove("hidden");
});

saveNameButton?.addEventListener("click", () => {
    const name = playerNameInput.value.trim().replace(/\s+/g, " ").slice(0, 20);
    if (name.length < 2) {
        nameMessage.textContent = "Enter at least 2 characters.";
        nameMessage.className = "name-message error";
        return;
    }

    if (!socket.connected) {
        showNameSaveError("Not connected to the race server yet.");
        return;
    }

    if (nameSavePending) return;
    nameSavePending = true;
    saveNameButton.disabled = true;
    playerNameInput.disabled = true;
    nameMessage.textContent = "Saving name...";
    nameMessage.className = "name-message";

    socket.timeout(6000).emit("player_name", { name }, (error, response) => {
        if (!nameSavePending) return;
        if (error) {
            showNameSaveError("Server did not respond. Check the connection and try again.");
            return;
        }
        if (!response?.ok) {
            if (response?.code === "NAME_CONFLICT") {
                nameSavePending = false;
                saveNameButton.disabled = false;
                playerNameInput.disabled = false;
                nameMessage.textContent = response.message || "That name is already in this round.";
                nameMessage.className = "name-message error";
            } else {
                showNameSaveError(response?.message || "Could not save your name.");
            }
            return;
        }
        nameSavePending = false;
        reconnectingWithSavedName = false;
        applyPlayerName(response.name);
    });
});

playerNameInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") saveNameButton.click();
});

algorithmButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (!playerName || !socket.connected || playerNumber === null || readyButton.disabled) return;
        algorithmButtons.forEach(btn => btn.classList.remove("selected"));
        button.classList.add("selected");
        selectedAlgorithm = button.dataset.algorithm;
        selectedAlgorithmText.textContent = selectedAlgorithm;
        selectedSection.classList.remove("hidden");
        astarControl.classList.toggle("hidden", selectedAlgorithm !== "A*");
        algorithmHint.textContent = ALGORITHM_HINTS[selectedAlgorithm];
        playerWalls = [];
        playerTerrain = [];
        prediction = null;
        predictionButtons.forEach(btn => btn.classList.remove("selected"));
        socket.emit("algorithm_selected", { algorithm: selectedAlgorithm });
        updatePredictionUI();
        updateInteractionMessage();
        drawMaze();
    });
});

heuristicSlider.addEventListener("input", () => {
    heuristicValue.textContent = Number(heuristicSlider.value).toFixed(1);
});

predictionButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (!selectedAlgorithm || readyButton.disabled) return;
        prediction = button.dataset.prediction;
        predictionButtons.forEach(btn => btn.classList.toggle("selected", btn === button));
        predictionMessage.textContent = `Prediction: ${prediction}`;
        socket.emit("prediction_selected", prediction);
    });
});

readyButton.addEventListener("click", () => {
    if (!selectedAlgorithm) return alert("Select an algorithm first.");
    if (!playerName) return alert("Enter your name first.");
    if (!socket.connected) return alert("Not connected to the race server yet. Please wait a moment.");

    readyButton.disabled = true;
    readyButton.textContent = "SENDING...";

    socket.timeout(7000).emit("player_ready", {
        name: playerName,
        algorithm: selectedAlgorithm,
        heuristicWeight: Number(heuristicSlider.value),
        walls: playerWalls,
        terrain: playerTerrain,
        prediction
    }, (error, response) => {
        if (error || !response?.ok) {
            readyButton.disabled = false;
            readyButton.textContent = "READY";
            const message = response?.message || error?.message || "Could not ready up.";
            mazeMessage.textContent = message;
            mazeMessage.classList.remove("hidden");
            return;
        }

        readyButton.textContent = "READY ✓";
        algorithmButtons.forEach(button => button.disabled = true);
        predictionButtons.forEach(button => button.disabled = true);
        mazeMessage.textContent = response.raceState === "racing"
            ? "RACE IN PROGRESS"
            : "READY • WAITING FOR OTHER PLAYERS";
    });
});

canvas.addEventListener("pointerdown", event => {
    pointerDown = true;
    pointerMoved = false;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", event => {
    if (!pointerDown) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        pointerMoved = true;
        offsetX += dx;
        offsetY += dy;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        drawMaze();
    }
});

canvas.addEventListener("pointerup", event => {
    if (!pointerDown) return;
    if (!pointerMoved) placeInteraction(event.clientX, event.clientY);
    pointerDown = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
});

canvas.addEventListener("pointercancel", () => { pointerDown = false; });

viewport.addEventListener("wheel", event => {
    event.preventDefault();
    zoom *= event.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoom = Math.max(1, Math.min(5, zoom));
    updateZoomValue();
    drawMaze();
}, { passive: false });

viewport.addEventListener("touchstart", event => {
    if (event.touches.length === 2) pinchDistance = getTouchDistance(event.touches[0], event.touches[1]);
}, { passive: true });

viewport.addEventListener("touchmove", event => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const distance = getTouchDistance(event.touches[0], event.touches[1]);
    if (pinchDistance === null) pinchDistance = distance;
    const difference = distance - pinchDistance;
    if (Math.abs(difference) > 4) {
        zoom *= difference > 0 ? 1.03 : 1 / 1.03;
        zoom = Math.max(1, Math.min(5, zoom));
        pinchDistance = distance;
        updateZoomValue();
        drawMaze();
    }
}, { passive: false });

viewport.addEventListener("touchend", () => { pinchDistance = null; });

resetViewButton.addEventListener("click", () => {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    updateZoomValue();
    drawMaze();
});

function placeInteraction(clientX, clientY) {
    if (!currentMaze || !selectedAlgorithm || readyButton.disabled) return;
    const isDijkstra = selectedAlgorithm === "DIJKSTRA";
    const placements = isDijkstra ? playerTerrain : playerWalls;
    const maximum = isDijkstra ? MAX_TERRAIN : MAX_WALLS;
    if (placements.length >= maximum) return;
    const cell = getMazeCell(clientX, clientY);
    if (!cell) return;
    const { row, col } = cell;
    if (currentMaze[row][col] !== 0) return;
    if ((row === 1 && col === 1) || (row === currentMaze.length - 2 && col === currentMaze[0].length - 2)) return;
    if (placements.some(item => item.row === row && item.col === col)) return;
    const placement = { row, col };
    placements.push(placement);
    socket.emit(isDijkstra ? "terrain_placed" : "wall_placed", placement);
    updateInteractionMessage();
    drawMaze();
}

function getMazeCell(clientX, clientY) {
    if (!currentMaze) return null;
    const rect = viewport.getBoundingClientRect();
    const rows = currentMaze.length;
    const cols = currentMaze[0].length;
    const baseCellSize = Math.min(rect.width / cols, rect.height / rows);
    const cellSize = baseCellSize * zoom;
    const mazeWidth = cellSize * cols;
    const mazeHeight = cellSize * rows;
    const startX = rect.width / 2 - mazeWidth / 2 + offsetX;
    const startY = rect.height / 2 - mazeHeight / 2 + offsetY;
    const col = Math.floor((clientX - rect.left - startX) / cellSize);
    const row = Math.floor((clientY - rect.top - startY) / cellSize);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return { row, col };
}

function drawMaze() {
    if (!currentMaze) return;
    const rows = currentMaze.length;
    const cols = currentMaze[0].length;
    const rect = viewport.getBoundingClientRect();
    const baseCellSize = Math.min(rect.width / cols, rect.height / rows);
    const cellSize = baseCellSize * zoom;
    const mazeWidth = cellSize * cols;
    const mazeHeight = cellSize * rows;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewport.clientWidth * dpr;
    canvas.height = viewport.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, viewport.clientWidth, viewport.clientHeight);
    const startX = viewport.clientWidth / 2 - mazeWidth / 2 + offsetX;
    const startY = viewport.clientHeight / 2 - mazeHeight / 2 + offsetY;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x = startX + col * cellSize;
            const y = startY + row * cellSize;
            if (currentMaze[row][col] === 1) {
                ctx.fillStyle = "#6B4423";
                ctx.fillRect(x, y, cellSize, cellSize);
                ctx.strokeStyle = "#3E2817";
                ctx.lineWidth = Math.max(0.5, cellSize * 0.06);
                ctx.strokeRect(x, y, cellSize, cellSize);
            } else {
                ctx.fillStyle = "#111";
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        }
    }

    playerTerrain.forEach(cell => {
        ctx.fillStyle = "#D8C28A";
        ctx.fillRect(startX + cell.col * cellSize, startY + cell.row * cellSize, cellSize, cellSize);
        ctx.fillStyle = "#B9A36F";
        const dot = Math.max(1, cellSize * 0.08);
        ctx.fillRect(startX + cell.col * cellSize + cellSize * 0.25, startY + cell.row * cellSize + cellSize * 0.3, dot, dot);
        ctx.fillRect(startX + cell.col * cellSize + cellSize * 0.7, startY + cell.row * cellSize + cellSize * 0.65, dot, dot);
    });

    playerWalls.forEach(cell => {
        ctx.fillStyle = PLAYER_COLORS[playerNumber] || "#fff";
        ctx.fillRect(startX + cell.col * cellSize, startY + cell.row * cellSize, cellSize, cellSize);
    });

    drawMarker(1, 1, cellSize, startX, startY, "S");
    drawMarker(rows - 2, cols - 2, cellSize, startX, startY, "G");
}

function drawMarker(row, col, cellSize, startX, startY, text) {
    const centerX = startX + col * cellSize + cellSize / 2;
    const centerY = startY + row * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(3, cellSize * 0.28), 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = `bold ${Math.max(8, cellSize * 0.35)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, centerX, centerY);
}

function updateInteractionMessage() {
    if (!selectedAlgorithm) {
        mazeMessage.textContent = "SELECT AN ALGORITHM";
        return;
    }
    const isDijkstra = selectedAlgorithm === "DIJKSTRA";
    const used = isDijkstra ? playerTerrain.length : playerWalls.length;
    const max = isDijkstra ? MAX_TERRAIN : MAX_WALLS;
    const label = isDijkstra ? "SAND" : "WALLS";
    mazeMessage.textContent = `${label} REMAINING: ${Math.max(0, max - used)}`;
    mazeMessage.classList.remove("hidden");
}

function updateZoomValue() { zoomValue.textContent = `${Math.round(zoom * 100)}%`; }

function updatePredictionUI() {
    predictionButtons.forEach(button => button.classList.toggle("selected", button.dataset.prediction === prediction));
    if (predictionMessage) predictionMessage.textContent = prediction ? `Prediction: ${prediction}` : "Predict the first finisher.";
}

function clearAlgorithmSelection() {
    selectedAlgorithm = null;
    prediction = null;
    selectedSection.classList.add("hidden");
    astarControl.classList.add("hidden");
    algorithmButtons.forEach(button => {
        button.classList.remove("selected");
        button.disabled = !playerName;
    });
    predictionButtons.forEach(button => button.classList.remove("selected"));
    readyButton.disabled = false;
    readyButton.textContent = "READY";
    updateInteractionMessage();
    drawMaze();
}

function resetSelectionForRound() {
    clearAlgorithmSelection();
    heuristicSlider.value = "1";
    heuristicValue.textContent = "1.0";
    algorithmHint.textContent = "Choose an algorithm to see how it thinks.";
    readyButton.disabled = false;
    readyButton.textContent = "READY";
    algorithmButtons.forEach(button => button.disabled = !playerName);
    predictionButtons.forEach(button => button.disabled = false);
    updatePredictionUI();
}

function getTouchDistance(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

window.addEventListener("resize", drawMaze);

function resetMobileResults() {
    mobileResults?.classList.add("hidden");
    mobileCelebration?.classList.add("hidden");
    if (mobileRanking) mobileRanking.innerHTML = "";
    if (mobileOwnReport) mobileOwnReport.innerHTML = "";
}

function renderMobileResults(results) {
    if (!mobileResults || !playerNumber) return;
    const sorted = [...results].sort((a,b) => a.place - b.place);
    mobileRanking.innerHTML = sorted.map(item => {
        const trophy = item.place === 1 ? "🏆" : item.place === 2 ? "🥈" : item.place === 3 ? "🥉" : "4️⃣";
        return `<div class="mobile-rank-row">
            <div class="place">${trophy}</div>
            <div>
                <div class="rank-name">${escapeHtml(item.playerName)}</div>
                <span class="rank-algo">${escapeHtml(item.algorithm)} • PLAYER ${item.playerNumber}</span>
            </div>
            <div class="rank-time">${Number(item.timeSeconds || 0).toFixed(2)}s</div>
        </div>`;
    }).join("");

    const mine = results.find(item => Number(item.playerNumber) === Number(playerNumber));
    if (!mine) return;

    const placeText = mine.place === 1 ? "1ST" : mine.place === 2 ? "2ND" : mine.place === 3 ? "3RD" : "4TH";
    mobileOwnReport.innerHTML = `
        <div class="mobile-report-title">YOUR REPORT • ${placeText} PLACE</div>
        <div class="mobile-report-grid">
            <div class="mobile-report-stat"><span>ALGORITHM</span><strong>${escapeHtml(mine.algorithm)}</strong></div>
            <div class="mobile-report-stat"><span>TIME</span><strong>${Number(mine.timeSeconds || 0).toFixed(2)}s</strong></div>
            <div class="mobile-report-stat"><span>EXPLORED</span><strong>${Number(mine.explored || 0).toLocaleString()}</strong></div>
            <div class="mobile-report-stat"><span>OPEN CELLS</span><strong>${Number(mine.openCells || 0).toLocaleString()}</strong></div>
            <div class="mobile-report-stat"><span>PATH</span><strong>${mine.pathLength || 0}</strong></div>
            <div class="mobile-report-stat"><span>BASELINE</span><strong>${mine.baselinePathLength || "—"}</strong></div>
            <div class="mobile-report-stat"><span>EXTRA STEPS</span><strong>${mine.extraSteps ?? "—"}</strong></div>
            <div class="mobile-report-stat"><span>COST</span><strong>${Number(mine.cost || 0).toFixed(0)}</strong></div>
            <div class="mobile-report-stat"><span>PEAK FRONTIER</span><strong>${mine.peakFrontier ?? "—"}</strong></div>
            <div class="mobile-report-stat"><span>PATH TURNS</span><strong>${mine.pathTurns ?? "—"}</strong></div>
            <div class="mobile-report-stat"><span>WALLS</span><strong>${mine.walls?.length || 0}</strong></div>
            <div class="mobile-report-stat"><span>SAND</span><strong>${mine.terrain?.length || 0}</strong></div>
            <div class="mobile-report-stat"><span>HEURISTIC</span><strong>${mine.algorithm === "A*" ? Number(mine.heuristicWeight || 1).toFixed(1) : "—"}</strong></div>
            <div class="mobile-report-stat"><span>PREDICTION</span><strong>${mine.prediction ? (mine.predictionCorrect ? "CORRECT" : "MISS") : "—"}</strong></div>
        </div>
        <div class="mobile-report-note">${escapeHtml(buildMobileExplanation(mine))}</div>`;

    mobileResults.classList.remove("hidden");
    celebrationPlace.textContent = `${placeText} PLACE`;
    celebrationName.textContent = mine.playerName;
    mobileCelebration.classList.remove("hidden");
    if (mine.place === 1) RaceAudio.victory();
    else RaceAudio.finish(mine.place);
    setTimeout(() => mobileCelebration.classList.add("hidden"), mine.place === 1 ? 3600 : 2600);
}

function buildMobileExplanation(item) {
    const explanations = {
        BFS: "BFS searches layer by layer with a queue. On equal-cost cells, the first route to the goal is a shortest-step route.",
        DFS: "DFS follows a branch deeply with a stack and backtracks when needed. Its first route is not guaranteed to be shortest.",
        DIJKSTRA: "Dijkstra tracks accumulated travel cost, so sand can make a longer-looking route cheaper overall.",
        "A*": `A* combines cost so far and an estimate to the goal. The heuristic weight for this race was ${Number(item.heuristicWeight || 1).toFixed(1)}.`
    };
    return explanations[item.algorithm] || "Race complete.";
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
        "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
    }[ch]));
}

mobileSound?.addEventListener("click", () => {
    const enabled = mobileSound.textContent !== "SOUND OFF";
    RaceAudio.setEnabled(!enabled);
    mobileSound.textContent = enabled ? "SOUND OFF" : "SOUND ON";
});

window.addEventListener("load", () => RaceAudio.unlock());
