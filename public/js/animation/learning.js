const AlgorithmLearning = {
    BFS: {
        name: "BFS",
        title: "Breadth-First Search",
        color: "#EF4056",
        live: "I search like a wave. The queue makes me finish one distance layer before going farther.",
        finish: "BFS reached the goal. Because every move costs the same, its first goal path is a shortest-step path.",
        lost: "BFS can lose because it spreads in many directions without using a clue about where the goal is.",
        searches: "QUEUE → first in, first out → layer by layer",
        personality: "THE EXPLORER",
        why: "I do not guess which corridor is best. I systematically expand the nearest layer."
    },
    DFS: {
        name: "DFS",
        title: "Depth-First Search",
        color: "#4B8DB8",
        live: "I commit to a branch and keep going deep. If it fails, I backtrack and try another branch.",
        finish: "DFS reached the goal, but the first route it finds is not guaranteed to be the shortest.",
        lost: "DFS can lose because it may spend many steps deep inside a misleading corridor before backtracking.",
        searches: "STACK → last in, first out → deepest branch first",
        personality: "THE DIVER",
        why: "I prefer depth over breadth, so dead ends can make me backtrack."
    },
    DIJKSTRA: {
        name: "DIJKSTRA",
        title: "Dijkstra's Algorithm",
        color: "#28A69A",
        live: "I choose the cheapest known route. Sand costs more, so I may take a longer-looking route to save cost.",
        finish: "Dijkstra reached the goal by respecting accumulated travel cost. It is designed for weighted terrain.",
        lost: "Dijkstra can explore many cells because it does not use a heuristic to point toward the goal.",
        searches: "PRIORITY QUEUE → lowest cost so far first",
        personality: "THE ACCOUNTANT",
        why: "I care about what the route costs, not just how close the next cell looks."
    },
    "A*": {
        name: "A*",
        title: "A-Star Search",
        color: "#9B5DE5",
        live: "I combine cost already paid with an estimate toward the goal: f(n) = g(n) + w·h(n).",
        finish: "A* reached the goal by balancing cost so far and estimated remaining distance.",
        lost: "A* can behave differently when the heuristic weight changes. Aggressive weighting can reduce exploration but can trade optimality.",
        searches: "PRIORITY QUEUE → lowest f(n) = g(n) + w·h(n)",
        personality: "THE NAVIGATOR",
        why: "I use both my history and a prediction of how far the goal is."
    }
};

function getAlgorithmLearning(algorithm) {
    return AlgorithmLearning[algorithm] || {
        name: algorithm,
        title: algorithm,
        color: "#FFFFFF",
        live: "Searching...",
        finish: "Reached the goal.",
        lost: "Did not finish first.",
        searches: "",
        personality: "ALGORITHM",
        why: ""
    };
}
