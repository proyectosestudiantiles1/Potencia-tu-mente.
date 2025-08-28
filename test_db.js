// test_db.js - Probador de Conexión a MongoDB

require('dotenv').config();
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL;

console.log('--- INICIANDO PRUEBA DE CONEXIÓN ---');
console.log('Intentando conectar con la URL proporcionada...');

if (!DATABASE_URL) {
    console.error('❌ ERROR CRÍTICO: No se encontró la variable DATABASE_URL. Asegúrate de que está configurada en Render.');
    process.exit(1); // Detiene el programa con un error
}

mongoose.connect(DATABASE_URL)
  .then(() => {
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log('      ¡CONEXIÓN CON MONGODB EXITOSA!');
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    process.exit(0); // Detiene el programa con éxito
  })
  .catch(err => {
    console.error('❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
    console.error('      ERROR DEFINITIVO AL CONECTAR:');
    console.error(err);
    console.error('❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
    process.exit(1); // Detiene el programa con un error
  });