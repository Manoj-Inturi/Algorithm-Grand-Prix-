const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
    console.log("A client connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("A client disconnected:", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Algorithm Grand Prix running at http://localhost:${PORT}`);
});