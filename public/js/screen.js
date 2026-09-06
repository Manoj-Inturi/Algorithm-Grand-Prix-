const socket = io({
    query: {
        role: "screen"
    }
});

// ========================================
// MAZE STATE
// ========================================

let currentMaze = null;
let currentMap = null;


// ========================================
// CANVAS
// ========================================

const canvas =
    document.getElementById("maze-canvas");

const ctx =
    canvas.getContext("2d");


// ========================================
// SOCKET CONNECTION
// ========================================

socket.on("connect", () => {

    console.log(
        "Screen connected:",
        socket.id
    );


    // Ask server for the current maze.

    socket.emit("request_maze");

});


// ========================================
// PLAYER UPDATES
// ========================================

socket.on(
    "players_updated",
    (players) => {

        console.log(
            "Players updated:",
            players
        );


        const cards =
            document.querySelectorAll(
                ".player-card"
            );


        // Reset cards

        cards.forEach(
            (card) => {

                const status =
                    card.querySelector("p");

                if (status) {

                    status.textContent =
                        "WAITING";

                }

            }
        );


        // Update connected players

        players.forEach(
            (player) => {

                if (
                    player.number < 1 ||
                    player.number > 4
                ) {

                    return;

                }


                const card =
                    cards[player.number - 1];


                if (!card) {

                    return;

                }


                const status =
                    card.querySelector("p");


                if (!status) {

                    return;

                }


                if (player.algorithm) {

                    if (player.ready) {

                        status.textContent =
                            `PLAYER ${player.number} • READY`;

                    } else {

                        status.textContent =
                            `PLAYER ${player.number} • SELECTED ${player.algorithm}`;

                    }

                } else {

                    status.textContent =
                        `PLAYER ${player.number} • CHOOSING`;

                }

            }
        );

    }
);


// ========================================
// SERVER SENT CURRENT MAZE
// ========================================

socket.on(
    "maze_selected",
    (mazeMap) => {

        if (!mazeMap) {

            return;

        }


        currentMap =
            mazeMap;


        console.log(
            `Maze received by screen: ${mazeMap.id} - ${mazeMap.name}`
        );


        console.log(
            `Seed: ${mazeMap.seed}`
        );


        currentMaze =
            generateMaze(
                MAZE_SIZE,
                mazeMap.seed
            );


        console.log(
            "Size:",
            `${MAZE_SIZE} × ${MAZE_SIZE}`
        );


        drawMaze(
            currentMaze
        );

    }
);


// ========================================
// SERVER SAYS NO MAZE EXISTS
// ========================================

socket.on(
    "select_first_maze",
    () => {

        console.log(
            "No maze exists. Screen selecting first maze..."
        );


        loadAndDrawRandomMaze();

    }
);


// ========================================
// SELECT FIRST RANDOM MAZE
// ========================================

function loadAndDrawRandomMaze() {

    currentMap =
        getRandomMazeMap();


    currentMaze =
        generateMaze(
            MAZE_SIZE,
            currentMap.seed
        );


    console.log(
        `Selected Maze ${currentMap.id}: ${currentMap.name}`
    );


    console.log(
        `Seed: ${currentMap.seed}`
    );


    console.log(
        "Size:",
        `${MAZE_SIZE} × ${MAZE_SIZE}`
    );


    // Tell server which maze is active.

    socket.emit(
        "maze_selected",
        currentMap
    );


    drawMaze(
        currentMaze
    );

}


// ========================================
// DRAW MAZE
// ========================================

function drawMaze(maze) {

    if (!maze) {

        return;

    }


    const rows =
        maze.length;


    const cols =
        maze[0].length;


    const container =
        document.querySelector(
            ".maze-container"
        );


    if (!container) {

        console.error(
            "Maze container not found."
        );

        return;

    }


    const containerWidth =
        container.clientWidth;


    const containerHeight =
        container.clientHeight;


    const cellSize =
        Math.min(
            containerWidth / cols,
            containerHeight / rows
        );


    const mazeWidth =
        cellSize * cols;


    const mazeHeight =
        cellSize * rows;


    const devicePixelRatio =
        window.devicePixelRatio || 1;


    canvas.width =
        mazeWidth * devicePixelRatio;


    canvas.height =
        mazeHeight * devicePixelRatio;


    canvas.style.width =
        `${mazeWidth}px`;


    canvas.style.height =
        `${mazeHeight}px`;


    ctx.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0
    );


    // ====================================
    // BACKGROUND
    // ====================================

    ctx.fillStyle =
        "#111111";


    ctx.fillRect(
        0,
        0,
        mazeWidth,
        mazeHeight
    );


    // ====================================
    // CELLS
    // ====================================

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


                // Brick lines

                ctx.strokeStyle =
                    "#3E2817";


                ctx.lineWidth =
                    Math.max(
                        1,
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


    // ====================================
    // START
    // ====================================

    drawMarker(
        1,
        1,
        cellSize,
        "#FFFFFF",
        "S"
    );


    // ====================================
    // GOAL
    // ====================================

    drawMarker(
        rows - 2,
        cols - 2,
        cellSize,
        "#FFFFFF",
        "G"
    );

}


// ========================================
// DRAW START / GOAL MARKER
// ========================================

function drawMarker(
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
// RESIZE
// ========================================

window.addEventListener(
    "resize",
    () => {

        if (currentMaze) {

            drawMaze(
                currentMaze
            );

        }

    }
);