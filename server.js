const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// public klasöründeki dosyaları sun
app.use(express.static('public'));

// Ana sayfa için yönlendirme (opsiyonel)
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Geçici oyuncu listesi
const players = {};

io.on('connection', (socket) => {
  console.log('✅ Yeni bağlantı:', socket.id);

  socket.on('player-join', (playerName) => {
    players[socket.id] = { id: socket.id, name: playerName };
    io.emit('update-players', Object.values(players));
    io.emit('system-message', `⚔️ ${playerName} savaşa katıldı!`);
  });

  socket.on('chat-message', (data) => {
    io.emit('chat-message', data);
  });

  socket.on('battle-action', (action) => {
    io.emit('battle-action', action);
  });

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
  console.log(`🚀 OsFight sunucusu ${PORT} portunda çalışıyor!`);
});
