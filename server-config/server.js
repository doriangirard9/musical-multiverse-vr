/**
 * =============================================================================
 * WAM Jam Party - Serveur Principal
 * =============================================================================
 * Ce fichier est le point d'entrée du serveur backend.
 * Il configure Express, initialise la base de données, et monte les routes.
 * =============================================================================
 */

const express = require('express');
const path = require("path");
const cors = require('cors');
const fs = require('node:fs');
const https = require('https');

/*
const credentials = {
    key: fs.readFileSync('../localhost.key', 'utf8'),
    cert: fs.readFileSync('../localhost.crt', 'utf8')
}
*/

// Import des modules de base de données
const { initializeDatabase, closeDatabase, cleanupExpiredTokens } = require('./database/db');

// Import des routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const sessionRoutes = require('./routes/sessions');

const app = express();
const port = 3000;

// =============================================================================
// CONFIGURATION CORS
// =============================================================================
const corsOptions = {
    origin: function (origin, callback) {
        // Autorise les requêtes sans origin (ex: Postman, curl)
        // et les origines locales pour le développement
        const allowedOrigins = [
            'http://localhost:5173',    // Vite dev server
            'http://localhost:3000',
            'https://wamjamparty.i3s.univ-cotedazur.fr'
        ];

        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // En production, accepte l'origin si fourni
            callback(null, true);
        }
    },
    credentials: true, // Permet l'envoi de cookies
    optionsSuccessStatus: 200 // For legacy browser support
};


app.use(cors(corsOptions));

// =============================================================================
// MIDDLEWARES
// =============================================================================

// Parse le JSON dans le body des requêtes
app.use(express.json());

// Parse les données de formulaire URL-encoded
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques
app.use(express.static(__dirname + "/public"));
app.use('/config', express.static(path.join(__dirname, 'public')));

// =============================================================================
// ROUTES EXISTANTES (Configuration)
// =============================================================================

// Middleware pour définir le Content-Type par défaut pour les routes de config
const configHeaders = (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    }
    next();
};

app.get('/coreConfig/:name', configHeaders, (req, res) => {
    const filePath = path.join(__dirname, `/public/coreConfig/${req.params.name}.json`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading file:", err);
            res.status(500).send("Error reading file").end();
            return;
        }
        console.log("user ask for json file");
        res.status(200).json(data).end();
    });
});

app.get('/wamsConfig/:name', configHeaders, (req, res) => {
    const filePath = path.join(__dirname, `/public/wamsConfig/${req.params.name}.json`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading file:", err);
            res.status(500).send("Error reading file").end();
            return;
        }
        res.status(200).json(data).end();
    });
});

app.get('/wamsConfig/', configHeaders, (req, res) => {
    const directoryPath = path.join(__dirname, '/public/wamsConfig/');
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error("Error reading directory:", err);
            res.status(500).send("Error reading directory").end();
            return;
        }
        const jsonFiles = files.filter(file => file.endsWith('.json')).map(file => file.replace('.json', ''));
        res.status(200).json(jsonFiles).end();
    });
});

// =============================================================================
// ROUTES API
// =============================================================================

// Routes d'authentification
app.use('/api/auth', authRoutes);

// Routes des projets (inclut la gestion des membres)
app.use('/api/projects', projectRoutes);

// Route spéciale pour les sessions publiques
app.get('/api/sessions/public', (req, res, next) => {
    // Redirige vers le handler dans sessions.js
    req.url = '/public';
    sessionRoutes(req, res, next);
});

// Route pour créer rapidement une session publique
app.post('/api/sessions/quick-create', (req, res, next) => {
    req.url = '/quick-create';
    sessionRoutes(req, res, next);
});

// Route pour rejoindre une session publique directement
app.post('/api/sessions/:sessionId/join', (req, res, next) => {
    req.url = `/${req.params.sessionId}/join`;
    sessionRoutes(req, res, next);
});

// Route pour quitter une session directement
app.post('/api/sessions/:sessionId/leave', (req, res, next) => {
    req.url = `/${req.params.sessionId}/leave`;
    sessionRoutes(req, res, next);
});

// Routes des sessions (montées sous /api/projects pour le contexte projectId)
app.use('/api/projects', sessionRoutes);

// =============================================================================
// ROUTE DE SANTÉ
// =============================================================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// =============================================================================
// GESTION DES ERREURS
// =============================================================================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
    });
});

// =============================================================================
// DÉMARRAGE DU SERVEUR
// =============================================================================

// Initialise la base de données
try {
    initializeDatabase();
    console.log('✓ Database initialized');
} catch (error) {
    console.error('✗ Failed to initialize database:', error);
    process.exit(1);
}

// Nettoyage périodique des tokens expirés (toutes les heures)
setInterval(() => {
    try {
        cleanupExpiredTokens();
    } catch (error) {
        console.error('Token cleanup error:', error);
    }
}, 60 * 60 * 1000);


/*
const httpsServer = https.createServer(credentials, app)
httpsServer.listen(port, () => {
  console.log(`HTTPS Server running on port ${port}`);
})
  */
 
// Démarre le serveur HTTP(laisser TLS à Nginx)

app.listen(port, () => {
    console.log(`✓ HTTP server running on port ${port}`);
    console.log(`  - API: http://localhost:${port}/api`);
    console.log(`  - Health: http://localhost:${port}/api/health`);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down gracefully...');
    closeDatabase();
    process.exit(0);
});
