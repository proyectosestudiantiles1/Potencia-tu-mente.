// server.js - VERSIÓN FINAL CON BASE DE DATOS

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
require('dotenv').config(); // Para manejar la clave secreta de la DB

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

// --- CONEXIÓN A LA BASE DE DATOS ---
mongoose.connect(DATABASE_URL)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => console.error('❌ Error al conectar a MongoDB:', err));

// --- MODELO DE DATOS DEL USUARIO ---
const UserSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
});
const User = mongoose.model('User', UserSchema);

app.use(express.static('public'));

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890', 6);

io.on('connection', (socket) => {
  // Cuando un usuario se registra
  socket.on('register user', async (username, callback) => {
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            callback({ success: false, message: 'Ese nombre de usuario ya está en uso.' });
            return;
        }
        let userCode;
        do { userCode = nanoid(); } while (await User.findOne({ code: userCode }));
        
        const newUser = new User({ code: userCode, username });
        await newUser.save();

        socket.username = username;
        socket.userCode = userCode;

        console.log(`👤 Usuario registrado en DB: ${username} con código ${userCode}`);
        callback({ success: true, username, userCode });

    } catch (error) {
        console.error("Error en registro:", error);
        callback({ success: false, message: "Error del servidor." });
    }
  });

  // Cuando se busca un amigo por código
  socket.on('add friend', async (friendCode, callback) => {
    try {
        const friend = await User.findOne({ code: friendCode });
        if (friend) {
            callback({ success: true, code: friend.code, username: friend.username });
        } else {
            callback({ success: false, message: 'Código de amigo no encontrado.' });
        }
    } catch (error) {
        callback({ success: false, message: 'Error del servidor.' });
    }
  });

  // ... (el resto del código del chat no necesita cambios importantes)
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});