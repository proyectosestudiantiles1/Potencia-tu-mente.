// server.js - VERSIÓN FINAL DEFINITIVA Y ROBUSTA

const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
require('dotenv').config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

const DATABASE_URL = process.env.DATABASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let model;
if (GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log('✅ Modelo de IA Gemini inicializado.');
} else {
    console.warn('⚠️ ADVERTENCIA: GEMINI_API_KEY no encontrada.');
}

mongoose.connect(DATABASE_URL)
    .then(() => console.log('✅✅✅ CONEXIÓN CON LA BASE DE DATOS EXITOSA! ✅✅✅'))
    .catch(err => console.error('❌❌❌ ERROR AL CONECTAR A LA DB:', err));

// Esquema de usuario simplificado (sin contraseña)
const UserSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, index: true },
});
const User = mongoose.model('User', UserSchema);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- RUTAS DE IA (Optimizadas) ---
app.post('/api/explain-math', async (req, res) => {
    if (!model) return res.status(503).json({ error: "Servicio de IA no disponible." });
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: "El tema es requerido." });
    try {
        const prompt = `Como tutor experto en matemáticas, explica detalladamente el concepto "${topic}" para un estudiante de secundaria. Usa únicamente etiquetas HTML (h3, p, ul, li) para estructurar la respuesta. No incluyas markdown como \`\`\`. La explicación debe cubrir: 1. Definición clara. 2. Fórmula o pasos clave para resolverlo. 3. Un ejemplo práctico y sencillo. 4. Errores comunes que se deben evitar.`;
        const result = await model.generateContent(prompt);
        res.json({ explanation: result.response.text() });
    } catch (error) { console.error("Error en Tutor IA:", error); res.status(500).json({ error: "No se pudo generar la explicación." }); }
});
app.post('/api/generate-problems', async (req, res) => {
    if (!model) return res.status(503).json({ error: "Servicio de IA no disponible." });
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: "El tema es requerido." });
    try {
        const prompt = `Crea 4 problemas matemáticos sobre "${topic}" para secundaria. Mezcla ejercicios y situaciones problemáticas. Devuelve la respuesta en HTML, usando esta estructura exacta para cada problema: <div class="problem-card"><h4>Problema X: [Aquí la pregunta]</h4><p class="solution" style="display:none;">Respuesta: [Aquí la solución concisa]</p><button class="show-solution-btn btn btn-secondary">Ver Respuesta</button></div> No incluyas markdown como \`\`\`.`;
        const result = await model.generateContent(prompt);
        res.json({ problems: result.response.text() });
    } catch (error) { console.error("Error en Práctica IA:", error); res.status(500).json({ error: "No se pudo generar los problemas." }); }
});
app.get('/api/generate-tips', async (req, res) => {
    if (!model) return res.status(503).json({ error: "Servicio de IA no disponible." });
    try {
        const prompt = `Genera 6 consejos creativos y útiles para estudiar matemáticas, dirigidos a estudiantes de secundaria. Formatea la respuesta usando únicamente HTML, donde cada consejo es un <div class="card menu-card">, que contiene un <div class="icon"> con un ícono de font-awesome (ej: <i class="fas fa-lightbulb"></i>), un <h3> para el título del consejo y un <p> para la descripción. No incluyas markdown como \`\`\`.`;
        const result = await model.generateContent(prompt);
        res.json({ tips: result.response.text() });
    } catch (error) { console.error("Error en Consejos IA:", error); res.status(500).json({ error: "No se pudo generar los consejos." }); }
});

// --- LÓGICA DEL CHAT (Simplificada y Robusta) ---
const onlineUsers = {}; const userSockets = {};
io.on('connection', (socket) => {
    
    // El único punto de autenticación: simple y directo.
    socket.on('register user', async (username, callback) => {
        try {
            if (onlineUsers[username]) {
                return callback({ success: false, message: 'Este nombre de usuario ya está en uso. Elige otro.' });
            }

            let user = await User.findOne({ username });

            if (!user) { // Si el usuario es nuevo, lo creamos
                const code = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6)();
                user = await new User({ username, code }).save();
            }

            // Guardamos la información del usuario en el socket actual
            socket.username = user.username;
            socket.userCode = user.code;
            onlineUsers[user.username] = user.code;
            userSockets[user.code] = socket.id;
            
            io.emit('online users update', Object.keys(onlineUsers));
            callback({ success: true, user: { username: user.username, code: user.code } });

        } catch (error) {
            callback({ success: false, message: 'Error en el servidor.' });
        }
    });

    socket.on('add friend', async (friendCode, callback) => {
        const friend = await User.findOne({ code: friendCode }, 'username code').lean();
        callback({ success: !!friend, friend });
    });

    socket.on('private message', ({ toCode, message }) => {
        if (!socket.username) return;
        const recipientSocketId = userSockets[toCode];
        if (recipientSocketId) { io.to(recipientSocketId).emit('private message', { from: socket.username, message }); }
    });
    
    socket.on('disconnect', () => {
        if (socket.username) { delete onlineUsers[socket.username]; delete userSockets[socket.userCode]; io.emit('online users update', Object.keys(onlineUsers)); }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});