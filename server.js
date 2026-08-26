const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');   // <-- BU SATIR EKSİK OLABİLİR!

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, 'public')));

// Veri dosyaları
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');

let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
let messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));

const activeSockets = {};

function saveUser(username, data) {
    users[username] = data;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveMessages() {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function getFriends(username) {
    return users[username]?.friends || [];
}

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('login', (username) => {
        username = username.trim();
        if (!username) return;

        if (!users[username]) {
            users[username] = { friends: [], lastSeen: Date.now() };
            saveUser(username, users[username]);
        }

        activeSockets[socket.id] = username;
        socket.username = username;

        socket.emit('login_success', {
            username: username,
            friends: getFriends(username),
            onlineUsers: Object.values(activeSockets)
        });

        io.emit('update_online_users', Object.values(activeSockets));
    });

    socket.on('add_friend', (friendName) => {
        if (!socket.username) return;
        friendName = friendName.trim();
        if (!friendName || friendName === socket.username) return;

        if (!users[friendName]) {
            socket.emit('add_friend_error', 'Kullanıcı bulunamadı!');
            return;
        }

        const userFriends = getFriends(socket.username);
        if (!userFriends.includes(friendName)) {
            userFriends.push(friendName);
            users[socket.username].friends = userFriends;
            saveUser(socket.username, users[socket.username]);
            socket.emit('add_friend_success', friendName);
            const friendSocket = Object.keys(activeSockets).find(id => activeSockets[id] === friendName);
            if (friendSocket) {
                io.to(friendSocket).emit('friend_added_you', socket.username);
            }
        } else {
            socket.emit('add_friend_error', 'Zaten arkadaşsınız!');
        }
    });

    socket.on('send_message', (data) => {
        if (!socket.username) return;
        const { to, message } = data;
        if (!to || !message || message.trim() === '') return;

        const msgObj = {
            from: socket.username,
            to: to,
            message: message.trim(),
            timestamp: Date.now()
        };
        messages.push(msgObj);
        saveMessages();

        const recipientSocket = Object.keys(activeSockets).find(id => activeSockets[id] === to);
        if (recipientSocket) {
            io.to(recipientSocket).emit('receive_message', msgObj);
        }
        socket.emit('receive_message', msgObj);
    });

    socket.on('update_position', (pos) => {
        if (!socket.username) return;
        socket.broadcast.emit('player_moved', {
            username: socket.username,
            position: pos
        });
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            delete activeSockets[socket.id];
            io.emit('update_online_users', Object.values(activeSockets));
            console.log('Bağlantı koptu:', socket.username);
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`OsFight sunucusu ${PORT} portunda çalışıyor!`);
});
