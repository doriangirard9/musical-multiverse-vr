import path from 'path';
import express from 'express';
import http from 'http';
import fs from 'fs';
import { Server } from "socket.io";
import { WebSocketServer } from 'ws';

// adb reverse tcp:8080 tcp:8080

const app = express();
const server = http.createServer(app);
// const io = new Server(server);
// const wss = new WebSocketServer({ port: 1234 });

const port = 8080;
const pathToPublic = path.resolve(__dirname, '../../client/public');

interface PlayerData {
    id: string;
    position: {
        x: number;
        y: number;
        z: number;
    };
    direction: {
        x: number;
        y: number;
        z: number;
    };
    leftHandPosition: {
        x: number;
        y: number;
        z: number;
    };
    rightHandPosition: {
        x: number;
        y: number;
        z: number;
    };
}
const players: PlayerData[] = [];

// serve static files
app.use(express.static(pathToPublic));

// wss.on('connection', (ws) => {
//     console.log('connected');
// });

// io.on('connection', (socket): void => {
//     console.log(`user ${socket.id} connected`);
//
//     // send the new player to all the other players
//     socket.broadcast.emit('addPlayers', [{
//         id: socket.id,
//         position: {x: 0, y: 1, z: 0},
//         direction: {x: 0, y: 0, z: 0},
//         leftHandPosition: {x: 0, y: 0, z: 0},
//         rightHandPosition: {x: 0, y: 0, z: 0}
//     }]);
//
//     // add player to the list
//     players.push({
//         id: socket.id,
//         position: {x: 0, y: 1, z: 0},
//         direction: {x: 0, y: 0, z: 0},
//         leftHandPosition: {x: 0, y: 0, z: 0},
//         rightHandPosition: {x: 0, y: 0, z: 0}
//     });
//
//     // send the list of players to the new player
//     socket.emit('addPlayers', players);
//
//     socket.on("changePlayerData", (
//         position: {x: number, y: number, z: number},
//         direction: {x: number, y:number, z:number},
//         leftHandPosition: {x: number, y: number, z: number},
//         rightHandPosition: {x: number, y: number, z: number}
//     ): void => {
//         const player = players.find((player) => player.id === socket.id);
//         if (player) {
//             player.position = position;
//             player.direction = direction;
//             player.leftHandPosition = leftHandPosition;
//             player.rightHandPosition = rightHandPosition;
//             socket.broadcast.emit("updatePlayerData", player);
//         }
//     });
//
//     socket.on('disconnect', (): void => {
//         // delete the player from the list
//         delete players[players.findIndex((player): boolean => player.id === socket.id)];
//         console.log('user disconnected');
//     });
// });

server.listen(port, () => {
    console.log(`server listening to http://localhost:${port}`);
});