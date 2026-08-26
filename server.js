const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// public klasöründeki dosyaları yayınla
app.use(express.static('public'));

// Hafızada oyuncuları tut (geçici, sunucu yeniden başlarsa sıfırlanır)
// Ama localStorage'da isim ve arkadaş listesi saklanıyor, o yüzden sorun değil.
const players = {};

io.on('connection', (socket) => {
    console.log('Yeni bir savaşçı bağlandı:', socket.id);

    // Yeni oyuncu katıldığında ismini al ve herkese duyur
    socket.on('player-join', (playerName) => {
        players[socket.id] = { id: socket.id, name: playerName };
        // Tüm bağlı istemcilere güncel oyuncu listesini gönder
        io.emit('update-players', Object.values(players));
        // Sisteme giriş mesajı
        io.emit('system-message', `⚔️ ${playerName} savaşa katıldı!`);
    });

    // Sohbet mesajı geldiğinde herkese yayınla (arkadaş konuşma)
    socket.on('chat-message', (data) => {
        // data: { name, message }
        io.emit('chat-message', data);
    });

    // Savaş hareketi geldiğinde herkese yayınla (saldırı, pozisyon vs.)
    socket.on('battle-action', (action) => {
        // action: { type: 'attack', playerName, ... }
        io.emit('battle-action', action);
    });

    // Oyuncu ayrıldığında
    socket.on('disconnect', () => {
        const player = players[socket.id];
        if (player) {
            delete players[socket.id];
            io.emit('update-players', Object.values(players));
            io.emit('system-message', `💀 ${player.name} savaştan çekildi.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`⚡ OsFight Sunucusu ${PORT} portunda çalışıyor!`);
});
