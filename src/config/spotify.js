import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';

export const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '';

export const SPOTIFY_SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
];

export const SPOTIFY_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export const SPOTIFY_REDIRECT_URI = Platform.select({
  web: 'http://127.0.0.1:8081/spotify-callback',
  default: AuthSession.makeRedirectUri({
    scheme: 'vowtunes',
    path: 'spotify-callback',
  }),
});

export const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';
