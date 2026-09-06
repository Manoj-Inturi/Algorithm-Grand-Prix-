const socket = io();

socket.on("connect", () => {
    console.log("Screen connected:", socket.id);
});

socket.on("players_updated", (players) => {

    console.log("Players updated:", players);

    // Reset all player cards
    document.querySelectorAll(".player-card").forEach((card) => {
        const status = card.querySelector("p");

        status.textContent = "WAITING";
    });

    // Update cards for connected players
    players.forEach((player) => {

        const cards = document.querySelectorAll(".player-card");

        if (player.number < 1 || player.number > 4) {
            return;
        }

        const card = cards[player.number - 1];

        if (!card) {
            return;
        }

        const status = card.querySelector("p");

        if (player.algorithm) {

            status.textContent =
                player.ready
                    ? `PLAYER ${player.number} • READY`
                    : `PLAYER ${player.number} • SELECTED ${player.algorithm}`;

        } else {

            status.textContent =
                `PLAYER ${player.number} • CHOOSING`;

        }
    });
});