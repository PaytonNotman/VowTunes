import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

export function UpcomingTrackList({ isLoading, onRefresh, tracks }) {
  const trackOccurrences = new Map();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>UP NEXT</Text>
          <Text style={styles.title}>Next 5 tracks</Text>
        </View>
        <Pressable accessibilityRole="button" disabled={isLoading} onPress={onRefresh}>
          <Text style={[styles.refresh, isLoading && styles.refreshDisabled]}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Text>
        </Pressable>
      </View>

      {isLoading && tracks.length === 0 ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color="#7a3145" />
          <Text style={styles.emptyText}>Loading Spotify queue...</Text>
        </View>
      ) : null}

      {!isLoading && tracks.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nothing is queued yet</Text>
          <Text style={styles.emptyText}>Start a playlist in Spotify or search for a song to add.</Text>
        </View>
      ) : null}

      {tracks.map((track, index) => {
        const imageUrl = track.album?.images?.[2]?.url || track.album?.images?.[1]?.url || track.album?.images?.[0]?.url;
        const artists = track.artists?.map((artist) => artist.name).join(', ');
        const trackKey = track.uri || track.id;
        const occurrence = (trackOccurrences.get(trackKey) || 0) + 1;
        trackOccurrences.set(trackKey, occurrence);

        return (
          <View key={`${trackKey}-${occurrence}`} style={styles.track}>
            <View style={styles.position}>
              <Text style={styles.positionText}>{index + 1}</Text>
            </View>
            {imageUrl ? (
              <Image accessibilityLabel="Album artwork" source={{ uri: imageUrl }} style={styles.artwork} />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
            )}
            <View style={styles.details}>
              <Text numberOfLines={1} style={styles.trackName}>{track.name}</Text>
              <Text numberOfLines={1} style={styles.artistName}>{artists}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eyebrow: {
    color: '#a36f4c',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: '#342622',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 3,
  },
  refresh: {
    color: '#7a3145',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 88,
    padding: 8,
    textAlign: 'right',
  },
  refreshDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e9dfd4',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  emptyTitle: {
    color: '#443631',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    color: '#897b74',
    fontSize: 13,
    marginTop: 7,
    textAlign: 'center',
  },
  track: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e9dfd4',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 8,
    padding: 9,
  },
  position: {
    alignItems: 'center',
    backgroundColor: '#f0e5db',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    marginRight: 10,
    width: 32,
  },
  positionText: {
    color: '#7a3145',
    fontSize: 14,
    fontWeight: '800',
  },
  artwork: {
    backgroundColor: '#eee6dd',
    borderRadius: 8,
    height: 52,
    width: 52,
  },
  artworkPlaceholder: {
    opacity: 0.6,
  },
  details: {
    flex: 1,
    marginLeft: 12,
  },
  trackName: {
    color: '#342622',
    fontSize: 15,
    fontWeight: '700',
  },
  artistName: {
    color: '#7b6d66',
    fontSize: 13,
    marginTop: 4,
  },
});
