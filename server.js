// server.js - CÓDIGO FINAL Y COMPLETO (¡MENSAJE DE CONEXIÓN CLARO!)

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
require('dotenv').config({ silent: true }); // No silenciar dotenv para que los logs de Mongoose pasen

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Obtiene la "llave secreta" desde el entorno (Render) o desde el .env (tu PC)
const DATABASE_URL = process.env.DATABASE_URL;

// --- CÓDIGO DE DIAGNÓSTICO DE CONEXIÓN A DB (SIEMPRE VISIBLE) ---
console.log("--- INICIANDO DIAGNÓSTICO DE CONEXIÓN A DB ---");
if (DATABASE_URL) {
    console.log("✅ Variable DATABASE_URL encontrada en el entorno.");
    console.log("   Inicio de la URL:", DATABASE_URL.substring(0, Math.min(DATABASE_URL.length, 30)) + (DATABASE_URL.length > 30 ? '...' : '')); 
    console.log("   Final de la URL:", (DATABASE_URL.length > 15 ? '...' : '') + DATABASE_URL.slice(-15)); 
} else {
    console.error("❌ ERROR CRÍTICO: La variable DATABASE_URL es UNDEFINED. No se encontró en Render o .env.");
    process.exit(1); // Detiene el despliegue si la URL es nula
}
console.log("------------------------------------------");
// --- FIN DEL CÓDIGO DE DIAGNÓSTICO ---

// --- CONEXIÓN A LA BASE DE DATOS ---
mongoose.connect(DATABASE_URL)
  .then(() => console.log('✅✅✅ ¡CONEXIÓN CON LA BASE DE DATOS EXITOSA! ✅✅✅'))
  .catch(err => {
    console.error('❌❌❌ ERROR DEFINITIVO AL CONECTAR A LA DB: ❌❌❌');
    console.error(err);
    process.exit(1);
  });

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
const userSockets = {};

io.on('connection', (socket) => {
  console.log(`✅ Cliente conectado con ID de Socket: ${socket.id}`);
  
  socket.emit('online users update', Object.keys(onlineUsers));

  socket.on('register user', async (username, callback) => {
    if (socket.userCode) { 
        return callback({ success: true, username: socket.username, userCode: socket.userCode });
    }

    let userInDb = await User.findOne({ username });

    if (!userInDb) {
        let userCode;
        do { userCode = nanoid(); } while (await User.findOne({ code: userCode }));
        
        userInDb = new User({ code: userCode, username });
        await userInDb.save();
        console.log(`👤 Nuevo usuario creado y registrado en DB: ${username} (${userInDb.code})`);
    } else {
        if (onlineUsers[username]) {
            callback({ success: false, message: `El usuario '${username}' ya está conectado desde otro dispositivo.` });
            return;
        }
    }
    
    socket.username = userInDb.username;
    socket.userCode = userInDb.code;
    onlineUsers[userInDb.username] = userInDb.code;
    userSockets[userInDb.code] = socket.id;

    console.log(`✅ Usuario '${userInDb.username}' conectado al sistema. Código: ${userInDb.code}`);
    io.emit('online users update', Object.keys(onlineUsers));
    callback({ success: true, username: userInDb.username, userCode: userInDb.code });
  });

  socket.on('add friend', async (friendCode, callback) => {
    if (!socket.userCode) {
        return callback({ success: false, message: 'Necesitas registrar tu perfil para agregar amigos.' });
    }
    if (friendCode === socket.userCode) {
        return callback({ success: false, message: 'No puedes agregarte a ti mismo.' });
    }
    
    const friend = await User.findOne({ code: friendCode });
    if (friend) {
      console.log(`🤝 ${socket.username} (code: ${socket.userCode}) agregó a ${friend.username} (code: ${friend.code})`);
      callback({ success: true, code: friend.code, username: friend.username });
    } else {
      callback({ success: false, message: 'Código de amigo no encontrado o inválido.' });
    }
  });

  socket.on('private message', ({ toCode, message }) => {
    if (!socket.userCode || !socket.username) return; 
    
    const fromUsername = socket.username;
    const recipient = usersByCode[toCode];

    if (recipient && onlineUsers[recipient.username]) {
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
      delete onlineUsers[username]; // Aquí era userCode antes, corregido a username para match onlineUsers
      delete userSockets[userCode];
      io.emit('online users update', Object.keys(onlineUsers));
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});