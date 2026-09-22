function runDFS(maze, start, goal, walls = []) {
    const stack = [start];
    const visited = new Set([`${start.row},${start.col}`]);
    const parent = new Map();
    const blocked = new Set(walls.map(wall => `${wall.row},${wall.col}`));
    const explored = [];
    const trace = [];
    const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];

    while (stack.length) {
        const current = stack.pop();
        explored.push(current);
        trace.push({
            cell: { ...current },
            reason: "DFS takes the newest cell from the stack and goes deeper.",
            structure: stack.slice(-8).reverse().map(cell => ({ ...cell }))
        });

        if (current.row === goal.row && current.col === goal.col) break;

        for (let i = directions.length - 1; i >= 0; i--) {
            const [dr, dc] = directions[i];
            const row = current.row + dr;
            const col = current.col + dc;
            if (row < 0 || row >= maze.length || col < 0 || col >= maze[0].length) continue;
            if (maze[row][col] === 1) continue;
            if (blocked.has(`${row},${col}`)) continue;
            const key = `${row},${col}`;
            if (visited.has(key)) continue;
            visited.add(key);
            parent.set(key, current);
            stack.push({ row, col });
        }
    }

    return buildPathResult(visited, parent, start, goal, explored, trace);
}
