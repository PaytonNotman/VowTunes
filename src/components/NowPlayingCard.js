import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

function getArtistNames(track) {
  return track?.artists?.map((artist) => artist.name).filter(Boolean).join(', ') || 'Unknown artist';
}

export function NowPlayingCard({ hasLoaded, isLoading, playbackState, selectedDevice, statusUnavailable }) {
  const isSelectedDevicePlaying = Boolean(
    playbackState?.device?.id && playbackState.device.id === selectedDevice?.id,
  );
  const track = isSelectedDevicePlaying && playbackState.item?.type === 'track'
    ? playbackState.item
    : null;
  const imageUrl = track?.album?.images?.[1]?.url || track?.album?.images?.[0]?.url;

  let emptyTitle = 'Select a playback device';
  let emptyMessage = 'Choose the Spotify device used at the reception to see what is playing.';

  if (selectedDevice && hasLoaded) {
    emptyTitle = 'Nothing is playing on this device';
    emptyMessage = 'Start a song in Spotify on the selected device and it will appear here.';
  }

  if (selectedDevice && hasLoaded && statusUnavailable) {
    emptyTitle = 'Playback status is temporarily unavailable';
    emptyMessage = 'VowTunes will try Spotify again automatically.';
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>NOW PLAYING</Text>

      {!hasLoaded && selectedDevice ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator color="#7a3145" />
          <Text style={styles.loadingText}>Checking Spotify playback...</Text>
        </View>
      ) : null}

      {(hasLoaded || !selectedDevice) && !track ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>{'\u266a'}</Text>
          </View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyMessage}>{emptyMessage}</Text>
          </View>
        </View>
      ) : null}

      {track ? (
        <View style={styles.card}>
          {imageUrl ? (
            <Image accessibilityLabel={`Album artwork for ${track.album?.name || track.name}`} source={{ uri: imageUrl }} style={styles.artwork} />
          ) : (
            <View accessible accessibilityLabel="Album artwork unavailable" accessibilityRole="image" style={[styles.artwork, styles.artworkFallback]}>
              <Text style={styles.artworkFallbackText}>{'\u266a'}</Text>
            </View>
          )}
          <View style={styles.details}>
            <View style={[styles.statusPill, playbackState.is_playing ? styles.playingPill : styles.pausedPill]}>
              <Text style={[styles.statusText, playbackState.is_playing ? styles.playingText : styles.pausedText]}>
                {playbackState.is_playing ? 'Playing' : 'Paused'}
              </Text>
            </View>
            <Text numberOfLines={2} style={styles.trackName}>{track.name}</Text>
            <Text numberOfLines={2} style={styles.artistName}>{getArtistNames(track)}</Text>
            <Text numberOfLines={1} style={styles.deviceName}>
              {statusUnavailable ? 'Status update delayed - ' : ''}On {selectedDevice.name}
            </Text>
          </View>
          {isLoading ? <ActivityIndicator color="#7a3145" size="small" style={styles.refreshIndicator} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  eyebrow: {
    color: '#a36f4c',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 9,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e1d3c7',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 146,
    padding: 14,
  },
  artwork: {
    backgroundColor: '#eee6dd',
    borderRadius: 12,
    height: 116,
    width: 116,
  },
  artworkFallback: {
    alignItems: 'center',
    backgroundColor: '#f0e5db',
    justifyContent: 'center',
  },
  artworkFallbackText: { color: '#a36f4c', fontSize: 44 },
  details: { flex: 1, marginLeft: 18, minWidth: 0 },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  playingPill: { backgroundColor: '#dcebdc' },
  pausedPill: { backgroundColor: '#f0e5db' },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  playingText: { color: '#32623b' },
  pausedText: { color: '#765a45' },
  trackName: {
    color: '#342622',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 27,
    marginTop: 8,
  },
  artistName: {
    color: '#6d5f58',
    fontSize: 15,
    lineHeight: 20,
    marginTop: 3,
  },
  deviceName: { color: '#9a8e87', fontSize: 11, marginTop: 7 },
  refreshIndicator: { marginLeft: 10 },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e9dfd4',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 88,
    padding: 18,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#f0e5db',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  emptyIconText: { color: '#a36f4c', fontSize: 25 },
  emptyCopy: { flex: 1, marginLeft: 14 },
  emptyTitle: { color: '#443631', fontSize: 15, fontWeight: '700' },
  emptyMessage: {
    color: '#897b74',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  loadingText: {
    color: '#897b74',
    flex: 1,
    fontSize: 13,
    marginLeft: 12,
  },
});
