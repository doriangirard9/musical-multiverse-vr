-- =============================================================================
-- WAM Jam Party - Schema de Base de Donnees SQLite
-- =============================================================================
-- Ce fichier definit la structure complete de la base de donnees.
-- Il est execute automatiquement au demarrage si les tables n'existent pas.
-- =============================================================================

-- Active le mode WAL (Write-Ahead Logging) pour de meilleures performances
-- et une meilleure gestion des acces concurrents
PRAGMA journal_mode = WAL;

-- Active les contraintes de cles etrangeres (desactivees par defaut dans SQLite)
PRAGMA foreign_keys = ON;

-- =============================================================================
-- TABLE: users
-- =============================================================================
-- Stocke les informations des utilisateurs enregistres.
-- Chaque utilisateur a un identifiant unique (UUID) et un nom d'utilisateur unique.
-- Le mot de passe est stocke sous forme de hash bcrypt (jamais en clair).
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    -- Identifiant unique de l'utilisateur (UUID v4)
    -- PRIMARY KEY signifie que cette colonne identifie de maniere unique chaque ligne
    id TEXT PRIMARY KEY,

    -- Nom d'utilisateur (doit etre unique dans toute la table)
    -- NOT NULL signifie que cette valeur ne peut pas etre vide
    -- UNIQUE signifie qu'aucun autre utilisateur ne peut avoir le meme nom
    username TEXT NOT NULL UNIQUE,

    -- Hash bcrypt du mot de passe (environ 60 caracteres)
    -- On ne stocke JAMAIS le mot de passe en clair pour des raisons de securite
    password_hash TEXT NOT NULL,

    -- Email de l'utilisateur (optionnel mais unique s'il est fourni)
    email TEXT UNIQUE,

    -- Nom affiche dans l'application (peut etre different du username)
    display_name TEXT,

    -- Date de creation du compte (timestamp Unix en millisecondes)
    -- DEFAULT utilise la fonction strftime pour obtenir le timestamp actuel
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

    -- Date de derniere mise a jour du profil
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

    -- Date de derniere connexion (mise a jour a chaque login)
    last_login_at INTEGER
);

-- =============================================================================
-- TABLE: projects
-- =============================================================================
-- Un projet est un conteneur pour des sessions musicales.
-- Chaque projet appartient a un utilisateur (le proprietaire/owner).
-- Le proprietaire a tous les droits sur le projet et ses sessions.
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
    -- Identifiant unique du projet (UUID v4)
    id TEXT PRIMARY KEY,

    -- Nom du projet (affiche dans l'interface)
    name TEXT NOT NULL,

    -- Description optionnelle du projet
    description TEXT,

    -- ID de l'utilisateur proprietaire (cle etrangere vers users.id)
    -- ON DELETE CASCADE signifie que si l'utilisateur est supprime,
    -- tous ses projets seront automatiquement supprimes aussi
    owner_id TEXT NOT NULL,

    -- Visibilite du projet: 'public' ou 'private'
    -- 'public': tout le monde peut voir le projet et ses sessions publiques
    -- 'private': seuls les membres invites peuvent voir le projet
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'private')),

    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

    -- Definition de la cle etrangere
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================================================
-- TABLE: sessions
-- =============================================================================
-- Une session est une "salle" de musique collaborative dans un projet.
-- Les utilisateurs rejoignent des sessions pour jouer ensemble en temps reel.
-- Chaque session appartient a un projet et herite de ses permissions de base.
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    -- Identifiant unique de la session (UUID v4)
    -- C'est aussi le "room name" utilise pour la connexion WebRTC
    id TEXT PRIMARY KEY,

    -- Nom de la session (affiche dans l'interface)
    name TEXT NOT NULL,

    -- Description optionnelle
    description TEXT,

    -- ID du projet parent
    project_id TEXT NOT NULL,

    -- ID de l'utilisateur qui a cree la session
    created_by TEXT NOT NULL,

    -- Visibilite de la session: 'public' ou 'private'
    -- 'public': accessible a tous (avec lien direct ou via projet public)
    -- 'private': accessible uniquement aux membres du projet
    visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'private')),

    -- Nombre maximum de participants (0 = illimite)
    max_participants INTEGER DEFAULT 0,

    -- Etat de la session
    -- 'active': session en cours, peut etre rejointe
    -- 'archived': session terminee, en lecture seule
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),

    -- Configuration de la session stockee en JSON
    -- (environnement, instruments disponibles, etc.)
    config_json TEXT,

    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

    -- Cles etrangeres
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================================================
-- TABLE: project_members
-- =============================================================================
-- Table de liaison pour le RBAC (Role-Based Access Control).
-- Definit quels utilisateurs ont acces a quels projets et avec quel role.
-- Le proprietaire n'a pas besoin d'etre dans cette table (il a tous les droits).
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_members (
    -- Identifiant unique de l'appartenance
    id TEXT PRIMARY KEY,

    -- ID du projet concerne
    project_id TEXT NOT NULL,

    -- ID de l'utilisateur membre
    user_id TEXT NOT NULL,

    -- Role de l'utilisateur dans le projet:
    -- 'admin': peut gerer les sessions et inviter des membres (mais pas supprimer le projet)
    -- 'editor': peut creer/modifier des sessions
    -- 'viewer': peut uniquement rejoindre les sessions existantes
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),

    -- ID de l'utilisateur qui a envoye l'invitation
    invited_by TEXT,

    -- Statut de l'invitation
    -- 'pending': invitation envoyee, en attente d'acceptation
    -- 'accepted': invitation acceptee, membre actif
    -- 'declined': invitation refusee
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),

    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

    -- Cles etrangeres
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,

    -- Un utilisateur ne peut etre membre d'un projet qu'une seule fois
    -- UNIQUE sur la combinaison (project_id, user_id) empeche les doublons
    UNIQUE (project_id, user_id)
);

-- =============================================================================
-- TABLE: refresh_tokens
-- =============================================================================
-- Stocke les tokens de rafraichissement pour la gestion des sessions JWT.
-- Permet de delivrer de nouveaux access tokens sans re-authentification.
-- =============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    -- Le token lui-meme (hash pour la securite)
    token_hash TEXT PRIMARY KEY,

    -- ID de l'utilisateur proprietaire du token
    user_id TEXT NOT NULL,

    -- Date d'expiration du token (timestamp Unix en ms)
    expires_at INTEGER NOT NULL,

    -- Date de creation
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

    -- Informations sur le device/navigateur (pour audit)
    device_info TEXT,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================================================
-- TABLE: session_participants
-- =============================================================================
-- Historique des participations aux sessions.
-- Permet de savoir qui a participe a quelle session et quand.
-- Utile pour les statistiques et l'historique.
-- =============================================================================
CREATE TABLE IF NOT EXISTS session_participants (
    id TEXT PRIMARY KEY,

    -- ID de la session
    session_id TEXT NOT NULL,

    -- ID de l'utilisateur participant
    user_id TEXT NOT NULL,

    -- Date d'entree dans la session
    joined_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

    -- Date de sortie (NULL si encore present)
    left_at INTEGER,

    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================================================
-- INDEX
-- =============================================================================
-- Les index accelerent les recherches sur les colonnes frequemment utilisees.
-- Sans index, SQLite doit parcourir toute la table pour trouver les lignes.
-- Avec un index, c'est comme un index alphabetique dans un livre.
-- =============================================================================

-- Index pour rechercher rapidement les projets d'un utilisateur
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

-- Index pour rechercher rapidement les sessions d'un projet
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);

-- Index pour rechercher rapidement les membres d'un projet
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

-- Index pour rechercher les tokens d'un utilisateur (pour les revoquer)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Index pour trouver les tokens expires (pour le nettoyage)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- Index pour l'historique des participants
CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_user ON session_participants(user_id);
