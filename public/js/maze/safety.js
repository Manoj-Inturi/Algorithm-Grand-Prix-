function cellKey(row, col) {
    return `${row},${col}`;
}

function countShortestPaths(grid, start, goal, extraBlocked = new Set(), limit = 3) {
    const rows = grid.length;
    const cols = grid[0].length;
    const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
    const ways = Array.from({ length: rows }, () => Array(cols).fill(0));
    const queue = [start];

    dist[start.row][start.col] = 0;
    ways[start.row][start.col] = 1;

    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        const nextDistance = dist[current.row][current.col] + 1;

        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const row = current.row + dr;
            const col = current.col + dc;
            if (
                row < 0 || row >= rows ||
                col < 0 || col >= cols ||
                grid[row][col] !== 0 ||
                extraBlocked.has(cellKey(row, col))
            ) continue;

            if (dist[row][col] === -1) {
                dist[row][col] = nextDistance;
                ways[row][col] = ways[current.row][current.col];
                queue.push({ row, col });
            } else if (dist[row][col] === nextDistance) {
                ways[row][col] = Math.min(
                    limit,
                    ways[row][col] + ways[current.row][current.col]
                );
            }
        }
    }

    return ways[goal.row][goal.col] || 0;
}

function findPath(grid, start, goal, blocked = new Set()) {
    const queue = [start];
    const parent = new Map();
    const seen = new Set([cellKey(start.row, start.col)]);

    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];

        if (current.row === goal.row && current.col === goal.col) {
            const path = [];
            let node = current;
            while (node) {
                path.push(node);
                if (node.row === start.row && node.col === start.col) break;
                node = parent.get(cellKey(node.row, node.col));
            }
            return path.reverse();
        }

        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const row = current.row + dr;
            const col = current.col + dc;
            const key = cellKey(row, col);
            if (
                row < 0 || row >= grid.length ||
                col < 0 || col >= grid[0].length ||
                grid[row][col] !== 0 ||
                blocked.has(key) ||
                seen.has(key)
            ) continue;

            seen.add(key);
            parent.set(key, current);
            queue.push({ row, col });
        }
    }

    return null;
}

function buildPlayableMaze(size, seed, start, goal, generateMaze) {
    const maze = generateMaze(size, seed);
    const random = (() => {
        let value = (seed ^ 0x9e3779b9) >>> 0;
        return () => {
            value = (value * 1664525 + 1013904223) >>> 0;
            return value / 4294967296;
        };
    })();

    const candidates = [];
    for (let row = 1; row < size - 1; row++) {
        for (let col = 1; col < size - 1; col++) {
            if (maze[row][col] !== 1) continue;
            const vertical = maze[row - 1][col] === 0 && maze[row + 1][col] === 0;
            const horizontal = maze[row][col - 1] === 0 && maze[row][col + 1] === 0;
            if (vertical || horizontal) candidates.push({ row, col, order: random() });
        }
    }

    candidates.sort((a, b) => a.order - b.order);

    let index = 0;
    while (countShortestPaths(maze, start, goal, new Set(), 3) < 3 && index < candidates.length) {
        maze[candidates[index].row][candidates[index].col] = 0;
        index++;
    }

    maze[start.row][start.col] = 0;
    maze[goal.row][goal.col] = 0;

    return maze;
}

function isWallPlacementSafe(grid, start, goal, walls, candidate, minimumRoutes = 2) {
    const blocked = new Set((walls || []).map(cell => cellKey(cell.row, cell.col)));
    blocked.add(cellKey(candidate.row, candidate.col));
    return countShortestPaths(grid, start, goal, blocked, 3) >= minimumRoutes;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        cellKey,
        countShortestPaths,
        findPath,
        buildPlayableMaze,
        isWallPlacementSafe
    };
}
