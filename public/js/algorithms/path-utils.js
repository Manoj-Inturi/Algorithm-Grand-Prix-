function buildPathResult(foundOrVisited, parent, start, goal, explored, trace = []) {
    const goalKey = `${goal.row},${goal.col}`;
    const found = typeof foundOrVisited === "boolean"
        ? foundOrVisited
        : foundOrVisited.has(goalKey);

    if (!found) {
        return { found: false, explored, path: [], cost: null, trace };
    }

    const path = [];
    let current = goal;

    while (current) {
        path.push(current);
        if (current.row === start.row && current.col === start.col) break;
        current = parent.get(`${current.row},${current.col}`);
    }

    path.reverse();

    return {
        found: path.length > 0 &&
            path[0].row === start.row &&
            path[path.length - 1].row === goal.row &&
            path[path.length - 1].col === goal.col,
        explored,
        path,
        cost: path.length ? path.length - 1 : null,
        trace
    };
}
