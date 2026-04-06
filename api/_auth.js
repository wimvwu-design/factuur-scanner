const { OAuth2Client } = require('google-auth-library');

let cachedClient = null;

function getClient() {
  if (!cachedClient) {
    cachedClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return cachedClient;
}

/**
 * Verify a Google ID token and return user info.
 * Returns { email, name, picture, sub } or null if invalid.
 */
async function verifyToken(idToken) {
  if (!idToken || !process.env.GOOGLE_CLIENT_ID) return null;

  try {
    const client = getClient();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return {
      sub: payload.sub,        // unique Google user ID
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return null;
  }
}

/**
 * Express/Vercel middleware: extracts and verifies the Bearer token.
 * Sets req.user or returns 401.
 */
async function requireAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Niet ingelogd' });
    return null;
  }

  const token = authHeader.substring(7);
  const user = await verifyToken(token);

  if (!user) {
    res.status(401).json({ error: 'Ongeldige of verlopen sessie' });
    return null;
  }

  return user;
}

module.exports = { verifyToken, requireAuth };
