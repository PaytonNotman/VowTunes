import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'vowtunes.spotify.tokens';

function getBrowserStorage() {
  if (Platform.OS !== 'web' || typeof globalThis.localStorage === 'undefined') {
    return null;
  }

  return globalThis.localStorage;
}

export async function loadTokens() {
  const browserStorage = getBrowserStorage();
  const storedValue = browserStorage
    ? browserStorage.getItem(TOKEN_KEY)
    : await SecureStore.getItemAsync(TOKEN_KEY);

  if (!storedValue) {
    return null;
  }

  try {
    return JSON.parse(storedValue);
  } catch {
    if (browserStorage) {
      browserStorage.removeItem(TOKEN_KEY);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
    return null;
  }
}

export async function saveTokens(tokens) {
  const browserStorage = getBrowserStorage();

  if (browserStorage) {
    browserStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    return;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearTokens() {
  const browserStorage = getBrowserStorage();

  if (browserStorage) {
    browserStorage.removeItem(TOKEN_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
