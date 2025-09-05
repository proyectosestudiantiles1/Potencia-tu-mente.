// server.js - VERSIÓN FINAL CON RUTA CORREGIDA A 'public'

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
    model = genAI.getGenerativeModel({ model: "gemini-pro" });
    console.log('✅ Modelo de IA Gemini inicializado.');
} else {
    console.warn('⚠️ ADVERTENCIA: GEMINI_API_KEY no encontrada. La funcionalidad de IA estará deshabilitada.');
}

mongoose.connect(DATABASE_URL)
    .then(() => console.log('✅✅✅ CONEXIÓN CON LA BASE DE DATOS EXITOSA! ✅✅✅'))
    .catch(err => {
        console.error('❌❌❌ ERROR DEFINITIVO AL CONECTAR A LA DB:', err);
        process.exit(1);
    });

// --- MODELOS DE DATOS ---
const UserSchema = new mongoose.Schema({ code: { type: String, required: true, unique: true }, username: { type: String, required: true, unique: true } });
const User = mongoose.model('User', UserSchema);
const ConceptHistorySchema = new mongoose.Schema({ userCode: { type: String, required: true, index: true }, topic: { type: String, required: true }, date: { type: Date, default: Date.now } });
const ConceptHistory = mongoose.model('ConceptHistory', ConceptHistorySchema);

// --- SERVIDOR WEB EXPRESS ---

// CAMBIO FINAL: Usar el nombre 'public' sin acento
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// CAMBIO FINAL: Servir el index.html desde la carpeta 'public'
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- RUTAS DE LA API (No cambian) ---
app.post('/api/explain-math', async (req, res) => {
    if (!model) return res.status(503).json({ error: "El servicio de IA no está disponible." });
    const { topic, lang, userCode } = req.body;
    if (!topic) return res.status(400).json({ error: "El tema no puede estar vacío." });

    try {
        const prompt = `Actúa como un tutor de matemáticas experto para estudiantes de secundaria. Explica el concepto "${topic}" en idioma "${lang}". Tu explicación debe ser clara, didáctica y usar un lenguaje sencillo. Estructura la respuesta usando etiquetas HTML (h3, p, ul, li) para que sea legible. Cubre: 1. Definición simple. 2. Pasos para resolverlo o fórmula clave. 3. Un ejemplo práctico. 4. Errores comunes a evitar.`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        if (userCode) await new ConceptHistory({ userCode, topic }).save();
        res.json({ explanation: text });
    } catch (error) {
        console.error("Error en la API de Gemini:", error);
        res.status(500).json({ error: "No se pudo generar la explicación. Intenta de nuevo." });
    }
});
app.get('/api/concept-history', async (req, res) => {
    const { userCode } = req.query;
    if (!userCode) return res.status(400).json({ error: "Código de usuario no proporcionado." });
    try {
        const history = await ConceptHistory.find({ userCode }).sort({ date: -1 }).limit(15);
        res.json({ history });
    } catch (error) {
        res.status(500).json({ error: "Error al obtener el historial." });
    }
});
app.delete('/api/concept-history/:id', async (req, res) => {
    try {
        await ConceptHistory.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Entrada del historial eliminada.' });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar del historial." });
    }
});

// --- LÓGICA DEL CHAT (No cambia) ---
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 6);
const onlineUsers = {}; const userSockets = {};
io.on('connection', (socket) => {
    socket.emit('online users update', Object.keys(onlineUsers));
    socket.on('register user', async (username, callback) => {
        try {
            if (onlineUsers[username]) { return callback({ success: false, message: 'Este nombre de usuario ya está en uso.' }); }
            let user = await User.findOne({ username });
            if (!user) { let code; do { code = nanoid(); } while (await User.findOne({ code })); user = await new User({ code, username }).save(); }
            socket.username = user.username; socket.userCode = user.code; onlineUsers[user.username] = user.code; userSockets[user.code] = socket.id;
            io.emit('online users update', Object.keys(onlineUsers)); callback({ success: true, username: user.username, userCode: user.code });
        } catch (error) { console.error("Error al registrar usuario:", error); callback({ success: false, message: 'Error en el servidor.' }); }
    });
    socket.on('add friend', async (friendCode, callback) => {
        const friend = await User.findOne({ code: friendCode });
        callback({ success: !!friend, code: friend?.code, username: friend?.username });
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

// --- INICIAR SERVIDOR ---
server.listen(PORT, () => {
    console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});