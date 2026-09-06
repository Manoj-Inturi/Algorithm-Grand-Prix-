function createSeededRandom(seed) {

    let value = seed;

    return function () {

        value =
            (value * 9301 + 49297) % 233280;

        return value / 233280;
    };
}


function generateMaze(size, seed) {

    const random = createSeededRandom(seed);

    // Create completely walled maze
    const maze = Array.from(
        { length: size },
        () => Array(size).fill(1)
    );

    // Start position
    const startRow = 1;
    const startCol = 1;

    maze[startRow][startCol] = 0;

    const stack = [
        [startRow, startCol]
    ];

    const directions = [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2]
    ];

    while (stack.length > 0) {

        const current =
            stack[stack.length - 1];

        const row = current[0];
        const col = current[1];

        const available = [];

        directions.forEach(([dr, dc]) => {

            const newRow = row + dr;
            const newCol = col + dc;

            if (
                newRow > 0 &&
                newRow < size - 1 &&
                newCol > 0 &&
                newCol < size - 1 &&
                maze[newRow][newCol] === 1
            ) {

                available.push([
                    newRow,
                    newCol,
                    dr,
                    dc
                ]);

            }
        });

        if (available.length === 0) {

            stack.pop();

            continue;
        }

        const choice =
            available[
                Math.floor(
                    random() * available.length
                )
            ];

        const newRow = choice[0];
        const newCol = choice[1];
        const dr = choice[2];
        const dc = choice[3];

        // Remove wall between cells
        maze[row + dr / 2][col + dc / 2] = 0;

        // Open new cell
        maze[newRow][newCol] = 0;

        stack.push([
            newRow,
            newCol
        ]);
    }

    return maze;
}