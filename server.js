const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const BOXES_FILE = path.join(DATA_DIR, 'boxes.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');
if (!fs.existsSync(BOXES_FILE)) fs.writeFileSync(BOXES_FILE, '[]');

let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
let messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
let boxes = JSON.parse(fs.readFileSync(BOXES_FILE, 'utf8'));

// Eğer kutu yoksa başlangıç kutusu oluştur
if (boxes.length === 0) {
    boxes.push({
        id: 'box1',
        hp: 100,
        maxHp: 100,
        position: { x: 5, y: 0.5, z: 0 },
        energyAvailable: false
    });
    fs.writeFileSync(BOXES_FILE, JSON.stringify(boxes, null, 2));
}

const activeSockets = {};
const players = {}; // username -> { hp, power, position }

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function saveMessages() {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}
function saveBoxes() {
    fs.writeFileSync(BOXES_FILE, JSON.stringify(boxes, null, 2));
}

function getFriends(username) {
    return users[username]?.friends || [];
}

function getFriendRequests(username) {
    return users[username]?.friendRequests || [];
}

// Oyuncu durumunu yayınla
function broadcastPlayers() {
    const playerList = {};
    Object.keys(activeSockets).forEach(socketId => {
        const username = activeSockets[socketId];
        if (players[username]) {
            playerList[username] = players[username];
        }
    });
    io.emit('update_players', playerList);
}

// Kutu durumunu yayınla
function broadcastBoxes() {
    io.emit('update_boxes', boxes);
}

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('login', (username) => {
        username = username.trim();
        if (!username) return;

        if (!users[username]) {
            users[username] = {
                friends: [],
                friendRequests: [],
                lastSeen: Date.now()
            };
            saveUsers();
        }

        activeSockets[socket.id] = username;
        socket.username = username;

        // Oyuncu durumu yoksa oluştur
        if (!players[username]) {
            players[username] = {
                hp: 100,
                power: 0,
                position: { x: 0, y: 0.5, z: 0 }
            };
        }

        socket.emit('login_success', {
            username,
            friends: getFriends(username),
            friendRequests: getFriendRequests(username),
            players: players,
            boxes: boxes
        });

        broadcastPlayers();
        broadcastBoxes();
        io.emit('update_online_users', Object.values(activeSockets));
    });

    // Arkadaşlık isteği gönder
    socket.on('send_friend_request', (targetUsername) => {
        if (!socket.username) return;
        targetUsername = targetUsername.trim();
        if (!targetUsername || targetUsername === socket.username) return;

        if (!users[targetUsername]) {
            socket.emit('friend_request_error', 'Kullanıcı bulunamadı!');
            return;
        }

        const targetRequests = users[targetUsername].friendRequests || [];
        if (targetRequests.includes(socket.username)) {
            socket.emit('friend_request_error', 'Zaten istek gönderdin!');
            return;
        }

        targetRequests.push(socket.username);
        users[targetUsername].friendRequests = targetRequests;
        saveUsers();

        // Hedef kullanıcıya bildir
        const targetSocket = Object.keys(activeSockets).find(id => activeSockets[id] === targetUsername);
        if (targetSocket) {
            io.to(targetSocket).emit('new_friend_request', socket.username);
        }
        socket.emit('friend_request_sent', targetUsername);
    });

    // Gelen istekleri getir
    socket.on('get_friend_requests', () => {
        if (!socket.username) return;
        socket.emit('friend_requests_list', getFriendRequests(socket.username));
    });

    // Arkadaşlık isteğini kabul et
    socket.on('accept_friend_request', (requesterUsername) => {
        if (!socket.username) return;
        requesterUsername = requesterUsername.trim();

        const myRequests = getFriendRequests(socket.username);
        if (!myRequests.includes(requesterUsername)) {
            socket.emit('friend_request_error', 'İstek bulunamadı!');
            return;
        }

        // Benim listemden isteği kaldır
        users[socket.username].friendRequests = myRequests.filter(r => r !== requesterUsername);

        // Arkadaş listelerine ekle
        if (!users[socket.username].friends.includes(requesterUsername)) {
            users[socket.username].friends.push(requesterUsername);
        }
        if (!users[requesterUsername].friends.includes(socket.username)) {
            users[requesterUsername].friends.push(socket.username);
        }

        saveUsers();

        // Her iki tarafa güncel arkadaş listesini gönder
        const requesterSocket = Object.keys(activeSockets).find(id => activeSockets[id] === requesterUsername);
        if (requesterSocket) {
            io.to(requesterSocket).emit('friends_updated', getFriends(requesterUsername));
        }
        socket.emit('friends_updated', getFriends(socket.username));
        socket.emit('friend_requests_list', getFriendRequests(socket.username));
        if (requesterSocket) {
            io.to(requesterSocket).emit('friend_requests_list', getFriendRequests(requesterUsername));
        }
    });

    // Arkadaşlık isteğini reddet
    socket.on('reject_friend_request', (requesterUsername) => {
        if (!socket.username) return;
        requesterUsername = requesterUsername.trim();
        users[socket.username].friendRequests = (users[socket.username].friendRequests || []).filter(r => r !== requesterUsername);
        saveUsers();
        socket.emit('friend_requests_list', getFriendRequests(socket.username));
    });

    // Pozisyon güncelle
    socket.on('update_position', (pos) => {
        if (!socket.username) return;
        if (players[socket.username]) {
            players[socket.username].position = pos;
            // Diğerlerine oyuncu durumunu yayınla
            broadcastPlayers();
        }
    });

    // Kutuya hasar ver
    socket.on('damage_box', (boxId) => {
        if (!socket.username) return;
        const box = boxes.find(b => b.id === boxId);
        if (!box || box.hp <= 0) return;

        // Oyuncu kutuya yakın mı? (basit mesafe kontrolü)
        const playerPos = players[socket.username]?.position;
        if (!playerPos) return;
        const dx = playerPos.x - box.position.x;
        const dz = playerPos.z - box.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 3) return; // 3 birimden uzaksa hasar veremez

        box.hp -= 10; // Her vuruşta 10 hasar
        if (box.hp <= 0) {
            box.hp = 0;
            box.energyAvailable = true;
            // Kutu yeniden doğması için zamanlayıcı
            setTimeout(() => {
                box.hp = box.maxHp;
                box.energyAvailable = false;
                saveBoxes();
                broadcastBoxes();
            }, 10000); // 10 saniye sonra yeniden
        }
        saveBoxes();
        broadcastBoxes();
    });

    // Enerji topla
    socket.on('collect_energy', (boxId) => {
        if (!socket.username) return;
        const box = boxes.find(b => b.id === boxId);
        if (!box || !box.energyAvailable) return;

        const playerPos = players[socket.username]?.position;
        if (!playerPos) return;
        const dx = playerPos.x - box.position.x;
        const dz = playerPos.z - box.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 2) return; // 2 birimden yakınsa

        // Enerjiyi topla
        box.energyAvailable = false;
        if (players[socket.username]) {
            players[socket.username].power += 10; // %10 güç artışı
        }
        saveBoxes();
        broadcastBoxes();
        broadcastPlayers();
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
