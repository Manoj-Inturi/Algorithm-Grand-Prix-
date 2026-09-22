const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { MAZE_SIZE } = require("../public/js/maze/maps");

const context = vm.createContext({ console });

for (const file of [
    "public/js/maze/maps.js",
    "public/js/maze/generator.js",
    "public/js/algorithms/path-utils.js",
    "public/js/algorithms/priority-queue.js",
    "public/js/algorithms/bfs.js",
    "public/js/algorithms/dfs.js",
    "public/js/algorithms/dijkstra.js",
    "public/js/algorithms/astar.js"
]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    vm.runInContext(source, context, { filename: file });
}

const results = vm.runInContext(`(() => {
    const start = { row: 1, col: 1 };
    const goal = { row: MAZE_SIZE - 2, col: MAZE_SIZE - 2 };
    const output = [];

    for (const map of MAZE_MAPS) {
        const maze = generateMaze(MAZE_SIZE, map.seed);
        const algos = {
            bfs: runBFS(maze, start, goal, []),
            dfs: runDFS(maze, start, goal, []),
            dijkstra: runDijkstra(maze, start, goal, [], []),
            astar: runAStar(maze, start, goal, [], 1.7)
        };

        for (const [name, result] of Object.entries(algos)) {
            const first = result.path[0];
            const last = result.path[result.path.length - 1];
            if (!result.found) throw new Error(name + " failed on map " + map.id);
            if (!result.path.length) throw new Error(name + " returned an empty path on map " + map.id);
            if (!result.trace.length) throw new Error(name + " returned no decision trace on map " + map.id);
            if (first.row !== start.row || first.col !== start.col) throw new Error(name + " bad start on map " + map.id);
            if (last.row !== goal.row || last.col !== goal.col) throw new Error(name + " bad goal on map " + map.id);
        }

        output.push({
            map: map.id,
            size: MAZE_SIZE,
            bfs: algos.bfs.explored.length,
            dfs: algos.dfs.explored.length,
            dijkstra: algos.dijkstra.explored.length,
            astar: algos.astar.explored.length
        });
    }
    return output;
})()`, context);

if (MAZE_SIZE !== 71) throw new Error(`Expected 71x71 maze, got ${MAZE_SIZE}`);
if (results.length !== 6) throw new Error(`Expected 6 maps, got ${results.length}`);

console.table(results);
console.log("ALL 71x71 ALGORITHM TESTS PASSED");
