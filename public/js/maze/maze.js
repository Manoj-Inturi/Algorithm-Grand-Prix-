let currentMaze = null;
let currentMap = null;


function loadRandomMaze() {

    currentMap = getRandomMazeMap();

    currentMaze = generateMaze(
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

    return currentMaze;
}