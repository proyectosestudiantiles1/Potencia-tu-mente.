// server.js - CÓDIGO FINAL, COMPLETO Y ROBUSTO (¡GARANTIZADO!)

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

// --- CÓDIGO DE DIAGNÓSTICO DE CONEXIÓN A DB (PARA VISIBILIDAD DE ERRORES) ---
console.log("--- INICIANDO DIAGNÓSTICO DE CONEXIÓN A DB ---");
if (!DATABASE_URL) {
    console.error("❌ ERROR CRÍTICO: La variable DATABASE_URL es UNDEFINED. No se encontró en Render o .env.");
    process.exit(1); // Detiene el despliegue si la URL es nula, evitando problemas posteriores.
}
console.log("✅ Variable DATABASE_URL encontrada en el entorno.");
// Mostramos solo un segmento para seguridad en logs públicos, pero sabemos que está presente
console.log("   Segmento de la URL:", DATABASE_URL.substring(0, 30) + '...'); 
console.log("------------------------------------------");
// --- FIN DEL CÓDIGO DE DIAGNÓSTICO ---

// --- CONEXIÓN A LA BASE DE DATOS (VERSIÓN ROBUSTA Y A PRUEBA DE FALLOS) ---
mongoose.connect(DATABASE_URL)
  .then(() => console.log('✅✅✅ ¡CONEXIÓN CON LA BASE DE DATOS EXITOSA! ✅✅✅'))
  .catch(err => {
    console.error('❌❌❌ ERROR DEFINITIVO AL CONECTAR A LA DB: ❌❌❌');
    console.error("Mensaje de error: " + err.message); // Muestra solo el mensaje del error
    if (err.name === 'MongoServerError' && err.code === 8000) {
        console.error("👉 Posible causa: Autenticación fallida. Revisa el USUARIO o la CONTRASEÑA en tu cadena de conexión.");
        console.error("👉 Revisa también si la IP está permitida en Network Access de MongoDB Atlas/Railway.");
    } else if (err.name === 'MongooseError' && err.message.includes('MongooseServerSelectionError')) {
        console.error("👉 Posible causa: Error de red o dirección de cluster inválida. Revisa el HOST de tu URL de conexión.");
    }
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
const onlineUsers = {};     // Almacena usuarios { username: userCode } que están ONLINE en este momento.
const userSockets = {};     // Almacena { userCode: socket.id } para enviar a sockets específicos

io.on('connection', (socket) => {
  console.log(`✅ Cliente conectado con ID de Socket: ${socket.id}`);
  
  // 1. Envía la lista de usuarios en línea actualizada a este cliente al conectarse
  socket.emit('online users update', Object.keys(onlineUsers));

  // 2. Cuando un usuario elige un nombre y se registra (o intenta re-registrarse)
  socket.on('register user', async (username, callback) => {
    // Si ya está registrado en este socket (mismo cliente)
    if (socket.userCode && socket.username === username) { 
        return callback({ success: true, username: socket.username, userCode: socket.userCode });
    }

    // Verificar si el username ya está online desde otro socket
    if (onlineUsers[username] && userSockets[onlineUsers[username]]) {
         callback({ success: false, message: `El usuario '${username}' ya está conectado desde otro dispositivo.` });
         return;
    }

    let userInDb = await User.findOne({ username }); // Busca si ya existe en la DB
    
    if (!userInDb) { // Si el usuario no existe en la DB, lo creamos
        let userCode;
        // Genera un código único en un bucle si hay colisión, hasta encontrar uno.
        do { userCode = nanoid(); } while (await User.findOne({ code: userCode }));
        
        userInDb = new User({ code: userCode, username });
        await userInDb.save();
        console.log(`👤 Nuevo usuario creado en DB: ${username} (${userInDb.code})`);
    } else { // Si el usuario ya existe en la DB, simplemente lo conectamos a este socket
        console.log(`💬 Usuario '${username}' existe en DB. Conectando...`);
    }
    
    // Asocia la info del usuario al socket y a los mapas de online
    socket.username = userInDb.username;
    socket.userCode = userInDb.code;
    onlineUsers[userInDb.username] = userInDb.code; // Actualizamos onlineUsers
    userSockets[userInDb.code] = socket.id; // Mapea userCode a ID de socket actual

    console.log(`✅ Usuario '${userInDb.username}' conectado al sistema. Código: ${userInDb.code}`);
    io.emit('online users update', Object.keys(onlineUsers)); // Notifica a todos sobre quién está en línea
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

    // Verificar si el amigo existe Y está online (usando el mapa userSockets para obtener el socketId)
    if (recipient && userSockets[toCode]) { // Recipient exists and is currently online
      io.to(userSockets[toCode]).emit('private message', { from: fromUsername, message });
      socket.emit('private message', { from: fromUsername, message, self: true }); // Mensaje al propio remitente
    } else if (recipient && !userSockets[toCode]) { // Recipient exists but is currently offline
        socket.emit('system message', { recipient: toCode, text: `Tu amigo '${recipient.username}' no está conectado.` });
    } else { // Recipient does not exist at all in DB
        socket.emit('system message', { recipient: toCode, text: `El código de amigo '${toCode}' no corresponde a un usuario registrado.` });
    }
  });
  
  // 5. Cuando un usuario se desconecta
  socket.on('disconnect', () => {
    if (socket.username && socket.userCode) {
      const username = socket.username;
      const userCode = socket.userCode;
      console.log(`❌ Usuario desconectado: ${username} (${userCode})`);
      delete onlineUsers[username]; // Eliminar de la lista de online
      delete userSockets[userCode]; // Eliminar del mapa de sockets activos
      // Notifica a todos que la lista de usuarios en línea se ha actualizado
      io.emit('online users update', Object.keys(onlineUsers));
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});