module.exports = {
    // The server port
    PORT: process.env.PORT || 3000,

    // The environment: "production" or "development"
    ENV: process.env.ENV || 'production',

    // CORS: which origins are allowed to access the API
    AUTHORIZED_ORIGINS: process.env.AUTHORIZED_ORIGINS || "https://wamjamparty.i3s.univ-cotedazur.fr",

    // JWT secret key (should be set to a secure value in production)
    JWT_SECRET: process.env.JWT_SECRET || 'a-very-secret-key',
}