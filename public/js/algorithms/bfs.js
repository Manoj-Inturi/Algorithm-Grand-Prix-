function runBFS(maze, start, goal, walls = []) {
    const queue = [start];
    let index = 0;
    const visited = new Set([`${start.row},${start.col}`]);
    const parent = new Map();
    const blocked = new Set(walls.map(wall => `${wall.row},${wall.col}`));
    const explored = [];
    const trace = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    while (index < queue.length) {
        const current = queue[index++];
        explored.push(current);
        trace.push({
            cell: { ...current },
            reason: "BFS takes the oldest cell in the queue.",
            structure: queue.slice(index, index + 8).map(cell => ({ ...cell }))
        });

        if (current.row === goal.row && current.col === goal.col) break;

        for (const [dr, dc] of directions) {
            const row = current.row + dr;
            const col = current.col + dc;
            if (row < 0 || row >= maze.length || col < 0 || col >= maze[0].length) continue;
            if (maze[row][col] === 1) continue;
            if (blocked.has(`${row},${col}`)) continue;
            const key = `${row},${col}`;
            if (visited.has(key)) continue;
            visited.add(key);
            parent.set(key, current);
            queue.push({ row, col });
        }
    }

    return buildPathResult(visited, parent, start, goal, explored, trace);
}
