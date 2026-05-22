const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('node:fs');
const https = require('https');
const cookieParser = require('cookie-parser');
const { initDatabase } = require('./database');
const { startHeartbeatService } = require('./heartbeat');
const app = express();
const port = process.env.PORT || 3000;

// Initialize database
initDatabase();

// Start heartbeat cleanup service
startHeartbeatService();

// Middleware
app.use(cors({
    origin: 'https://wamjamparty.i3s.univ-cotedazur.fr', // Allow all origins in dev; restrict in production
    credentials: true, // Allow cookies
    optionsSuccessStatus: 200,
}));
app.use(express.json({ limit: '10mb' })); // Large limit for CRDT data
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/config', express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/sessions', require('./routes/sessions'));

// Legacy config routes (kept for backwards compatibility)
const fs = require('node:fs');

app.get('/wamsConfig/:name', (req, res) => {
    const filePath = path.join(__dirname, `/public/wamsConfig/${req.params.name}.json`);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          console.error("Error reading file:", err);
          res.status(500).send("Error reading file").end();
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(data).end();
      });
 })

 app.get('/wamsConfig/', (req, res) => {
    const directoryPath = path.join(__dirname, '/public/wamsConfig/');
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error('Error reading directory:', err);
            res.status(500).send('Error reading directory').end();
            return;
        }
        const jsonFiles = files.filter(file => file.endsWith('.json')).map(file => file.replace('.json', ''));
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(jsonFiles).end();
    });
});

// Start server
app.listen(port, () => {
    console.log(`[Server] HTTP server running on port ${port}`);
});