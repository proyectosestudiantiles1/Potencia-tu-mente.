// server.js - CÓDIGO FINAL Y COMPLETO

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { customAlphabet } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// --- ALMACENAMIENTO DE DATOS DEL SERVIDOR ---
const usersByCode = {};    // Almacena: { userCode: { socketId, username } }
const sockets = {};      // Almacena: { socketId: userCode }
const usernames = new Set(); // Para verificar rápidamente si un username ya está en uso

// Generador de códigos de amigo amigables (ej: Abc123)
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 6);

function getOnlineUsernames() {
    return Object.values(usersByCode).map(u => u.username);
}

io.on('connection', (socket) => {
  console.log(`✅ Cliente conectado: ${socket.id}`);
  
  socket.emit('online users update', getOnlineUsernames());

  socket.on('register user', (username, callback) => {
    if (usernames.has(username)) {
      callback({ success: false, message: 'Ese nombre de usuario ya está en uso por otra persona.' });
      return;
    }
    let userCode;
    do { userCode = nanoid(); } while (usersByCode[userCode]);
    
    socket.username = username;
    socket.userCode = userCode;
    usersByCode[userCode] = { socketId: socket.id, username };
    sockets[socket.id] = userCode;
    usernames.add(username);

    console.log(`👤 Usuario registrado: ${username} con código ${userCode}`);
    io.emit('online users update', getOnlineUsernames());
    callback({ success: true, username, userCode });
  });

  socket.on('add friend', (friendCode, callback) => {
    const myCode = sockets[socket.id];
    if (usersByCode[friendCode] && friendCode !== myCode) {
      const friendData = usersByCode[friendCode];
      console.log(`🤝 ${socket.username} agregó a ${friendData.username}`);
      callback({ success: true, code: friendCode, username: friendData.username });
    } else {
      callback({ success: false, message: 'Código de amigo no encontrado o inválido.' });
    }
  });

  socket.on('private message', ({ toCode, message }) => {
    const fromCode = sockets[socket.id];
    const fromUsername = usersByCode[fromCode]?.username;

    if (fromUsername && usersByCode[toCode]) {
      const recipientSocketId = usersByCode[toCode].socketId;
      io.to(recipientSocketId).emit('private message', { from: fromUsername, message });
      socket.emit('private message', { from: fromUsername, message, self: true });
    } else if (fromUsername && !usersByCode[toCode]) {
        socket.emit('system message', { recipient: toCode, text: `Tu amigo no está conectado en este momento.` });
    }
  });
  
  socket.on('disconnect', () => {
    const userCode = sockets[socket.id];
    if (userCode && usersByCode[userCode]) {
      const username = usersByCode[userCode].username;
      console.log(`❌ Usuario desconectado: ${username} (${userCode})`);
      delete usersByCode[userCode];
      delete sockets[socket.id];
      usernames.delete(username);
      io.emit('online users update', getOnlineUsernames());
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});