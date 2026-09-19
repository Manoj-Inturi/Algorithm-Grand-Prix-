const RaceAudio = (() => {
    let audioContext = null;
    let enabled = true;

    function getContext() {
        if (!audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            audioContext = new AudioContext();
        }
        if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
        return audioContext;
    }

    function tone(frequency, duration, type = "sine", volume = 0.035, delay = 0) {
        if (!enabled) return;
        const context = getContext();
        if (!context) return;
        const start = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
    }

    function countdown(number) { tone(number === 1 ? 650 : 480, 0.12, "square"); }
    function go() { tone(740, 0.1, "square"); tone(988, 0.18, "sine", 0.045, 0.1); }
    function explore(algorithm) {
        const frequencies = { BFS: 280, DFS: 330, DIJKSTRA: 390, "A*": 450 };
        tone(frequencies[algorithm] || 320, 0.025, "triangle", 0.009);
    }
    function finish(place) {
        const base = Math.max(420, 900 - place * 90);
        tone(base, 0.09, "sine", 0.045);
        tone(base * 1.25, 0.16, "sine", 0.04, 0.09);
    }
    function victory() {
        tone(523, 0.1); tone(659, 0.1, "sine", 0.045, 0.1); tone(784, 0.22, "sine", 0.05, 0.2);
    }
    function pause() { tone(210, 0.08, "square", 0.025); }
    function step() { tone(560, 0.04, "triangle", 0.02); }
    function click() { tone(390, 0.035, "square", 0.015); }

    return {
        unlock() { const context = getContext(); if (context) context.resume().catch(() => {}); },
        countdown, go, explore, finish, victory, pause, step, click,
        setEnabled(value) { enabled = Boolean(value); }
    };
})();

window.addEventListener("pointerdown", () => RaceAudio.unlock(), { once: true });
