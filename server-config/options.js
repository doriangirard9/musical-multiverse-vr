module.exports = {
    // The server port
    PORT: process.env.PORT || 3000,

    // The environment: "production" or "development"
    NODE_ENV: process.env.NODE_ENV || 'development',

    // CORS: which origins are allowed to access the API (comma-separated).
    // 5173 = port Vite par défaut (new_api), 5179 = port du Makefile de ce
    // projet. En dev le front passe par le proxy Vite (même origine) donc le
    // CORS ne joue plus, mais on garde les deux pour les accès directs.
    AUTHORIZED_ORIGINS: (process.env.AUTHORIZED_ORIGINS || "https://localhost:5173,https://localhost:5179").split(","),

    // JWT secret key (should be set to a secure value in production)
    JWT_SECRET: process.env.JWT_SECRET || 'a-very-secret-key',
}