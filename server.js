// server.js - CÓDIGO FINAL Y COMPLETO

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
require('dotenv').config({ silent: true }); // No silenciar dotenv para ver logs importantes

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Obtiene la "llave secreta" desde el entorno (Render) o desde el .env (tu PC)
const DATABASE_URL = process.env.DATABASE_URL;

// --- CONEXIÓN A LA BASE DE DATOS (DIAGNÓSTICO Y CONEXIÓN) ---
console.log("--- INICIANDO DIAGNÓSTICO DE CONEXIÓN A DB ---");
if (!DATABASE_URL) {
    console.error("❌ ERROR CRÍTICO: La variable DATABASE_URL es UNDEFINED. No se encontró en Render o .env.");
    process.exit(1);
}
console.log("✅ Variable DATABASE_URL encontrada.");
console.log("   Final de la URL (por seguridad oculta):", (DATABASE_URL.length > 15 ? '...' : '') + DATABASE_URL.slice(-15));
console.log("------------------------------------------");

mongoose.connect(DATABASE_URL)
  .then(() => console.log('✅✅✅ ¡CONEXIÓN CON LA BASE DE DATOS EXITOSA! ✅✅✅'))
  .catch(err => {
    console.error('❌❌❌ ERROR DEFINITIVO AL CONECTAR A LA DB: ❌❌❌');
    console.error(err);
    process.exit(1);
  });

// --- MODELO DE DATOS DEL USUARIO (Mongoose) ---
const UserSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
});
const User = mongoose.model('User', UserSchema);

// --- CONFIGURACIÓN DE EXPRESS Y SERVICIO DE ARCHIVOS ---
app.use(express.static('public')); 
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// --- LÓGICA DEL CHAT EN TIEMPO REAL (SOCKET.IO) ---
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 6);
const onlineUsers = {};     // Almacena: { username: userCode } para el estado en línea
const userSockets = {};     // Almacena: { userCode: socket.id } para enviar a sockets específicos

io.on('connection', (socket) => {
  console.log(`✅ Cliente conectado con ID de Socket: ${socket.id}`);
  
  socket.emit('online users update', Object.keys(onlineUsers)); // Avisa al cliente nuevo quién está online

  // Cuando un usuario elige un nombre y se registra (o intenta re-registrarse)
  socket.on('register user', async (username, callback) => {
    // Si ya está registrado en este socket, ignorar
    if (socket.userCode) {
        return callback({ success: true, username: socket.username, userCode: socket.userCode });
    }

    let userInDb = await User.findOne({ username });

    if (!userInDb) { // Si no existe en la DB, lo creamos
        let userCode;
        do { userCode = nanoid(); } while (await User.findOne({ code: userCode }));
        
        userInDb = new User({ code: userCode, username });
        await userInDb.save();
        console.log(`👤 Nuevo usuario creado en DB: ${username} (${userInDb.code})`);
    } else { // Si existe, verifica si está conectado por otro lado
        if (onlineUsers[username]) { // El usuario ya está conectado en este momento
            callback({ success: false, message: `El usuario '${username}' ya está conectado desde otro dispositivo.` });
            return;
        }
    }
    
    // Asocia la info del usuario al socket y a los mapas de online
    socket.username = userInDb.username;
    socket.userCode = userInDb.code;
    onlineUsers[userInDb.username] = userInDb.code;
    userSockets[userInDb.code] = socket.id; // Map user code to current socket ID

    console.log(`✅ Usuario '${userInDb.username}' conectado al sistema. Código: ${userInDb.code}`);
    io.emit('online users update', Object.keys(onlineUsers)); // Notifica a todos sobre quién está en línea
    callback({ success: true, username: userInDb.username, userCode: userInDb.code });
  });

  // Cuando un usuario intenta agregar un amigo por su CÓDIGO
  socket.on('add friend', async (friendCode, callback) => {
    if (!socket.userCode) {
        return callback({ success: false, message: 'Necesitas registrar tu perfil para agregar amigos.' });
    }
    if (friendCode === socket.userCode) {
        return callback({ success: false, message: 'No puedes agregarte a ti mismo.' });
    }
    
    const friend = await User.findOne({ code: friendCode }); // Busca al amigo en la base de datos
    if (friend) {
      console.log(`🤝 ${socket.username} (code: ${socket.userCode}) agregó a ${friend.username} (code: ${friend.code})`);
      callback({ success: true, code: friend.code, username: friend.username });
    } else {
      callback({ success: false, message: 'Código de amigo no encontrado o inválido.' });
    }
  });

  // Cuando se envía un mensaje privado
  socket.on('private message', ({ toCode, message }) => {
    if (!socket.userCode || !socket.username) return; // Asegurar que el remitente está registrado
    
    const fromUsername = socket.username;
    const recipient = usersByCode[toCode];

    // Verificar si el amigo existe Y está online (usando el mapa userSockets para el socketId)
    if (recipient && userSockets[toCode]) {
      io.to(userSockets[toCode]).emit('private message', { from: fromUsername, message });
      socket.emit('private message', { from: fromUsername, message, self: true }); // Mensaje al propio remitente
    } else {
        // Mensaje de sistema si el amigo no está conectado
        socket.emit('system message', { recipient: toCode, text: `Tu amigo '${recipient?.username || toCode}' no está conectado en este momento.` });
    }
  });
  
  // Cuando un usuario se desconecta
  socket.on('disconnect', () => {
    if (socket.username && socket.userCode) {
      console.log(`❌ Usuario desconectado: ${socket.username} (${socket.userCode})`);
      delete onlineUsers[socket.username];
      delete userSockets[socket.userCode]; // También eliminar del mapa de sockets activos
      io.emit('online users update', Object.keys(onlineUsers)); // Notifica a todos
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});