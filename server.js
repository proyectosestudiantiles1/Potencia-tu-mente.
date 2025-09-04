// server.js - CÓDIGO FINAL Y COMPLETO CON INTEGRACIÓN DE IA

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
require('dotenv').config(); // Carga las variables desde el archivo .env

// Importar el SDK de Gemini
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// --- Configuración de Variables de Entorno ---
const DATABASE_URL = process.env.DATABASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Inicializa el modelo de Gemini (asegúrate de tener una GEMINI_API_KEY válida)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro"}); // O "gemini-1.5-flash" / "gemini-1.5-pro"

// --- CONEXIÓN A LA BASE DE DATOS ---
if (!DATABASE_URL) {
    console.error("❌ ERROR CRÍTICO: DATABASE_URL no está definida.");
    process.exit(1);
}
mongoose.connect(DATABASE_URL)
  .then(() => console.log('✅✅✅ CONEXIÓN CON LA BASE DE DATOS EXITOSA! ✅✅✅'))
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

// --- SERVIDOR WEB EXPRESS ---
app.use(express.static('public')); 
app.use(express.json()); // Habilita el body parser para JSON

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// --- NUEVAS RUTAS PARA LA IA ---

// 1. Ruta para explicar temas matemáticos con IA
app.post('/api/explain-math', async (req, res) => {
    const { topic, lang } = req.body;
    if (!topic) return res.status(400).json({ error: "Tema no proporcionado." });

    try {
        const prompt = `Actúa como un tutor de matemáticas altamente calificado y un programador con una visión didáctica excepcional para una página web educativa para estudiantes de secundaria. Vas a explicar un concepto matemático. Tu explicación debe ser muy clara, concisa, fácil de entender y completa. Considera al usuario una persona ciega, usando un lenguaje inclusivo y estructurando la respuesta en un formato claro para un lector de pantalla.\n\nEl idioma de la respuesta debe ser "${lang}".\n\nEl concepto a explicar es: "${topic}".\n\nTu respuesta debe cubrir:\n1. Qué es (definición)\n2. Cómo se desarrolla/resuelve (pasos/fórmula general)\n3. Errores comunes\n4. Importancia y utilidad (en qué situaciones se aplica)\n5. (Opcional: Si el concepto tiene comparación con otro, o historia, inclúyelo brevemente)\n\nFormato: Utiliza etiquetas HTML básicas (h3, p, ul, li) para estructurar tu respuesta de forma clara y accesible para un lector de pantalla, sin imágenes ni tablas, solo texto puro. Cada punto debe ser un párrafo o una lista.`
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        res.json({ explanation: text });

    } catch (error) {
        console.error("Error al explicar tema con Gemini:", error);
        res.status(500).json({ error: "No se pudo generar la explicación con la IA. Intenta de nuevo más tarde." });
    }
});

// 2. Ruta para generar ejercicios con IA
app.post('/api/generate-exercises', async (req, res) => {
    const { topic, numProblems, lang } = req.body;
    if (!topic || !numProblems) return res.status(400).json({ error: "Tema y número de problemas no proporcionados." });

    try {
        const prompt = `Eres un tutor de matemáticas excepcional. Necesito ${numProblems} ejercicios o problemas, junto con sus soluciones, sobre el tema "${topic}". Los problemas deben ser variados (algunos ejercicios directos, otros como situaciones problemáticas). Están diseñados para estudiantes de secundaria. Asegúrate de que los ejercicios sean nuevos y originales.\n\nEl idioma debe ser "${lang}".\n\nPara las situaciones problemáticas, si es posible, relaciónalas con el medio ambiente (ej. cálculo de reciclaje, consumo de agua, reforestación). Genera la respuesta en un formato JSON específico:\n[\n  {\n    "type": "Ejercicio" o "Situación Problemática",\n    "question": "Texto del problema",\n    "answer": "Solución (solo el número final o la expresión clave, sin pasos intermedios, para validación)",\n    "explanation": "Breve explicación de la solución o pasos clave para la ayuda (opcional)"\n  }\n,...]\n Asegúrate de que las respuestas numéricas estén en formato de cadena y solo incluyan el número.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        
        // A veces Gemini devuelve JSON con markdown. Hay que limpiarlo.
        if (text.startsWith('```json')) {
            text = text.substring(7, text.lastIndexOf('```'));
        }
        
        const exercises = JSON.parse(text); // Intentar parsear el JSON
        res.json({ exercises });

    } catch (error) {
        console.error("Error al generar ejercicios con Gemini:", error);
        res.status(500).json({ error: "No se pudieron generar los ejercicios con la IA. Asegúrate de que la API key es válida e intenta de nuevo más tarde." });
    }
});


// --- LÓGICA DEL CHAT EN TIEMPO REAL (SOCKET.IO) ---
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 6);
const onlineUsers = {};     // Almacena: { username: userCode }
const userSockets = {};     // Almacena: { userCode: socket.id }

io.on('connection', (socket) => {
  // console.log(`✅ Cliente conectado con ID de Socket: ${socket.id}`); // Solo habilitar en depuración
  
  socket.emit('online users update', Object.keys(onlineUsers));

  socket.on('register user', async (username, callback) => {
    if (socket.userCode) { // Si ya está registrado en este socket (mismo cliente), lo re-confirmamos
        if (onlineUsers[username] !== socket.userCode) { // Caso: usuario con mismo nombre pero distinto socket/code
             callback({ success: false, message: `El usuario '${username}' ya está conectado desde otro dispositivo.` });
             return;
        }
        onlineUsers[username] = socket.userCode; // Re-actualizar estado por si el servidor se reinició
        userSockets[socket.userCode] = socket.id;
        io.emit('online users update', Object.keys(onlineUsers));
        return callback({ success: true, username: socket.username, userCode: socket.userCode });
    }

    let userInDb = await User.findOne({ username }); // Busca en la DB

    if (!userInDb) { // Si el usuario no existe en la DB, lo creamos
        let userCode;
        do { userCode = nanoid(); } while (await User.findOne({ code: userCode })); // Genera un código único
        userInDb = new User({ code: userCode, username });
        await userInDb.save();
        // console.log(`👤 Nuevo usuario creado y registrado en DB: ${username} (${userInDb.code})`); // Debug
    } else {
        if (onlineUsers[username]) { // El usuario ya está conectado en este momento
            callback({ success: false, message: `El usuario '${username}' ya está conectado desde otro dispositivo.` });
            return;
        }
    }
    
    // Asocia la info al socket y a los mapas de online
    socket.username = userInDb.username;
    socket.userCode = userInDb.code;
    onlineUsers[userInDb.username] = userInDb.code;
    userSockets[userInDb.code] = socket.id;

    // console.log(`✅ Usuario '${userInDb.username}' conectado al sistema. Código: ${userInDb.code}`); // Debug
    io.emit('online users update', Object.keys(onlineUsers)); // Notifica a todos
    callback({ success: true, username: userInDb.username, userCode: userInDb.code });
  });

  socket.on('add friend', async (friendCode, callback) => {
    if (!socket.userCode) {
        return callback({ success: false, message: 'Necesitas registrar tu perfil para agregar amigos.' });
    }
    if (friendCode === socket.userCode) {
        return callback({ success: false, message: 'No puedes agregarte a ti mismo.' });
    }
    
    const friend = await User.findOne({ code: friendCode }); // Busca al amigo en la base de datos
    if (friend) {
      // console.log(`🤝 ${socket.username} (code: ${socket.userCode}) agregó a ${friend.username} (code: ${friend.code})`); // Debug
      callback({ success: true, code: friend.code, username: friend.username });
    } else {
      callback({ success: false, message: 'Código de amigo no encontrado o inválido.' });
    }
  });

  socket.on('private message', ({ toCode, message }) => {
    if (!socket.userCode || !socket.username) return; 
    
    const fromUsername = socket.username;
    const recipient = usersByCode[toCode];

    if (recipient && userSockets[toCode]) { 
      io.to(userSockets[toCode]).emit('private message', { from: fromUsername, message });
      socket.emit('private message', { from: fromUsername, message, self: true }); 
    } else if (recipient && !userSockets[toCode]) { // Existe pero no online
        socket.emit('system message', { recipient: toCode, text: `Tu amigo '${recipient.username}' no está conectado.` });
    } else { // No existe en DB
        socket.emit('system message', { recipient: toCode, text: `El código de amigo '${toCode}' no corresponde a un usuario registrado.` });
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.username && socket.userCode) {
      // console.log(`❌ Usuario desconectado: ${socket.username} (${socket.userCode})`); // Debug
      delete onlineUsers[socket.username];
      delete userSockets[socket.userCode]; 
      io.emit('online users update', Object.keys(onlineUsers));
    }
  });
});

// --- INICIAR SERVIDOR HTTP ---
server.listen(PORT, () => {
  console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});