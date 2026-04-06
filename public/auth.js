// Genius Pay - Google Authentication
// Shared auth logic for app and dashboard

const AUTH_KEY = 'geniuspay_credential';
let currentUser = null;

function getStoredToken() {
  return localStorage.getItem(AUTH_KEY);
}

function storeToken(credential) {
  localStorage.setItem(AUTH_KEY, credential);
}

function clearToken() {
  localStorage.removeItem(AUTH_KEY);
  currentUser = null;
}

// Parse JWT payload (without verification - server does that)
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Check if token is expired
function isTokenExpired(token) {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return true;
  return Date.now() >= payload.exp * 1000;
}

// Get auth headers for API calls
function getAuthHeaders() {
  const token = getStoredToken();
  if (!token) return {};
  return { 'Authorization': `Bearer ${token}` };
}

// Authenticated fetch wrapper
async function authFetch(url, options = {}) {
  const token = getStoredToken();
  if (!token || isTokenExpired(token)) {
    clearToken();
    showLoginOverlay();
    throw new Error('Niet ingelogd');
  }

  const headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    showLoginOverlay();
    throw new Error('Sessie verlopen');
  }

  return response;
}

// Google Sign-In callback
function handleGoogleCredential(response) {
  storeToken(response.credential);
  const payload = parseJwt(response.credential);
  currentUser = {
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
  hideLoginOverlay();
  if (window.onAuthReady) window.onAuthReady(currentUser);
}

// Show login overlay
function showLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = '';
}

// Hide login overlay
function hideLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'none';
}

// Logout
function logout() {
  clearToken();
  google.accounts.id.disableAutoSelect();
  showLoginOverlay();
}

// Initialize auth on page load
function initAuth() {
  const token = getStoredToken();

  if (token && !isTokenExpired(token)) {
    const payload = parseJwt(token);
    currentUser = {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    };
    hideLoginOverlay();
    if (window.onAuthReady) window.onAuthReady(currentUser);
  } else {
    clearToken();
    showLoginOverlay();
  }
}
