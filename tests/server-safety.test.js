const assert = require("assert");
const { MAZE_SIZE, MAZE_MAPS } = require("../public/js/maze/maps");
const { generateMaze } = require("../public/js/maze/generator");
const { buildPlayableMaze, countShortestPaths, isWallPlacementSafe } = require("../public/js/maze/safety");

const start = { row: 1, col: 1 };
const goal = { row: MAZE_SIZE - 2, col: MAZE_SIZE - 2 };

for (const map of MAZE_MAPS) {
    const maze = buildPlayableMaze(MAZE_SIZE, map.seed, start, goal, generateMaze);
    assert.strictEqual(maze.length, 71);
    assert.strictEqual(maze[0].length, 71);
    assert.ok(countShortestPaths(maze, start, goal, new Set(), 3) >= 3, `map ${map.id} has fewer than 3 shortest routes`);

    let first = null;
    let second = null;

    outer:
    for (let row = 1; row < MAZE_SIZE - 1; row++) {
        for (let col = 1; col < MAZE_SIZE - 1; col++) {
            if (maze[row][col] !== 0) continue;
            const cell = { row, col };
            if (!(cell.row === start.row && cell.col === start.col) &&
                !(cell.row === goal.row && cell.col === goal.col) &&
                isWallPlacementSafe(maze, start, goal, [], cell)) {
                first = cell;
                break outer;
            }
        }
    }

    assert.ok(first, `map ${map.id} has no safe first wall`);

    outer2:
    for (let row = 1; row < MAZE_SIZE - 1; row++) {
        for (let col = 1; col < MAZE_SIZE - 1; col++) {
            if (maze[row][col] !== 0) continue;
            const cell = { row, col };
            if (cell.row === first.row && cell.col === first.col) continue;
            if (cell.row === start.row && cell.col === start.col) continue;
            if (cell.row === goal.row && cell.col === goal.col) continue;
            if (isWallPlacementSafe(maze, start, goal, [first], cell)) {
                second = cell;
                break outer2;
            }
        }
    }

    assert.ok(second, `map ${map.id} has no safe second wall`);
    assert.ok(countShortestPaths(maze, start, goal, new Set([`${first.row},${first.col}`,`${second.row},${second.col}`]), 3) >= 2,
        `map ${map.id} did not keep two escape routes after two safe walls`);
}

console.log("ALL PLAYABLE-MAZE SAFETY TESTS PASSED");
