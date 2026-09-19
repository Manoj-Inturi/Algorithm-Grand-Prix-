function runDijkstra(maze, start, goal, walls = [], terrain = []) {
    const queue = new MinPriorityQueue();
    const distance = new Map();
    const parent = new Map();
    const blocked = new Set(walls.map(wall => `${wall.row},${wall.col}`));
    const slow = new Set(terrain.map(cell => `${cell.row},${cell.col}`));
    const explored = [];
    const trace = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const startKey = `${start.row},${start.col}`;

    distance.set(startKey, 0);
    queue.push({ ...start, distance: 0 }, 0);

    while (queue.size) {
        const current = queue.pop();
        const currentKey = `${current.row},${current.col}`;
        const currentDistance = distance.get(currentKey);
        if (current.distance !== currentDistance) continue;

        explored.push({ row: current.row, col: current.col });
        trace.push({
            cell: { row: current.row, col: current.col },
            g: currentDistance,
            reason: "Dijkstra chooses the lowest accumulated travel cost.",
            structure: queue.items.slice(0, 8).map(item => ({
                row: item.item.row,
                col: item.item.col,
                priority: item.priority
            }))
        });

        if (current.row === goal.row && current.col === goal.col) break;

        for (const [dr, dc] of directions) {
            const row = current.row + dr;
            const col = current.col + dc;
            if (row < 0 || row >= maze.length || col < 0 || col >= maze[0].length) continue;
            if (maze[row][col] === 1) continue;
            if (blocked.has(`${row},${col}`)) continue;

            const key = `${row},${col}`;
            const cost = slow.has(key) ? 6 : 1;
            const nextDistance = currentDistance + cost;

            if (!distance.has(key) || nextDistance < distance.get(key)) {
                distance.set(key, nextDistance);
                parent.set(key, { row: current.row, col: current.col });
                queue.push({ row, col, distance: nextDistance }, nextDistance);
            }
        }
    }

    const result = buildPathResult(
        distance.has(`${goal.row},${goal.col}`),
        parent,
        start,
        goal,
        explored,
        trace
    );

    if (result.found) result.cost = distance.get(`${goal.row},${goal.col}`);
    return result;
}
