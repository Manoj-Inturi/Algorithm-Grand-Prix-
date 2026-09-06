const MAZE_SIZE = 51;

const MAZE_MAPS = [
    {
        id: 1,
        name: "The Grid",
        seed: 1731
    },
    {
        id: 2,
        name: "The Serpent",
        seed: 4827
    },
    {
        id: 3,
        name: "The Fortress",
        seed: 9134
    },
    {
        id: 4,
        name: "The Labyrinth",
        seed: 2765
    },
    {
        id: 5,
        name: "The Switchback",
        seed: 6382
    },
    {
        id: 6,
        name: "The Gauntlet",
        seed: 8246
    }
];

function getRandomMazeMap() {
    const randomIndex = Math.floor(
        Math.random() * MAZE_MAPS.length
    );

    return MAZE_MAPS[randomIndex];
}