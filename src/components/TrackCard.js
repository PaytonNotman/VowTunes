import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

export function TrackCard({ track, disabled, isAdding, onAdd }) {
  const imageUrl = track.album?.images?.[1]?.url || track.album?.images?.[0]?.url;
  const artists = track.artists?.map((artist) => artist.name).join(', ');

  return (
    <View style={styles.card}>
      {imageUrl ? <Image accessibilityLabel="Album artwork" source={{ uri: imageUrl }} style={styles.artwork} /> : null}
      <View style={styles.details}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>{track.name}</Text>
          {track.explicit ? <Text style={styles.explicit}>E</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.artist}>{artists}</Text>
        <Text numberOfLines={1} style={styles.album}>{track.album?.name}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || isAdding}
        onPress={() => onAdd(track)}
        style={({ pressed }) => [
          styles.button,
          (disabled || isAdding) && styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}
      >
        {isAdding ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>+ Queue</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e9dfd4',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 10,
  },
  artwork: {
    backgroundColor: '#eee6dd',
    borderRadius: 10,
    height: 66,
    width: 66,
  },
  details: {
    flex: 1,
    marginHorizontal: 14,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  title: {
    color: '#29201d',
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  explicit: {
    backgroundColor: '#d8d0c8',
    borderRadius: 3,
    color: '#4d4540',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 7,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  artist: {
    color: '#675b55',
    fontSize: 14,
    marginTop: 4,
  },
  album: {
    color: '#9a8e87',
    fontSize: 12,
    marginTop: 2,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#7a3145',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    backgroundColor: '#b8aaa7',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
