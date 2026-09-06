const algorithmButtons = document.querySelectorAll(".algorithm-card");
const selectedSection = document.getElementById("selected-section");
const selectedAlgorithmText = document.getElementById("selected-algorithm");
const astarControl = document.getElementById("astar-control");

const heuristicSlider = document.getElementById("heuristic");
const heuristicValue = document.getElementById("heuristic-value");

const readyButton = document.getElementById("ready-button");

let selectedAlgorithm = null;

algorithmButtons.forEach((button) => {
    button.addEventListener("click", () => {

        algorithmButtons.forEach((btn) => {
            btn.classList.remove("selected");
        });

        button.classList.add("selected");

        selectedAlgorithm = button.dataset.algorithm;

        selectedAlgorithmText.textContent = selectedAlgorithm;

        selectedSection.classList.remove("hidden");

        if (selectedAlgorithm === "A*") {
            astarControl.classList.remove("hidden");
        } else {
            astarControl.classList.add("hidden");
        }
    });
});

heuristicSlider.addEventListener("input", () => {
    heuristicValue.textContent = Number(heuristicSlider.value).toFixed(1);
});

readyButton.addEventListener("click", () => {

    if (!selectedAlgorithm) {
        return;
    }

    readyButton.textContent = "READY ✓";
    readyButton.disabled = true;

    console.log("Selected algorithm:", selectedAlgorithm);

    if (selectedAlgorithm === "A*") {
        console.log("Heuristic weight:", heuristicSlider.value);
    }
});