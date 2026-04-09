/**
 * =============================================================================
 * WAM Jam Party - Script de Test de l'API
 * =============================================================================
 * Ce script teste toutes les routes de l'API de manière non-destructive.
 * Il crée un utilisateur de test, un projet et une session, puis nettoie.
 *
 * Usage:
 *   node scripts/test-api.js
 *   npm test
 * =============================================================================
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Génère un username unique pour éviter les conflits
const TEST_USERNAME = `test_${Date.now()}`;
const TEST_PASSWORD = 'testpass123';

// Variables pour stocker les données créées (pour le nettoyage)
let accessToken = null;
let refreshToken = null;
let userId = null;
let projectId = null;
let sessionId = null;

// Compteurs de tests
let passed = 0;
let failed = 0;

/**
 * Helper pour faire des requêtes HTTP
 */
async function request(method, path, body = null, token = null) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method,
        headers
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, options);
    const data = await response.json().catch(() => null);

    return { status: response.status, data };
}

/**
 * Affiche le résultat d'un test
 */
function test(name, condition, details = '') {
    if (condition) {
        console.log(`  ✓ ${name}`);
        passed++;
    } else {
        console.log(`  ✗ ${name} ${details}`);
        failed++;
    }
}

/**
 * Tests de santé
 */
async function testHealth() {
    console.log('\n📋 Tests de santé');

    const { status, data } = await request('GET', '/api/health');
    test('GET /api/health retourne 200', status === 200);
    test('Réponse contient status "ok"', data?.status === 'ok');
}

/**
 * Tests d'authentification
 */
async function testAuth() {
    console.log('\n🔐 Tests d\'authentification');

    // Register
    const registerRes = await request('POST', '/api/auth/register', {
        username: TEST_USERNAME,
        password: TEST_PASSWORD
    });
    test('POST /api/auth/register retourne 201', registerRes.status === 201);
    test('Register retourne un accessToken', !!registerRes.data?.accessToken);
    test('Register retourne un refreshToken', !!registerRes.data?.refreshToken);

    if (registerRes.data) {
        accessToken = registerRes.data.accessToken;
        refreshToken = registerRes.data.refreshToken;
        userId = registerRes.data.user?.id;
    }

    // Login
    const loginRes = await request('POST', '/api/auth/login', {
        username: TEST_USERNAME,
        password: TEST_PASSWORD
    });
    test('POST /api/auth/login retourne 200', loginRes.status === 200);
    test('Login retourne un accessToken', !!loginRes.data?.accessToken);

    // Get me
    const meRes = await request('GET', '/api/auth/me', null, accessToken);
    test('GET /api/auth/me retourne 200', meRes.status === 200);
    test('Me retourne le bon username', meRes.data?.user?.username === TEST_USERNAME);

    // Refresh token
    const refreshRes = await request('POST', '/api/auth/refresh', {
        refreshToken: refreshToken
    });
    test('POST /api/auth/refresh retourne 200', refreshRes.status === 200);
    test('Refresh retourne un nouveau accessToken', !!refreshRes.data?.accessToken);

    if (refreshRes.data?.accessToken) {
        accessToken = refreshRes.data.accessToken;
        refreshToken = refreshRes.data.refreshToken;
    }

    // Test accès non autorisé
    const unauthorizedRes = await request('GET', '/api/auth/me');
    test('GET /api/auth/me sans token retourne 401', unauthorizedRes.status === 401);
}

/**
 * Tests des projets
 */
async function testProjects() {
    console.log('\n📁 Tests des projets');

    // Create project
    const createRes = await request('POST', '/api/projects', {
        name: 'Projet de test',
        description: 'Description du projet de test',
        visibility: 'public'
    }, accessToken);
    test('POST /api/projects retourne 201', createRes.status === 201);
    test('Create retourne un projectId', !!createRes.data?.project?.id);

    if (createRes.data?.project) {
        projectId = createRes.data.project.id;
    }

    // List projects
    const listRes = await request('GET', '/api/projects', null, accessToken);
    test('GET /api/projects retourne 200', listRes.status === 200);
    test('List contient le projet créé', listRes.data?.projects?.some(p => p.id === projectId));

    // Get project
    const getRes = await request('GET', `/api/projects/${projectId}`, null, accessToken);
    test('GET /api/projects/:id retourne 200', getRes.status === 200);
    test('Get retourne le bon projet', getRes.data?.project?.id === projectId);

    // Update project
    const updateRes = await request('PATCH', `/api/projects/${projectId}`, {
        name: 'Projet de test modifié'
    }, accessToken);
    test('PATCH /api/projects/:id retourne 200', updateRes.status === 200);
    test('Update modifie le nom', updateRes.data?.project?.name === 'Projet de test modifié');
}

/**
 * Tests des sessions
 */
async function testSessions() {
    console.log('\n🎵 Tests des sessions');

    // Create session
    const createRes = await request('POST', `/api/projects/${projectId}/sessions`, {
        name: 'Session de test',
        visibility: 'public',
        maxParticipants: 10
    }, accessToken);
    test('POST /api/projects/:id/sessions retourne 201', createRes.status === 201);
    test('Create retourne un sessionId', !!createRes.data?.session?.id);

    if (createRes.data?.session) {
        sessionId = createRes.data.session.id;
    }

    // List sessions
    const listRes = await request('GET', `/api/projects/${projectId}/sessions`, null, accessToken);
    test('GET /api/projects/:id/sessions retourne 200', listRes.status === 200);
    test('List contient la session créée', listRes.data?.sessions?.some(s => s.id === sessionId));

    // Get session
    const getRes = await request('GET', `/api/projects/${projectId}/sessions/${sessionId}`, null, accessToken);
    test('GET /api/projects/:id/sessions/:sid retourne 200', getRes.status === 200);
    test('Get retourne la bonne session', getRes.data?.session?.id === sessionId);

    // Join session
    const joinRes = await request('POST', `/api/projects/${projectId}/sessions/${sessionId}/join`, null, accessToken);
    test('POST .../sessions/:sid/join retourne 200', joinRes.status === 200);

    // Leave session
    const leaveRes = await request('POST', `/api/projects/${projectId}/sessions/${sessionId}/leave`, null, accessToken);
    test('POST .../sessions/:sid/leave retourne 200', leaveRes.status === 200);

    // Public sessions
    const publicRes = await request('GET', '/api/sessions/public');
    test('GET /api/sessions/public retourne 200', publicRes.status === 200);
    test('Public sessions contient la session', publicRes.data?.sessions?.some(s => s.id === sessionId));
}

/**
 * Tests RBAC (optionnel - crée un second utilisateur)
 */
async function testRBAC() {
    console.log('\n🔒 Tests RBAC');

    // Crée un second utilisateur
    const user2 = `test2_${Date.now()}`;
    const register2Res = await request('POST', '/api/auth/register', {
        username: user2,
        password: 'pass123'
    });
    const token2 = register2Res.data?.accessToken;

    // User2 ne peut pas modifier le projet de User1
    const updateRes = await request('PATCH', `/api/projects/${projectId}`, {
        name: 'Tentative de modification'
    }, token2);
    test('User2 ne peut pas modifier le projet de User1', updateRes.status === 403);

    // User2 ne peut pas supprimer le projet de User1
    const deleteRes = await request('DELETE', `/api/projects/${projectId}`, null, token2);
    test('User2 ne peut pas supprimer le projet de User1', deleteRes.status === 403);

    // User2 peut voir le projet public
    const getRes = await request('GET', `/api/projects/${projectId}`, null, token2);
    test('User2 peut voir le projet public', getRes.status === 200);
}

/**
 * Nettoyage - supprime les données de test
 */
async function cleanup() {
    console.log('\n🧹 Nettoyage');

    // Supprime le projet (cascade supprime les sessions)
    if (projectId) {
        const deleteProjectRes = await request('DELETE', `/api/projects/${projectId}`, null, accessToken);
        test('Suppression du projet de test', deleteProjectRes.status === 200);
    }

    // Note: On ne supprime pas l'utilisateur car il n'y a pas de route pour ça
    // Les utilisateurs de test s'accumulent mais c'est acceptable pour les tests
    console.log(`  ℹ Utilisateur de test "${TEST_USERNAME}" conservé dans la DB`);
}

/**
 * Point d'entrée
 */
async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   WAM Jam Party - Tests de l\'API       ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`\nURL de base: ${BASE_URL}`);
    console.log(`Utilisateur de test: ${TEST_USERNAME}`);

    try {
        await testHealth();
        await testAuth();
        await testProjects();
        await testSessions();
        await testRBAC();
        await cleanup();

        console.log('\n════════════════════════════════════════');
        console.log(`Résultats: ${passed} passés, ${failed} échoués`);

        if (failed > 0) {
            console.log('\n⚠️  Certains tests ont échoué!');
            process.exit(1);
        } else {
            console.log('\n✅ Tous les tests sont passés!');
            process.exit(0);
        }
    } catch (error) {
        console.error('\n❌ Erreur fatale:', error.message);
        console.error('   Le serveur est-il démarré sur', BASE_URL, '?');
        process.exit(1);
    }
}

main();
