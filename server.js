// server.js - VERSIÓN FINAL CON TODAS LAS NUEVAS FUNCIONALIDADES

const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
const bcrypt = require('bcrypt'); // Librería para encriptar contraseñas
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

// --- MODELO DE DATOS (ACTUALIZADO) ---
const UserSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true } // Campo para la contraseña encriptada
});
const User = mongoose.model('User', UserSchema);

const ConceptHistorySchema = new mongoose.Schema({ userCode: { type: String, required: true, index: true }, topic: { type: String, required: true }, date: { type: Date, default: Date.now } });
const ConceptHistory = mongoose.model('ConceptHistory', ConceptHistorySchema);

// --- SERVIDOR WEB EXPRESS ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- NUEVAS RUTAS DE AUTENTICACIÓN ---

// REGISTRO
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || password.length < 4) {
        return res.status(400).json({ success: false, message: 'Usuario y contraseña (mín. 4 caracteres) son requeridos.' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return res.status(409).json({ success: false, message: 'El nombre de usuario ya existe.' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 6)();
    const newUser = new User({ username, password: hashedPassword, code: userCode });
    await newUser.save();
    res.status(201).json({ success: true, message: 'Usuario creado exitosamente.' });
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
        return res.status(404).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
    }
    res.json({ success: true, message: 'Inicio de sesión exitoso.', user: { username: user.username, code: user.code } });
});

// BORRAR CUENTA ("Restaurar Contraseña")
app.post('/api/delete-account', async (req, res) => {
    const { username } = req.body;
    const result = await User.deleteOne({ username });
    if (result.deletedCount > 0) {
        res.json({ success: true, message: 'Cuenta eliminada. Ahora puedes registrarte de nuevo.' });
    } else {
        res.status(404).json({ success: false, message: 'No se encontró un usuario con ese nombre.' });
    }
});


// --- RUTAS DE IA (ACTUALIZADAS Y NUEVAS) ---

// Tutor IA (sin cambios)
app.post('/api/explain-math', async (req, res) => { /* ...código sin cambios... */ });

// NUEVA RUTA: Práctica con IA
app.post('/api/generate-problems', async (req, res) => {
    if (!model) return res.status(503).json({ error: "El servicio de IA no está disponible." });
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: "El tema es requerido." });

    try {
        const prompt = `Genera 4 problemas matemáticos para un estudiante de secundaria sobre el tema: "${topic}". Varía la dificultad. Incluye una mezcla de ejercicios directos y situaciones problemáticas. Devuelve la respuesta como HTML, usando una estructura de <h4> para la pregunta y <p> para la respuesta, que inicialmente estará oculta. Ejemplo de un problema: <div class="problem-card"><h4>Problema 1: ...</h4><p class="solution" style="display:none;">Respuesta: ...</p><button class="show-solution-btn">Ver Respuesta</button></div>`;
        const result = await model.generateContent(prompt);
        res.json({ problems: result.response.text() });
    } catch (error) {
        res.status(500).json({ error: "No se pudo generar los problemas." });
    }
});

// NUEVA RUTA: Consejos con IA
app.get('/api/generate-tips', async (req, res) => {
    if (!model) return res.status(503).json({ error: "El servicio de IA no está disponible." });
    try {
        const prompt = `Genera 6 consejos cortos y creativos para estudiar matemáticas. Deben ser para estudiantes de secundaria. Devuelve la respuesta como HTML, donde cada consejo es un <div> con un <h3> para el título y <p> para la descripción. Ejemplo: <div><h3>Visualiza el Problema</h3><p>Dibuja diagramas o gráficos...</p></div>`;
        const result = await model.generateContent(prompt);
        res.json({ tips: result.response.text() });
    } catch (error) {
        res.status(500).json({ error: "No se pudo generar los consejos." });
    }
});


// --- LÓGICA DEL CHAT (Socket.io) ---
const onlineUsers = {}; const userSockets = {};
io.on('connection', (socket) => {
    // La conexión ahora se maneja post-login desde el cliente
    socket.on('register user', ({ username, code }) => {
        socket.username = username;
        socket.userCode = code;
        onlineUsers[username] = code;
        userSockets[code] = socket.id;
        io.emit('online users update', Object.keys(onlineUsers));
    });

    socket.on('add friend', async (friendCode, callback) => {
        const friend = await User.findOne({ code: friendCode }, 'username code');
        callback({ success: !!friend, friend: friend });
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