const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('node:fs');
const https = require('https');
const cookieParser = require('cookie-parser');
const options = require('./options');
const { initDatabase } = require('./database');
const { startHeartbeatService } = require('./heartbeat');
const app = express();

// Initialize database
initDatabase();

// Start heartbeat cleanup service
startHeartbeatService();

// Middleware
app.use(cors({
    origin: options.AUTHORIZED_ORIGINS,
    credentials: true, // Allow cookies
    optionsSuccessStatus: 200,
}))

app.use(express.json({ limit: '10mb' })) // Large limit for CRDT data

app.use(cookieParser())

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/configs', require('./routes/configs'));

// Start server
app.listen(options.PORT, () => {
    console.log(`[Server] HTTP server running on port ${options.PORT}`);
});