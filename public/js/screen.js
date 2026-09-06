const socket = io();

socket.on("connect", () => {
    console.log("Screen connected to server:", socket.id);
});