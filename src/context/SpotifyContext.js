import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { exchangeAuthorizationCode, refreshAccessToken } from '../api/spotifyAuth';
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_DISCOVERY,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
} from '../config/spotify';
import { clearTokens, loadTokens, saveTokens } from '../storage/tokenStorage';

WebBrowser.maybeCompleteAuthSession();

const SpotifyContext = createContext(null);
const EXPIRY_BUFFER_MS = 60_000;

export function SpotifyProvider({ children }) {
  const [tokens, setTokens] = useState(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState('');
  const tokensRef = useRef(null);
  const refreshPromiseRef = useRef(null);
  const handledResponseRef = useRef(null);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID || 'spotify-client-id-not-configured',
      redirectUri: SPOTIFY_REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      scopes: SPOTIFY_SCOPES,
      usePKCE: true,
    },
    SPOTIFY_DISCOVERY,
  );

  const commitTokens = useCallback(async (nextTokens) => {
    tokensRef.current = nextTokens;
    setTokens(nextTokens);
    await saveTokens(nextTokens);
  }, []);

  useEffect(() => {
    let active = true;

    loadTokens()
      .then((storedTokens) => {
        if (active && storedTokens?.refreshToken) {
          tokensRef.current = storedTokens;
          setTokens(storedTokens);
        }
      })
      .catch(() => {
        if (active) {
          setAuthError('Saved Spotify sign-in could not be restored.');
        }
      })
      .finally(() => {
        if (active) {
          setIsRestoring(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!response || response.url === handledResponseRef.current) {
      return;
    }

    handledResponseRef.current = response.url;

    if (response.type !== 'success') {
      if (response.type === 'error') {
        setAuthError(response.error?.message || 'Spotify sign-in was not completed.');
      }
      setIsAuthenticating(false);
      return;
    }

    if (!request?.codeVerifier) {
      setAuthError('The Spotify PKCE verifier was unavailable. Please try signing in again.');
      setIsAuthenticating(false);
      return;
    }

    setIsAuthenticating(true);
    setAuthError('');

    exchangeAuthorizationCode({
      code: response.params.code,
      codeVerifier: request.codeVerifier,
      redirectUri: SPOTIFY_REDIRECT_URI,
    })
      .then(commitTokens)
      .catch((error) => setAuthError(error.message))
      .finally(() => setIsAuthenticating(false));
  }, [commitTokens, request, response]);

  const signIn = useCallback(async () => {
    if (!SPOTIFY_CLIENT_ID) {
      setAuthError('Add EXPO_PUBLIC_SPOTIFY_CLIENT_ID to your .env file first.');
      return;
    }

    if (!request) {
      setAuthError('Spotify sign-in is still loading. Try again in a moment.');
      return;
    }

    setAuthError('');
    setIsAuthenticating(true);
    const result = await promptAsync();

    if (result.type !== 'success') {
      setIsAuthenticating(false);
    }
  }, [promptAsync, request]);

  const signOut = useCallback(async () => {
    tokensRef.current = null;
    refreshPromiseRef.current = null;
    setTokens(null);
    setAuthError('');
    await clearTokens();
  }, []);

  const getAccessToken = useCallback(async (forceRefresh = false) => {
    const currentTokens = tokensRef.current;

    if (!currentTokens?.refreshToken) {
      throw new Error('Connect VowTunes to Spotify first.');
    }

    if (!forceRefresh && currentTokens.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
      return currentTokens.accessToken;
    }

    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = refreshAccessToken(currentTokens.refreshToken)
        .then(async (nextTokens) => {
          await commitTokens(nextTokens);
          return nextTokens.accessToken;
        })
        .catch(async (error) => {
          if (/invalid_grant/i.test(error.message)) {
            await signOut();
          }
          throw error;
        })
        .finally(() => {
          refreshPromiseRef.current = null;
        });
    }

    return refreshPromiseRef.current;
  }, [commitTokens, signOut]);

  const value = useMemo(
    () => ({
      authError,
      clientConfigured: Boolean(SPOTIFY_CLIENT_ID),
      getAccessToken,
      isAuthenticated: Boolean(tokens?.refreshToken),
      isAuthenticating,
      isRestoring,
      redirectUri: SPOTIFY_REDIRECT_URI,
      signIn,
      signOut,
    }),
    [authError, getAccessToken, isAuthenticating, isRestoring, signIn, signOut, tokens],
  );

  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>;
}

export function useSpotify() {
  const context = useContext(SpotifyContext);

  if (!context) {
    throw new Error('useSpotify must be used inside SpotifyProvider.');
  }

  return context;
}
