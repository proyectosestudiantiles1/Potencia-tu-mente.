// server.js - CÓDIGO FINAL, COMPLETO Y ROBUSTO
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const usersByCode = {};    // Almacena: { userCode: { socketId, username } }
const sockets = {};      // Almacena: { socketId: userCode }
const usernames = new Set(); 

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 6);

function getOnlineUsernames() {
    return Object.values(usersByCode).map(u => u.username);
}

io.on('connection', (socket) => {
  console.log(`✅ Cliente conectado: ${socket.id}`);
  
  socket.emit('online users update', getOnlineUsernames());

  socket.on('register user', async (username, callback) => {
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
    if (!socket.userCode) {
        return callback({ success: false, message: 'Necesitas registrar tu perfil para agregar amigos.' });
    }
    if (friendCode === myCode) {
        return callback({ success: false, message: 'No puedes agregarte a ti mismo.' });
    }
    
    const friend = usersByCode[friendCode];
    if (friend) {
      console.log(`🤝 ${socket.username} agregó a ${friend.username}`);
      callback({ success: true, code: friend.code, username: friend.username });
    } else {
      callback({ success: false, message: 'Código de amigo no encontrado o inválido.' });
    }
  });

  socket.on('private message', ({ toCode, message }) => {
    const fromCode = socket.userCode;
    const fromUsername = socket.username;

    if (!fromCode || !fromUsername) return; 

    const recipient = usersByCode[toCode];
    if (recipient) {
      io.to(recipient.socketId).emit('private message', { from: fromUsername, message });
      socket.emit('private message', { from: fromUsername, message, self: true });
    } else {
        socket.emit('system message', { recipient: toCode, text: `Tu amigo '${recipient?.username || toCode}' no está conectado.` });
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.username && socket.userCode) {
      const username = socket.username;
      const userCode = socket.userCode;
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