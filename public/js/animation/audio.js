const RaceAudio = (() => {
    let audioContext = null;
    let enabled = true;
    let masterVolume = 1.8;

    function getContext() {
        if (!audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            audioContext = new AudioContext();
        }
        if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
        return audioContext;
    }

    function tone(frequency, duration, type = "sine", volume = 0.045, delay = 0, endFrequency = null) {
        if (!enabled) return;
        const context = getContext();
        if (!context) return;
        const start = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), start + duration);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.min(0.16, volume * masterVolume), start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
    }

    function chord(notes, duration = 0.1, spacing = 0.06, type = "sine", volume = 0.04) {
        notes.forEach((note, index) => tone(note, duration, type, volume, index * spacing));
    }

    function countdown(number) { tone(number === 1 ? 720 : 520, 0.14, "square", 0.055, 0, number === 1 ? 520 : 390); }
    function go() { chord([740, 988, 1318], 0.14, 0.08, "sine", 0.06); }
    function explore(algorithm) {
        const frequencies = { BFS: 290, DFS: 345, DIJKSTRA: 410, "A*": 475 };
        tone(frequencies[algorithm] || 320, 0.03, "triangle", 0.014);
    }
    function finish(place) {
        const base = Math.max(430, 930 - place * 85);
        chord([base, base * 1.2, base * 1.5], 0.11, 0.07, "sine", 0.058);
    }
    function victory() {
        chord([523, 659, 784, 1047], 0.16, 0.09, "sine", 0.072);
        chord([784, 988, 1175, 1568], 0.18, 0.08, "triangle", 0.05, 0.42);
    }
    function pause() { tone(210, 0.09, "square", 0.04, 0, 170); }
    function step() { tone(560, 0.05, "triangle", 0.03, 0, 720); }
    function click() { tone(390, 0.045, "square", 0.024, 0, 430); }
    function select() { chord([460, 620], 0.065, 0.045, "triangle", 0.028); }
    function join() { chord([540, 760, 960], 0.08, 0.07, "sine", 0.045); }
    function ready() { chord([620, 820, 1040], 0.09, 0.08, "triangle", 0.048); }
    function bot() { chord([330, 250, 440, 590], 0.09, 0.08, "square", 0.04); }
    function warning() { chord([210, 180, 150], 0.08, 0.09, "square", 0.045); }
    function roundReset() { chord([480, 370, 260, 180], 0.09, 0.08, "triangle", 0.042); }
    function wall() { tone(190, 0.09, "square", 0.04, 0, 140); }
    function sand() { tone(310, 0.12, "triangle", 0.042, 0, 220); }
    function prediction() { chord([520, 680], 0.07, 0.05, "sine", 0.032); }
    function raceStart() { chord([392, 523, 659, 784], 0.12, 0.07, "sine", 0.052); }
    function report() { chord([659, 784, 988], 0.12, 0.09, "sine", 0.05); }
    function replay() { chord([440, 554, 659], 0.1, 0.06, "triangle", 0.04); }
    function fullLobby() { chord([260, 330, 420, 520], 0.1, 0.07, "square", 0.046); }
    function milestone() { chord([440, 554, 660], 0.08, 0.05, "triangle", 0.026); }
    function podium(place) {
        const notes = Number(place) === 1 ? [659, 784, 988] : Number(place) === 2 ? [554, 659] : [440, 523];
        chord(notes, 0.1, 0.07, "sine", 0.045);
    }
    function error() { tone(150, 0.18, "sawtooth", 0.045, 0, 90); }

    return {
        unlock() { const context = getContext(); if (context) context.resume().catch(() => {}); },
        countdown, go, explore, finish, victory, pause, step, click, select,
        join, ready, bot, warning, roundReset, wall, sand, prediction, raceStart,
        report, replay, fullLobby, milestone, podium, error,
        setEnabled(value) { enabled = Boolean(value); },
        setVolume(value) { masterVolume = Math.max(0, Math.min(2, Number(value) || 1)); }
    };
})();

window.addEventListener("pointerdown", () => RaceAudio.unlock(), { once: true });
