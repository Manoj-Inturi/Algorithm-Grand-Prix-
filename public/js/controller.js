const socket = io();


// ========================================
// ELEMENTS
// ========================================

const algorithmButtons =
    document.querySelectorAll(
        ".algorithm-card"
    );

const selectedSection =
    document.getElementById(
        "selected-section"
    );

const selectedAlgorithmText =
    document.getElementById(
        "selected-algorithm"
    );

const astarControl =
    document.getElementById(
        "astar-control"
    );

const heuristicSlider =
    document.getElementById(
        "heuristic"
    );

const heuristicValue =
    document.getElementById(
        "heuristic-value"
    );

const readyButton =
    document.getElementById(
        "ready-button"
    );

const mazeCanvas =
    document.getElementById(
        "controller-maze-canvas"
    );

const mazeStatus =
    document.getElementById(
        "maze-status"
    );

const mazeInfo =
    document.getElementById(
        "maze-info"
    );


// ========================================
// CANVAS
// ========================================

const ctx =
    mazeCanvas.getContext("2d");


// ========================================
// STATE
// ========================================

let selectedAlgorithm = null;

let playerNumber = null;

let currentMap = null;

let currentMaze = null;


// ========================================
// SOCKET CONNECTION
// ========================================

socket.on("connect", () => {

    console.log(
        "Connected to server:",
        socket.id
    );

});


// ========================================
// PLAYER ASSIGNED
// ========================================

socket.on(
    "player_assigned",
    (player) => {

        playerNumber =
            player.number;

        console.log(
            `You are Player ${playerNumber}`
        );

        const subtitle =
            document.querySelector(
                ".subtitle"
            );

        if (subtitle) {

            subtitle.textContent =
                `Player ${playerNumber} — Choose your algorithm`;

        }

    }
);


// ========================================
// GAME FULL
// ========================================

socket.on(
    "game_full",
    () => {

        document.body.innerHTML = `

            <main class="controller">

                <header class="header">

                    <p class="eyebrow">
                        ALGORITHM GRAND PRIX
                    </p>

                    <h1>
                        GAME FULL
                    </h1>

                    <p class="subtitle">
                        All 4 player slots are currently occupied.
                    </p>

                </header>

            </main>

        `;

    }
);


// ========================================
// MAZE SELECTED
// ========================================

socket.on(
    "maze_selected",
    (mazeMap) => {

        currentMap =
            mazeMap;

        console.log(
            `Maze received: ${mazeMap.id} - ${mazeMap.name}`
        );

        console.log(
            `Seed: ${mazeMap.seed}`
        );


        // Generate the exact same maze
        // using the same seed as the screen.

        currentMaze =
            generateMaze(
                MAZE_SIZE,
                mazeMap.seed
            );


        mazeStatus.textContent =
            `MAZE ${mazeMap.id}`;


        mazeInfo.textContent =
            `${mazeMap.name} • ${MAZE_SIZE} × ${MAZE_SIZE}`;


        drawControllerMaze(
            currentMaze
        );

    }
);


// ========================================
// DRAW CONTROLLER MAZE
// ========================================

function drawControllerMaze(maze) {

    if (!maze) {
        return;
    }


    const rows =
        maze.length;

    const cols =
        maze[0].length;


    const container =
        mazeCanvas.parentElement;


    const size =
        Math.min(
            container.clientWidth,
            container.clientHeight
        );


    if (size <= 0) {
        return;
    }


    const devicePixelRatio =
        window.devicePixelRatio || 1;


    mazeCanvas.width =
        size * devicePixelRatio;

    mazeCanvas.height =
        size * devicePixelRatio;


    mazeCanvas.style.width =
        `${size}px`;

    mazeCanvas.style.height =
        `${size}px`;


    ctx.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0
    );


    const cellSize =
        size / cols;


    // --------------------------------
    // BACKGROUND
    // --------------------------------

    ctx.fillStyle =
        "#111111";

    ctx.fillRect(
        0,
        0,
        size,
        size
    );


    // --------------------------------
    // DRAW CELLS
    // --------------------------------

    for (
        let row = 0;
        row < rows;
        row++
    ) {

        for (
            let col = 0;
            col < cols;
            col++
        ) {

            const x =
                col * cellSize;

            const y =
                row * cellSize;


            // WALL

            if (
                maze[row][col] === 1
            ) {

                ctx.fillStyle =
                    "#6B4423";

                ctx.fillRect(
                    x,
                    y,
                    cellSize,
                    cellSize
                );


                // Brick border

                ctx.strokeStyle =
                    "#3E2817";

                ctx.lineWidth =
                    Math.max(
                        0.5,
                        cellSize * 0.08
                    );

                ctx.strokeRect(
                    x,
                    y,
                    cellSize,
                    cellSize
                );

            }


            // OPEN PATH

            else {

                ctx.fillStyle =
                    "#111111";

                ctx.fillRect(
                    x,
                    y,
                    cellSize,
                    cellSize
                );

            }

        }

    }


    // --------------------------------
    // START
    // --------------------------------

    drawControllerMarker(
        1,
        1,
        cellSize,
        "#FFFFFF",
        "S"
    );


    // --------------------------------
    // GOAL
    // --------------------------------

    drawControllerMarker(
        rows - 2,
        cols - 2,
        cellSize,
        "#FFFFFF",
        "G"
    );

}


// ========================================
// DRAW MARKER
// ========================================

function drawControllerMarker(
    row,
    col,
    cellSize,
    color,
    text
) {

    const centerX =
        col * cellSize +
        cellSize / 2;

    const centerY =
        row * cellSize +
        cellSize / 2;


    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        cellSize * 0.3,
        0,
        Math.PI * 2
    );


    ctx.fillStyle =
        color;

    ctx.fill();


    ctx.fillStyle =
        "#000000";


    ctx.font =
        `bold ${cellSize * 0.35}px Arial`;


    ctx.textAlign =
        "center";

    ctx.textBaseline =
        "middle";


    ctx.fillText(
        text,
        centerX,
        centerY
    );

}


// ========================================
// ALGORITHM SELECTION
// ========================================

algorithmButtons.forEach(
    (button) => {

        button.addEventListener(
            "click",
            () => {

                // Remove previous selection

                algorithmButtons.forEach(
                    (btn) => {

                        btn.classList.remove(
                            "selected"
                        );

                    }
                );


                // Select current button

                button.classList.add(
                    "selected"
                );


                selectedAlgorithm =
                    button.dataset.algorithm;


                selectedAlgorithmText.textContent =
                    selectedAlgorithm;


                selectedSection.classList.remove(
                    "hidden"
                );


                // Show A* control only
                // when A* is selected

                if (
                    selectedAlgorithm === "A*"
                ) {

                    astarControl.classList.remove(
                        "hidden"
                    );

                } else {

                    astarControl.classList.add(
                        "hidden"
                    );

                }


                // Tell server

                socket.emit(
                    "algorithm_selected",
                    {
                        algorithm:
                            selectedAlgorithm
                    }
                );


                console.log(
                    "Algorithm selected:",
                    selectedAlgorithm
                );

            }
        );

    }
);


// ========================================
// HEURISTIC SLIDER
// ========================================

heuristicSlider.addEventListener(
    "input",
    () => {

        heuristicValue.textContent =
            Number(
                heuristicSlider.value
            ).toFixed(1);

    }
);


// ========================================
// READY
// ========================================

readyButton.addEventListener(
    "click",
    () => {

        if (!selectedAlgorithm) {

            alert(
                "Please select an algorithm first."
            );

            return;
        }


        const heuristicWeight =
            Number(
                heuristicSlider.value
            );


        socket.emit(
            "player_ready",
            {
                algorithm:
                    selectedAlgorithm,

                heuristicWeight:
                    heuristicWeight
            }
        );


        readyButton.textContent =
            "READY ✓";


        readyButton.disabled =
            true;


        console.log(
            "Player ready:",
            {
                playerNumber:
                    playerNumber,

                algorithm:
                    selectedAlgorithm,

                heuristicWeight:
                    heuristicWeight
            }
        );

    }
);


// ========================================
// RESIZE
// ========================================

window.addEventListener(
    "resize",
    () => {

        if (currentMaze) {

            drawControllerMaze(
                currentMaze
            );

        }

    }
);