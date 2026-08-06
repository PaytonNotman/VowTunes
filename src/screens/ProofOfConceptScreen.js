import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  addTrackToQueue,
  getAvailableDevices,
  getPlaybackQueue,
  searchTracks,
} from '../api/spotifyClient';
import { TrackCard } from '../components/TrackCard';
import { UpcomingTrackList } from '../components/UpcomingTrackList';
import { useSpotify } from '../context/SpotifyContext';

function describeError(error) {
  if (error.status === 401) {
    return 'Spotify authorization expired. Reconnect and try again.';
  }
  if (error.status === 403) {
    return 'Spotify rejected this action. Confirm the account has Premium and granted playback access.';
  }
  if (error.status === 404) {
    return 'No active Spotify player was found. Start music in Spotify, then refresh devices.';
  }
  if (error.status === 429) {
    return `Spotify rate limit reached. Try again in ${error.retryAfter || 'a few'} seconds.`;
  }
  return error.message || 'Something went wrong.';
}

export function ProofOfConceptScreen() {
  const {
    authError,
    clientConfigured,
    getAccessToken,
    isAuthenticated,
    isAuthenticating,
    isRestoring,
    redirectUri,
    signIn,
    signOut,
  } = useSpotify();
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [upcomingTracks, setUpcomingTracks] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [addingTrackId, setAddingTrackId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const withSpotifyToken = useCallback(async (operation) => {
    let accessToken = await getAccessToken();
    try {
      return await operation(accessToken);
    } catch (operationError) {
      if (operationError.status !== 401) {
        throw operationError;
      }
      accessToken = await getAccessToken(true);
      return operation(accessToken);
    }
  }, [getAccessToken]);

  const refreshDevices = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }
    setIsLoadingDevices(true);
    setError('');
    try {
      const nextDevices = await withSpotifyToken(getAvailableDevices);
      setDevices(nextDevices);
      setSelectedDeviceId((currentId) => {
        if (nextDevices.some((device) => device.id === currentId)) {
          return currentId;
        }
        return nextDevices.find((device) => device.is_active)?.id || nextDevices[0]?.id || null;
      });
      if (nextDevices.length === 0) {
        setMessage('Open Spotify on the reception device and start playing, then refresh.');
      }
    } catch (requestError) {
      setError(describeError(requestError));
    } finally {
      setIsLoadingDevices(false);
    }
  }, [isAuthenticated, withSpotifyToken]);

  const refreshQueue = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }
    setIsLoadingQueue(true);
    try {
      const nextTracks = await withSpotifyToken(getPlaybackQueue);
      setUpcomingTracks(nextTracks);
    } catch (requestError) {
      setError(describeError(requestError));
    } finally {
      setIsLoadingQueue(false);
    }
  }, [isAuthenticated, withSpotifyToken]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    refreshQueue();
    const intervalId = setInterval(refreshQueue, 30_000);
    return () => clearInterval(intervalId);
  }, [refreshQueue]);

  const handleSearch = async () => {
    if (!query.trim() || isSearching) {
      return;
    }
    setIsSearching(true);
    setError('');
    setMessage('');
    try {
      const results = await withSpotifyToken((accessToken) => searchTracks(accessToken, query));
      setTracks(results);
      if (results.length === 0) {
        setMessage('No tracks matched that search.');
      }
    } catch (requestError) {
      setError(describeError(requestError));
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddTrack = async (track) => {
    if (addingTrackId || !selectedDeviceId) {
      return;
    }
    setAddingTrackId(track.id);
    setError('');
    setMessage('');
    try {
      await withSpotifyToken((accessToken) => addTrackToQueue(accessToken, track.uri, selectedDeviceId));
      setMessage(`Added “${track.name}” to the queue.`);
      await refreshQueue();
    } catch (requestError) {
      setError(describeError(requestError));
    } finally {
      setAddingTrackId(null);
    }
  };

  if (isRestoring) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#7a3145" size="large" />
        <Text style={styles.muted}>Restoring Spotify connection…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScrollView contentContainerStyle={styles.setupContainer}>
        <Text style={styles.eyebrow}>WEDDING MUSIC, MADE SOCIAL</Text>
        <Text style={styles.heroTitle}>VowTunes</Text>
        <Text style={styles.heroCopy}>
          Connect the wedding Spotify account to test search, device discovery, and queueing.
        </Text>
        <View style={styles.setupCard}>
          <Text style={styles.cardTitle}>Spotify setup</Text>
          <Text style={styles.label}>Registered redirect URI</Text>
          <Text selectable style={styles.code}>{redirectUri}</Text>
          <Text style={styles.hint}>
            Add this exact URI in the Spotify Developer Dashboard before connecting.
          </Text>
          {!clientConfigured ? (
            <Text style={styles.warning}>Create a .env file and add EXPO_PUBLIC_SPOTIFY_CLIENT_ID.</Text>
          ) : null}
          {authError ? <Text style={styles.error}>{authError}</Text> : null}
          <Pressable
            disabled={isAuthenticating || !clientConfigured}
            onPress={signIn}
            style={({ pressed }) => [
              styles.primaryButton,
              (!clientConfigured || isAuthenticating) && styles.disabledButton,
              pressed && styles.pressedButton,
            ]}
          >
            {isAuthenticating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Connect Spotify</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.appContainer}>
      <View style={styles.sidebar}>
        <Text style={styles.eyebrow}>VOWTUNES</Text>
        <Text style={styles.sidebarTitle}>Reception setup</Text>
        <View style={styles.connectedPill}><Text style={styles.connectedText}>● Spotify connected</Text></View>

        <View style={styles.sectionHeader}>
          <Text style={styles.label}>PLAYBACK DEVICE</Text>
          <Pressable disabled={isLoadingDevices} onPress={refreshDevices}>
            <Text style={styles.link}>{isLoadingDevices ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.deviceList}>
          {devices.map((device) => {
            const selected = selectedDeviceId === device.id;
            return (
              <Pressable
                key={device.id}
                onPress={() => setSelectedDeviceId(device.id)}
                style={[styles.device, selected && styles.selectedDevice]}
              >
                <View style={[styles.radio, selected && styles.radioSelected]} />
                <View style={styles.deviceText}>
                  <Text numberOfLines={1} style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceMeta}>{device.type}{device.is_active ? ' · Active' : ''}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable onPress={signOut} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Disconnect Spotify</Text>
        </Pressable>
      </View>

      <View style={styles.main}>
        <Text style={styles.mainTitle}>What should we play?</Text>
        <Text style={styles.mainSubtitle}>Search Spotify and add a track to the selected reception device.</Text>
        <View style={styles.searchRow}>
          <TextInput
            autoCapitalize="none"
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            placeholder="Song or artist"
            placeholderTextColor="#9a8e87"
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
          />
          <Pressable
            disabled={!query.trim() || isSearching}
            onPress={handleSearch}
            style={[styles.searchButton, (!query.trim() || isSearching) && styles.disabledButton]}
          >
            {isSearching ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Search</Text>}
          </Pressable>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
        {message ? <Text style={styles.successBanner}>{message}</Text> : null}
        {!selectedDeviceId ? <Text style={styles.warningBanner}>Select an active Spotify device before queueing.</Text> : null}

        {query.trim() ? (
          <FlatList
            contentContainerStyle={styles.results}
            data={tracks}
            keyExtractor={(track) => track.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TrackCard
                disabled={!selectedDeviceId || Boolean(addingTrackId)}
                isAdding={addingTrackId === item.id}
                onAdd={handleAddTrack}
                track={item}
              />
            )}
          />
        ) : (
          <UpcomingTrackList
            isLoading={isLoadingQueue}
            onRefresh={refreshQueue}
            tracks={upcomingTracks}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  muted: { color: '#7b6f69', marginTop: 14 },
  setupContainer: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', padding: 36 },
  eyebrow: { color: '#a36f4c', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  heroTitle: { color: '#342622', fontSize: 54, fontWeight: '800', letterSpacing: -2, marginTop: 8 },
  heroCopy: { color: '#6d5f58', fontSize: 17, lineHeight: 25, marginBottom: 28, marginTop: 8, maxWidth: 600, textAlign: 'center' },
  setupCard: { backgroundColor: '#fff', borderColor: '#e8ddd2', borderRadius: 22, borderWidth: 1, maxWidth: 590, padding: 28, width: '100%' },
  cardTitle: { color: '#342622', fontSize: 22, fontWeight: '800', marginBottom: 22 },
  label: { color: '#7b6d66', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  code: { backgroundColor: '#f5f0ea', borderRadius: 8, color: '#4d403a', fontFamily: 'monospace', marginTop: 8, padding: 12 },
  hint: { color: '#897b74', fontSize: 13, lineHeight: 19, marginTop: 9 },
  warning: { color: '#925b10', fontSize: 14, marginTop: 18 },
  error: { color: '#a52d36', fontSize: 14, marginTop: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: '#7a3145', borderRadius: 12, justifyContent: 'center', marginTop: 22, minHeight: 50 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  disabledButton: { backgroundColor: '#b9aaa7' },
  pressedButton: { opacity: 0.84 },
  appContainer: { flex: 1, flexDirection: 'row' },
  sidebar: { backgroundColor: '#efe5db', borderRightColor: '#dfd2c5', borderRightWidth: 1, padding: 26, width: 300 },
  sidebarTitle: { color: '#342622', fontSize: 25, fontWeight: '800', marginTop: 8 },
  connectedPill: { alignSelf: 'flex-start', backgroundColor: '#dcebdc', borderRadius: 20, marginTop: 18, paddingHorizontal: 12, paddingVertical: 7 },
  connectedText: { color: '#32623b', fontSize: 12, fontWeight: '700' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  link: { color: '#7a3145', fontSize: 13, fontWeight: '800' },
  deviceList: { marginTop: 10 },
  device: { alignItems: 'center', borderColor: 'transparent', borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginBottom: 8, padding: 11 },
  selectedDevice: { backgroundColor: '#fff', borderColor: '#dbc8bc' },
  radio: { borderColor: '#aa9c94', borderRadius: 8, borderWidth: 2, height: 16, width: 16 },
  radioSelected: { backgroundColor: '#7a3145', borderColor: '#7a3145' },
  deviceText: { flex: 1, marginLeft: 10 },
  deviceName: { color: '#443631', fontSize: 14, fontWeight: '700' },
  deviceMeta: { color: '#897b74', fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  secondaryButton: { alignItems: 'center', borderColor: '#b99ca4', borderRadius: 10, borderWidth: 1, minHeight: 42, justifyContent: 'center', marginTop: 16 },
  secondaryButtonText: { color: '#7a3145', fontSize: 13, fontWeight: '700' },
  main: { flex: 1, paddingHorizontal: 34, paddingTop: 30 },
  mainTitle: { color: '#342622', fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  mainSubtitle: { color: '#7b6d66', fontSize: 15, marginTop: 5 },
  searchRow: { flexDirection: 'row', marginTop: 22 },
  searchInput: { backgroundColor: '#fff', borderColor: '#dfd2c8', borderRadius: 12, borderWidth: 1, color: '#342622', flex: 1, fontSize: 16, minHeight: 50, paddingHorizontal: 16 },
  searchButton: { alignItems: 'center', backgroundColor: '#7a3145', borderRadius: 12, justifyContent: 'center', marginLeft: 10, minWidth: 110 },
  errorBanner: { backgroundColor: '#f8dfe1', borderRadius: 9, color: '#8d2931', marginTop: 12, padding: 11 },
  successBanner: { backgroundColor: '#dcebdc', borderRadius: 9, color: '#32623b', marginTop: 12, padding: 11 },
  warningBanner: { backgroundColor: '#f5e8ce', borderRadius: 9, color: '#805515', marginTop: 12, padding: 11 },
  results: { paddingBottom: 30, paddingTop: 16 },
});
