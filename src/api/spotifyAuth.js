import { SPOTIFY_CLIENT_ID, SPOTIFY_DISCOVERY } from '../config/spotify';

async function requestTokens(parameters) {
  const response = await fetch(SPOTIFY_DISCOVERY.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(parameters).toString(),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error_description || payload.error || 'Spotify authentication failed.';
    throw new Error(message);
  }

  return payload;
}

function toStoredTokens(payload, previousRefreshToken = null) {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || previousRefreshToken,
    expiresAt: Date.now() + payload.expires_in * 1000,
    scope: payload.scope || '',
  };
}

export async function exchangeAuthorizationCode({ code, codeVerifier, redirectUri }) {
  const payload = await requestTokens({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  return toStoredTokens(payload);
}

export async function refreshAccessToken(refreshToken) {
  const payload = await requestTokens({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  return toStoredTokens(payload, refreshToken);
}
