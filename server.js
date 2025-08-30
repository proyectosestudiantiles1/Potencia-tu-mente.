// server.js - VERSIÓN FINAL CON CÓDIGO DE DIAGNÓSTICO

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
require('dotenv').config(); // Carga la variable desde el archivo .env

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Obtiene la "llave secreta" desde el entorno (Render) o desde el .env (tu PC)
const DATABASE_URL = process.env.DATABASE_URL;

// --- CÓDIGO DE DIAGNÓSTICO ---
// Este bloque nos dirá si Render está leyendo la variable correctamente.
console.log("--- INICIANDO PRUEBA DE CONEXIÓN ---");
if (DATABASE_URL) {
    console.log("✅ Variable DATABASE_URL encontrada en el entorno.");
    // Ocultamos la mayor parte de la URL por seguridad, pero mostramos el inicio y el final.
    console.log("   Inicio de la URL:", DATABASE_URL.substring(0, 15)); 
    console.log("   Final de la URL:", DATABASE_URL.slice(-15)); 
} else {
    console.error("❌ ERROR CRÍTICO: La variable DATABASE_URL es UNDEFINED. No se encontró en Render.");
}
console.log("------------------------------------------");
// --- FIN DEL CÓDIGO DE DIAGNÓSTICO ---

// --- CONEXIÓN A LA BASE DE DATOS (VERSIÓN ROBUSTA) ---
mongoose.connect(DATABASE_URL)
  .then(() => console.log('✅✅✅ ¡CONEXIÓN CON MONGODB EXITOSA! ✅✅✅'))
  .catch(err => console.error('❌ Error al conectar a la base de datos:', err));

// --- MODELO DE DATOS DEL USUARIO ---
const UserSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
});
const User = mongoose.model('User', UserSchema);

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 6);
const onlineUsers = {};

io.on('connection', (socket) => {
  socket.on('register user', async (username, callback) => {
    let user = await User.findOne({ username });
    if (!user) {
        let userCode;
        do { userCode = nanoid(); } while (await User.findOne({ code: userCode }));
        user = new User({ code: userCode, username });
        await user.save();
        console.log(`👤 Nuevo usuario creado en DB: ${username} con código ${user.code}`);
    }
    socket.username = user.username;
    socket.userCode = user.code;
    onlineUsers[user.username] = user.code;
    
    console.log(`✅ Usuario conectado: ${user.username}`);
    io.emit('online users update', Object.keys(onlineUsers));
    callback({ success: true, username: user.username, userCode: user.code });
  });

  socket.on('add friend', async (friendCode, callback) => {
    if (!socket.userCode || friendCode === socket.userCode) {
        return callback({ success: false, message: 'Código de amigo inválido.' });
    }
    const friend = await User.findOne({ code: friendCode });
    if (friend) {
        callback({ success: true, code: friend.code, username: friend.username });
    } else {
        callback({ success: false, message: 'Código de amigo no encontrado.' });
    }
  });

  socket.on('private message', ({ toCode, message }) => {
    let recipientSocketId = null;
    for (let sock of io.sockets.sockets.values()) {
        if (sock.userCode === toCode) {
            recipientSocketId = sock.id;
            break;
        }
    }
    if (socket.username && recipientSocketId) {
      io.to(recipientSocketId).emit('private message', { from: socket.username, message });
      socket.emit('private message', { from: socket.username, message, self: true });
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.username) {
      console.log(`❌ Usuario desconectado: ${socket.username}`);
      delete onlineUsers[socket.username];
      io.emit('online users update', Object.keys(onlineUsers));
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});