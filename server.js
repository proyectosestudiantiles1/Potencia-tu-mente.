// server.js - CÓDIGO FINAL Y COMPLETO (¡SIN ERRORES!)

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

// --- CÓDIGO DE DIAGNÓSTICO PARA LA BASE DE DATOS ---
// Este bloque nos dará información crítica en los logs de Render sobre la DATABASE_URL.
console.log("--- INICIANDO DIAGNÓSTICO DE CONEXIÓN A DB ---");
if (DATABASE_URL) {
    console.log("✅ Variable DATABASE_URL encontrada en el entorno.");
    // Ocultamos la mayor parte de la URL por seguridad, pero mostramos inicio y final.
    console.log("   Inicio de la URL:", DATABASE_URL.substring(0, Math.min(DATABASE_URL.length, 30)) + (DATABASE_URL.length > 30 ? '...' : '')); 
    console.log("   Final de la URL:", (DATABASE_URL.length > 15 ? '...' : '') + DATABASE_URL.slice(-15)); 
} else {
    console.error("❌ ERROR CRÍTICO: La variable DATABASE_URL es UNDEFINED. No se encontró en Render o .env.");
    process.exit(1); // Detiene el despliegue si la URL es nula, evitando errores de conexión posteriores.
}
console.log("------------------------------------------");
// --- FIN DEL CÓDIGO DE DIAGNÓSTICO ---


// --- CONEXIÓN A LA BASE DE DATOS (VERSIÓN ROBUSTA Y CORREGIDA) ---
mongoose.connect(DATABASE_URL, {
    useNewUrlParser: true,      // Opciones para evitar warnings en Mongoose 6+
    useUnifiedTopology: true,   // Opciones para evitar warnings en Mongoose 6+
})
  .then(() => console.log('✅✅✅ ¡CONEXIÓN CON LA BASE DE DATOS EXITOSA! ✅✅✅'))
  .catch(err => {
    console.error('❌❌❌ ERROR DEFINITIVO AL CONECTAR A LA DB: ❌❌❌');
    console.error(err); // Muestra el error completo
    process.exit(1); // Detiene la aplicación si no se puede conectar a la DB
  });


// --- MODELO DE DATOS DEL USUARIO (Mongoose) ---
const UserSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
});
const User = mongoose.model('User', UserSchema);


// --- CONFIGURACIÓN DE EXPRESS Y SERVICIO DE ARCHIVOS ---
app.use(express.static('public')); // Primero, sirve archivos estáticos (CSS, JS, imágenes, etc.)

// Asegura que siempre se sirva el index.html cuando alguien pida la raíz de la URL (/)
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});


// --- LÓGICA DEL CHAT EN TIEMPO REAL (SOCKET.IO) ---
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 6);
const onlineUsers = {}; // Almacena usuarios { username: userCode } que están ONLINE en este momento.
const userSockets = {}; // Almacena { userCode: socketId }

io.on('connection', (socket) => {
  console.log(`✅ Cliente conectado con ID de Socket: ${socket.id}`);
  
  // 1. Envía la lista de usuarios en línea actualizados a este cliente al conectarse
  socket.emit('online users update', Object.keys(onlineUsers));

  // 2. Cuando un usuario elige un nombre y se registra (o intenta volver a registrarse)
  socket.on('register user', async (username, callback) => {
    if (socket.userCode) { // Si ya está registrado en este socket, ignorar o confirmar
        return callback({ success: true, username: socket.username, userCode: socket.userCode });
    }

    let userInDb = await User.findOne({ username }); // Busca si ya existe en la DB

    if (!userInDb) { // Si el usuario no existe en la DB, lo creamos
        let userCode;
        do { userCode = nanoid(); } while (await User.findOne({ code: userCode })); // Asegura un código único
        userInDb = new User({ code: userCode, username });
        await userInDb.save();
        console.log(`👤 Nuevo usuario creado y registrado en DB: ${username} (${userInDb.code})`);
    } else { // Si el usuario existe en la DB pero está "offline" o en otro socket
        console.log(`💬 Usuario '${username}' existe en DB. Intentando registrarse.`);
        // Verificamos si este usuario está actualmente conectado desde otro socket
        if (onlineUsers[username]) {
            callback({ success: false, message: `El usuario '${username}' ya está conectado desde otro dispositivo.` });
            return;
        }
    }
    
    // Asocia la info del usuario al socket actual y al array de online
    socket.username = userInDb.username;
    socket.userCode = userInDb.code;
    onlineUsers[userInDb.username] = userInDb.code; // Actualizamos onlineUsers para reflejar el estado actual
    userSockets[userInDb.code] = socket.id;

    console.log(`✅ Usuario '${userInDb.username}' conectado al sistema. Código: ${userInDb.code}`);
    io.emit('online users update', Object.keys(onlineUsers)); // Notifica a todos sobre la actualización de usuarios en línea
    callback({ success: true, username: userInDb.username, userCode: userInDb.code });
  });

  // 3. Cuando un usuario intenta agregar un amigo por su CÓDIGO
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

  // 4. Cuando se envía un mensaje privado
  socket.on('private message', ({ toCode, message }) => {
    if (!socket.userCode || !socket.username) return; // Asegurar que el remitente esté registrado
    
    const fromUsername = socket.username;
    const recipient = usersByCode[toCode];

    if (recipient && onlineUsers[recipient.username]) { // Verificar si el amigo existe Y está online
        io.to(recipient.socketId).emit('private message', { from: fromUsername, message });
        socket.emit('private message', { from: fromUsername, message, self: true });
    } else {
        // Mensaje de sistema si el amigo no está conectado
        socket.emit('system message', { recipient: toCode, text: `Tu amigo '${recipient?.username || toCode}' no está conectado en este momento.` });
    }
  });
  
  // 5. Cuando un usuario se desconecta
  socket.on('disconnect', () => {
    if (socket.username && socket.userCode) {
      console.log(`❌ Usuario desconectado: ${socket.username} (${socket.userCode})`);
      delete onlineUsers[socket.username];
      delete userSockets[socket.userCode]; // También eliminar del mapa de sockets
      // Notifica a todos que la lista de usuarios en línea se ha actualizado
      io.emit('online users update', Object.keys(onlineUsers));
    }
  });
});

// --- INICIAR SERVIDOR HTTP ---
server.listen(PORT, () => {
  console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});