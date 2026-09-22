function runAStar(maze, start, goal, walls = [], heuristicWeight = 1) {
    const queue = new MinPriorityQueue();
    const gScore = new Map();
    const parent = new Map();
    const visited = new Set();
    const blocked = new Set(walls.map(wall => `${wall.row},${wall.col}`));
    const explored = [];
    const trace = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const startKey = `${start.row},${start.col}`;
    const weight = Math.max(0, Number(heuristicWeight) || 1);

    const heuristic = (row, col) =>
        (Math.abs(goal.row - row) + Math.abs(goal.col - col)) * weight;

    gScore.set(startKey, 0);
    queue.push({ ...start }, heuristic(start.row, start.col));

    while (queue.size) {
        const current = queue.pop();
        const currentKey = `${current.row},${current.col}`;
        if (visited.has(currentKey)) continue;
        visited.add(currentKey);

        const g = gScore.get(currentKey) ?? 0;
        const h = heuristic(current.row, current.col);
        const f = g + h;

        explored.push({ row: current.row, col: current.col });
        trace.push({
            cell: { row: current.row, col: current.col },
            g,
            h,
            f,
            reason: "A* chooses the lowest estimated total cost f(n) = g(n) + w·h(n).",
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
            const nextG = g + 1;
            if (!gScore.has(key) || nextG < gScore.get(key)) {
                gScore.set(key, nextG);
                parent.set(key, { row: current.row, col: current.col });
                queue.push({ row, col }, nextG + heuristic(row, col));
            }
        }
    }

    return buildPathResult(
        visited.has(`${goal.row},${goal.col}`),
        parent,
        start,
        goal,
        explored,
        trace
    );
}
