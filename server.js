const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// ========================================
// PLAYERS
// ========================================

const players = new Map();


// ========================================
// CURRENT MAZE
// ========================================

let currentMazeMap = null;


// ========================================
// SOCKET CONNECTION
// ========================================

io.on("connection", (socket) => {

    // Check whether this connection is
    // the main screen or a player controller.

    const isScreen =
        socket.handshake.query.role === "screen";


    console.log(
        `${isScreen ? "Screen" : "Controller"} connected:`,
        socket.id
    );


    // ====================================
    // SCREEN CONNECTION
    // ====================================

    if (isScreen) {

        console.log(
            "Main screen connected."
        );


        // Send the current maze to the screen
        // if one already exists.

        if (currentMazeMap) {

            socket.emit(
                "maze_selected",
                currentMazeMap
            );

        }


        // The screen can request the maze.

        socket.on(
            "request_maze",
            () => {

                if (currentMazeMap) {

                    socket.emit(
                        "maze_selected",
                        currentMazeMap
                    );


                    console.log(
                        "Sent current maze to screen."
                    );

                } else {

                    socket.emit(
                        "select_first_maze"
                    );


                    console.log(
                        "No maze exists. Asking screen to select one."
                    );

                }

            }
        );


        // Only the screen is allowed to
        // select the first maze.

        socket.on(
            "maze_selected",
            (mazeMap) => {

                if (
                    !mazeMap ||
                    !mazeMap.id ||
                    mazeMap.seed === undefined
                ) {

                    console.log(
                        "Invalid maze received."
                    );

                    return;

                }


                currentMazeMap = {
                    id: mazeMap.id,
                    name: mazeMap.name,
                    seed: mazeMap.seed
                };


                console.log(
                    `Maze selected: ${currentMazeMap.id} - ${currentMazeMap.name}`
                );


                console.log(
                    `Seed: ${currentMazeMap.seed}`
                );


                // Send the exact same maze
                // to everyone.

                io.emit(
                    "maze_selected",
                    currentMazeMap
                );

            }
        );


        // IMPORTANT:
        // The screen does NOT get added to players.
        // The screen does NOT receive player_assigned.

        return;
    }


    // ====================================
    // PLAYER ASSIGNMENT
    // ====================================

    let playerNumber = null;


    for (
        let i = 1;
        i <= 4;
        i++
    ) {

        const alreadyTaken =
            [...players.values()]
                .some(
                    (player) =>
                        player.number === i
                );


        if (!alreadyTaken) {

            playerNumber = i;

            break;

        }

    }


    // ====================================
    // GAME FULL
    // ====================================

    if (playerNumber === null) {

        socket.emit(
            "game_full"
        );


        console.log(
            "Game full:",
            socket.id
        );


        return;

    }


    // ====================================
    // CREATE PLAYER
    // ====================================

    const player = {

        id: socket.id,

        number: playerNumber,

        algorithm: null,

        ready: false,

        walls: [],

        heuristicWeight: 1.0

    };


    players.set(
        socket.id,
        player
    );


    console.log(
        `Player ${playerNumber} joined`
    );


    // Tell controller which player
    // they are.

    socket.emit(
        "player_assigned",
        {
            number: playerNumber
        }
    );


    // ====================================
    // SEND EXISTING MAZE TO PLAYER
    // ====================================

    if (currentMazeMap) {

        socket.emit(
            "maze_selected",
            currentMazeMap
        );

    }


    // ====================================
    // PLAYER UPDATE
    // ====================================

    io.emit(
        "players_updated",
        [...players.values()]
    );


    // ====================================
    // REQUEST CURRENT MAZE
    // ====================================

    socket.on(
        "request_maze",
        () => {

            if (currentMazeMap) {

                socket.emit(
                    "maze_selected",
                    currentMazeMap
                );


                console.log(
                    `Sent current maze to Player ${playerNumber}`
                );

            } else {

                // Player cannot select the maze.
                // Tell them to wait for the screen.

                console.log(
                    `Player ${playerNumber} requested maze, but screen has not selected one yet.`
                );

            }

        }
    );


    // ====================================
    // ALGORITHM SELECTED
    // ====================================

    socket.on(
        "algorithm_selected",
        (data) => {

            const player =
                players.get(
                    socket.id
                );


            if (!player) {

                return;

            }


            if (
                !data ||
                !data.algorithm
            ) {

                return;

            }


            player.algorithm =
                data.algorithm;


            console.log(
                `Player ${player.number} selected ${data.algorithm}`
            );


            io.emit(
                "players_updated",
                [...players.values()]
            );

        }
    );


    // ====================================
    // PLAYER READY
    // ====================================

    socket.on(
        "player_ready",
        (data) => {

            const player =
                players.get(
                    socket.id
                );


            if (!player) {

                return;

            }


            if (
                !data ||
                !data.algorithm
            ) {

                return;

            }


            player.algorithm =
                data.algorithm;


            player.heuristicWeight =
                Number(
                    data.heuristicWeight ?? 1.0
                );


            player.ready =
                true;


            console.log(
                `Player ${player.number} is ready`
            );


            io.emit(
                "players_updated",
                [...players.values()]
            );

        }
    );


    // ====================================
    // DISCONNECT
    // ====================================

    socket.on(
        "disconnect",
        () => {

            const disconnectedPlayer =
                players.get(
                    socket.id
                );


            // If this wasn't a player,
            // nothing needs to be removed.

            if (!disconnectedPlayer) {

                console.log(
                    "Non-player disconnected:",
                    socket.id
                );

                return;

            }


            console.log(
                `Player ${disconnectedPlayer.number} disconnected`
            );


            players.delete(
                socket.id
            );


            io.emit(
                "players_updated",
                [...players.values()]
            );

        }
    );

});


// ========================================
// START SERVER
// ========================================

server.listen(
    PORT,
    () => {

        console.log(
            `Algorithm Grand Prix running at http://localhost:${PORT}`
        );

    }
);