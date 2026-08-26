const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('✅ Yeni oyuncu:', socket.id);
  socket.on('player-join', (name) => console.log(`${name} katıldı`));
  socket.on('chat-message', (data) => io.emit('chat-message', data));
  socket.on('battle-action', (action) => io.emit('battle-action', action));
  socket.on('disconnect', () => console.log('❌ Ayrıldı:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 OsFight sunucusu ${PORT} portunda çalışıyor.`);
});
