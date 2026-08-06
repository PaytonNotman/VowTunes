import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';

const TRACK_REMOVAL_DURATION_MS = 360;
const TRACK_ADDITION_DURATION_MS = 360;
const TRACK_ROW_HEIGHT = 80;

function getTrackIdentity(track) {
  return track?.uri || track?.id;
}

function findAddedTrackIndex(currentTracks, nextTracks) {
  const remainingTrackCounts = new Map();

  currentTracks.forEach((track) => {
    const trackIdentity = getTrackIdentity(track);
    remainingTrackCounts.set(trackIdentity, (remainingTrackCounts.get(trackIdentity) || 0) + 1);
  });

  return nextTracks.findIndex((track) => {
    const trackIdentity = getTrackIdentity(track);
    const remainingCount = remainingTrackCounts.get(trackIdentity) || 0;

    if (remainingCount === 0) {
      return true;
    }

    remainingTrackCounts.set(trackIdentity, remainingCount - 1);
    return false;
  });
}

export function UpcomingTrackList({ isLoading, onRefresh, tracks }) {
  const [displayedTracks, setDisplayedTracks] = useState(tracks);
  const [isRemovingFirstTrack, setIsRemovingFirstTrack] = useState(false);
  const [enteringTrackIndex, setEnteringTrackIndex] = useState(null);
  const displayedTracksRef = useRef(tracks);
  const latestTracksRef = useRef(tracks);
  const hasLoadedQueueRef = useRef(false);
  const previousIsLoadingRef = useRef(isLoading);
  const removalAnimationRef = useRef(null);
  const additionAnimationRef = useRef(null);
  const removalProgress = useRef(new Animated.Value(1)).current;
  const additionProgress = useRef(new Animated.Value(1)).current;
  const trackOccurrences = new Map();

  useEffect(() => {
    latestTracksRef.current = tracks;

    if (removalAnimationRef.current || additionAnimationRef.current) {
      return;
    }

    const currentTracks = displayedTracksRef.current;
    const currentFirstTrack = getTrackIdentity(currentTracks[0]);
    const nextFirstTrack = getTrackIdentity(tracks[0]);
    const shouldAnimateRemoval = Boolean(currentFirstTrack && currentFirstTrack !== nextFirstTrack);

    const animateTrackAddition = (addedTrackIndex) => {
      additionProgress.setValue(0);
      setEnteringTrackIndex(addedTrackIndex);

      const animation = Animated.timing(additionProgress, {
        duration: TRACK_ADDITION_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: false,
      });

      additionAnimationRef.current = animation;
      animation.start(({ finished }) => {
        additionAnimationRef.current = null;

        if (!finished) {
          return;
        }

        const latestTracks = latestTracksRef.current;
        displayedTracksRef.current = latestTracks;
        setDisplayedTracks(latestTracks);
        setEnteringTrackIndex(null);
        additionProgress.setValue(1);
      });
    };

    if (!shouldAnimateRemoval) {
      const addedTrackIndex = (currentTracks.length > 0 || hasLoadedQueueRef.current)
        ? findAddedTrackIndex(currentTracks, tracks)
        : -1;

      displayedTracksRef.current = tracks;
      setDisplayedTracks(tracks);

      if (addedTrackIndex < 0) {
        return;
      }

      animateTrackAddition(addedTrackIndex);
      return;
    }

    removalProgress.setValue(1);
    setIsRemovingFirstTrack(true);

    const animation = Animated.timing(removalProgress, {
      duration: TRACK_REMOVAL_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: false,
    });

    removalAnimationRef.current = animation;
    animation.start(({ finished }) => {
      removalAnimationRef.current = null;

      if (!finished) {
        return;
      }

      const latestTracks = latestTracksRef.current;
      displayedTracksRef.current = latestTracks;
      setDisplayedTracks(latestTracks);
      setIsRemovingFirstTrack(false);
      removalProgress.setValue(1);

      const addedTrackIndex = findAddedTrackIndex(currentTracks, latestTracks);
      if (addedTrackIndex >= 0) {
        animateTrackAddition(addedTrackIndex);
      }
    });
  }, [additionProgress, removalProgress, tracks]);

  useEffect(() => {
    if (previousIsLoadingRef.current && !isLoading) {
      hasLoadedQueueRef.current = true;
    }

    previousIsLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => () => {
    removalAnimationRef.current?.stop();
    additionAnimationRef.current?.stop();
  }, []);

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

      {isLoading && displayedTracks.length === 0 ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color="#7a3145" />
          <Text style={styles.emptyText}>Loading Spotify queue...</Text>
        </View>
      ) : null}

      {!isLoading && displayedTracks.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nothing is queued yet</Text>
          <Text style={styles.emptyText}>Start a playlist in Spotify or search for a song to add.</Text>
        </View>
      ) : null}

      {displayedTracks.map((track, index) => {
        const imageUrl = track.album?.images?.[2]?.url || track.album?.images?.[1]?.url || track.album?.images?.[0]?.url;
        const artists = track.artists?.map((artist) => artist.name).join(', ');
        const trackKey = track.uri || track.id;
        const occurrence = (trackOccurrences.get(trackKey) || 0) + 1;
        trackOccurrences.set(trackKey, occurrence);

        const isExiting = index === 0 && isRemovingFirstTrack;
        const isEntering = index === enteringTrackIndex;

        return (
          <Animated.View
            key={`${trackKey}-${occurrence}`}
            style={[
              styles.trackSlot,
              isExiting && {
                height: removalProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, TRACK_ROW_HEIGHT],
                }),
                opacity: removalProgress,
                transform: [{
                  translateX: removalProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-24, 0],
                  }),
                }],
              },
              isEntering && {
                height: additionProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, TRACK_ROW_HEIGHT],
                }),
                opacity: additionProgress,
                transform: [{
                  translateX: additionProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                }],
              },
            ]}
          >
            <View style={styles.track}>
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
          </Animated.View>
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
  trackSlot: {
    overflow: 'hidden',
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
