const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

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

// Klasör yoksa oluştur
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');

// Kullanıcıları yükle
let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
let messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));

// Aktif bağlantılar (socket.id -> username)
const activeSockets = {};

// Kullanıcıyı kaydet/güncelle
function saveUser(username, data) {
    users[username] = data;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Mesajları kaydet
function saveMessages() {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

// Kullanıcıya ait arkadaş listesini döndür
function getFriends(username) {
    return users[username]?.friends || [];
}

// Socket bağlantıları
io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    // Kullanıcı girişi
    socket.on('login', (username) => {
        username = username.trim();
        if (!username) return;

        // Kullanıcı yoksa oluştur
        if (!users[username]) {
            users[username] = { friends: [], lastSeen: Date.now() };
            saveUser(username, users[username]);
        }

        // Aktif soket eşle
        activeSockets[socket.id] = username;
        socket.username = username;

        // Kullanıcıya arkadaş listesini gönder
        socket.emit('login_success', {
            username: username,
            friends: getFriends(username),
            onlineUsers: Object.values(activeSockets)
        });

        // Herkese online kullanıcı listesini güncelle
        io.emit('update_online_users', Object.values(activeSockets));
    });

    // Arkadaş ekleme isteği
    socket.on('add_friend', (friendName) => {
        if (!socket.username) return;
        friendName = friendName.trim();
        if (!friendName || friendName === socket.username) return;

        // Kullanıcı var mı?
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
            // Arkadaş eklenen kişiye bildirim
            const friendSocket = Object.keys(activeSockets).find(id => activeSockets[id] === friendName);
            if (friendSocket) {
                io.to(friendSocket).emit('friend_added_you', socket.username);
            }
        } else {
            socket.emit('add_friend_error', 'Zaten arkadaşsınız!');
        }
    });

    // Mesaj gönderme (özel mesaj)
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

        // Alıcıya ilet
        const recipientSocket = Object.keys(activeSockets).find(id => activeSockets[id] === to);
        if (recipientSocket) {
            io.to(recipientSocket).emit('receive_message', msgObj);
        }
        // Gönderene de kopya
        socket.emit('receive_message', msgObj);
    });

    // 3D konum güncelleme
    socket.on('update_position', (pos) => {
        if (!socket.username) return;
        // Diğer oyunculara pozisyonu ilet
        socket.broadcast.emit('player_moved', {
            username: socket.username,
            position: pos
        });
    });

    // Bağlantı kopması
    socket.on('disconnect', () => {
        if (socket.username) {
            delete activeSockets[socket.id];
            io.emit('update_online_users', Object.values(activeSockets));
            console.log('Bağlantı koptu:', socket.username);
        }
    });
});

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`OsFight sunucusu ${PORT} portunda çalışıyor!`);
});
