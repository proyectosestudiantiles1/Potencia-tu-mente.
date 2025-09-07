// server.js - VERSIÓN FINAL CORREGIDA (CON PRÁCTICA Y CONSEJOS ARREGLADOS)

const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');
const bcrypt = require('bcrypt');
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

const UserSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// Sirviendo archivos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- RUTAS DE AUTENTICACIÓN ---
// ... (Sin cambios aquí, ya funcionan bien)
app.post('/api/register', async (req, res) => {
    try {
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
        const userCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6)();
        await new User({ username, password: hashedPassword, code: userCode }).save();
        res.status(201).json({ success: true, message: 'Usuario creado exitosamente.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Error en el servidor.' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }
        res.json({ success: true, user: { username: user.username, code: user.code } });
    } catch (error) { res.status(500).json({ success: false, message: 'Error en el servidor.' }); }
});

// --- RUTAS DE IA ---
app.post('/api/explain-math', async (req, res) => {
    if (!model) return res.status(503).json({ error: "Servicio de IA no disponible." });
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: "El tema es requerido." });
    try {
        const prompt = `Como tutor experto en matemáticas, explica detalladamente el concepto "${topic}" para un estudiante de secundaria. Usa únicamente etiquetas HTML (h3, p, ul, li, strong) para estructurar la respuesta. No incluyas markdown como \`\`\`.`;
        const result = await model.generateContent(prompt);
        res.json({ explanation: result.response.text() });
    } catch (error) { res.status(500).json({ error: "No se pudo generar la explicación." }); }
});

// [SOLUCIÓN 1] - Rellenamos la lógica para generar problemas
app.post('/api/generate-problems', async (req, res) => {
    if (!model) return res.status(503).json({ error: "Servicio de IA no disponible." });
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ error: "El tema es requerido." });
    try {
        const prompt = `Crea 3 problemas matemáticos sobre "${topic}" para secundaria. Devuelve la respuesta en HTML, usando esta estructura exacta para cada problema: <div class="problem-card"><h4>Problema [NÚMERO]:</h4><p>[AQUÍ LA PREGUNTA]</p><div class="solution" style="display:none;"><strong>Respuesta:</strong> [AQUÍ LA SOLUCIÓN]</div><button class="btn btn-secondary show-solution-btn">Ver Solución</button></div>. No incluyas markdown como \`\`\`.`;
        const result = await model.generateContent(prompt);
        res.json({ problems: result.response.text() });
    } catch (error) { res.status(500).json({ error: "No se pudo generar problemas." }); }
});

// [SOLUCIÓN 4] - Hacemos el prompt más estricto
app.get('/api/generate-tips', async (req, res) => {
    if (!model) return res.status(503).json({ error: "Servicio de IA no disponible." });
    try {
        const prompt = `Genera 4 consejos para estudiar matemáticas. Formatea CADA consejo en HTML, usando EXACTAMENTE esta estructura: <div class="card menu-card"><h3>[TÍTULO DEL CONSEJO]</h3><p>[DESCRIPCIÓN DEL CONSEJO]</p></div>. No incluyas NADA MÁS que los divs. NO USES markdown como \`\`\`.`;
        const result = await model.generateContent(prompt);
        res.json({ tips: result.response.text() });
    } catch (error) { res.status(500).json({ error: "No se pudo generar consejos." }); }
});

// --- LÓGICA DEL CHAT ---
// ... (Sin cambios aquí, ya funciona bien)
const onlineUsers = {}; const userSockets = {};
io.on('connection', (socket) => {
    socket.on('register user', (user) => {
        if (user && user.username && user.code) {
            socket.username = user.username;
            socket.userCode = user.code;
            onlineUsers[user.username] = user.code;
            userSockets[user.code] = socket.id;
            io.emit('online users update', Object.keys(onlineUsers));
        }
    });

    socket.on('add friend', async (friendCode, callback) => {
        const friend = await User.findOne({ code: friendCode }, 'username code').lean();
        callback({ success: !!friend, friend });
    });

    socket.on('private message', ({ toCode, message }) => {
        if (!socket.username) return;
        const recipientSocketId = userSockets[toCode];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('private message', { from: socket.username, message });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
            delete userSockets[socket.userCode];
            io.emit('online users update', Object.keys(onlineUsers));
        }
    });
});


server.listen(PORT, () => {
    console.log(`🚀 Servidor 'Potencia Tu Mente' corriendo en http://localhost:${PORT}`);
});