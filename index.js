// INIZIALIZZA IL SERVER
// index.js
const express = require('express');
const fileUpload = require('express-fileupload');

const app = express();
const port = 3000;
const path = require('path');

// Middleware per leggere JSON e file da form
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
    limits: { fileSize: 100 * 1024 }, // 100KB
    abortOnLimit: true}
));

/*
A cosa servono:
express.json()
Questo middleware serve per analizzare (parse) le richieste HTTP con corpo (body) in formato JSON. 
È fondamentale per leggere req.body quando i dati vengono inviati in formato JSON (tipico nelle API REST moderne).

express.urlencoded({ extended: true })
Questo middleware serve per analizzare i corpi delle richieste con contenuti di tipo application/x-www-form-urlencoded, come quelli inviati da moduli HTML classici.
L'opzione extended: true indica che si può usare la libreria qs per analizzare strutture più complesse (oggetti annidati).
*/

// Endpoint base
app.get('/', (req, res) => {
  res.json({ message: 'Fotogram API è attiva!' });
});

// Espone la cartella uploads per accesso via URL
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Endpoint esterni definiti in endpoints.js
require('./endpoints')(app);

// Avvia il server
app.listen(port, () => {
  console.log(`Server attivo su http://localhost:${port}`);
});

//INTEGRAZIONE SWAGGER
const swaggerUi = require('swagger-ui-express'); // swagger UI per documentazione
const swaggerFile = require('./swagger-output.json'); // file JSON generato da swagger-autogen

// Espone la documentazione su /doc
app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile));

