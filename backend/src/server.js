
const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const ip = "192.168.1.12"


const connections = {};
module.exports = connections;
const http = require('http');

const cors = require('cors');
app.use(cors({ origin: `http://${ip}:3000` }));
app.use(express.json());

const groupChatRouter = require('./routes/groupchats');
const authenticationRouter = require('./routes/authentication');
const invitationsRouter = require('./routes/invitations');
const usersRouter = require('./routes/users');

app.use('/groupchats', groupChatRouter);
app.use('/', authenticationRouter);
app.use('/invitations', invitationsRouter);
app.use('/users', usersRouter);


const server = http.createServer();
const io = require('socket.io')(server, {
    cors: { origin: "*" }
})
const validStrReasons = {
    "groupchats": null
}
io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    const reason = socket.handshake.query.reason;
    const key = userId + "," + reason
    if (isNaN(userId) || reason === undefined || !(reason in validStrReasons) || reason === null || reason == -1) {
        if (isNaN(reason))
            return;
    }
    if (key in connections) {
        console.log(`Updated the socket of user ${userId} for reason ${reason}.`);
    } else {
        console.log(`User ${userId} connected for reason ${reason}.`);
    }
    if (isNaN(reason)) {
        if (reason !== undefined && reason !== null)
            connections[key] = socket;
    }
    else if (reason in connections) {
        connections[reason] = { ...connections[reason], [userId]: socket };
    }
    else {
        connections[reason] = { [userId]: socket };
    }
    socket.on('disconnect', () => {
        const key = userId + "," + reason;
        if (reason === undefined || reason === null || isNaN(reason))
            if (isNaN(reason)) {
                delete connections[key];
            } else {
                delete connections[reason][userId];
                if (Object.keys(connections[reason]).length === 0)
                    delete connections[reason];
            }

    });
});
server.listen(8080, ip, () => {
    console.log(`Listening for sockets on ${ip}:8080.`);
});
app.listen(port, ip, () => {
    console.log(`Server is running on port ${port}`);
});