import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Animated,
	AppState,
	FlatList,
	Keyboard,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";

import {
	addTrackToQueue,
	getAvailableDevices,
	getPlaybackQueue,
	getPlaybackState,
	searchTracks,
} from "../api/spotifyClient";
import { NowPlayingCard } from "../components/NowPlayingCard";
import { TrackCard } from "../components/TrackCard";
import { UpcomingTrackList } from "../components/UpcomingTrackList";
import { useSpotify } from "../context/SpotifyContext";

const QUEUE_REFRESH_INTERVAL_MS = 5000;
const PLAYBACK_REFRESH_INTERVAL_MS = 5000;
const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH_LENGTH = 2;
const MESSAGE_DISPLAY_DURATION_MS = 2000;
const MESSAGE_FADE_DURATION_MS = 2000;

function queuesMatch(currentTracks, nextTracks) {
	return (
		currentTracks.length === nextTracks.length &&
		currentTracks.every((track, index) => track.uri === nextTracks[index]?.uri)
	);
}

function countTrackIdentities(tracks) {
	const trackCounts = new Map();

	tracks.forEach((track) => {
		const trackIdentity = track.uri || track.id;
		trackCounts.set(
			trackIdentity,
			(trackCounts.get(trackIdentity) || 0) + 1,
		);
	});

	return trackCounts;
}

function findQueueOverlapLength(currentTracks, nextTracks) {
	const maximumOverlap = Math.min(currentTracks.length, nextTracks.length);

	for (let overlapLength = maximumOverlap; overlapLength > 0; overlapLength -= 1) {
		const currentOffset = currentTracks.length - overlapLength;
		const overlaps = nextTracks
			.slice(0, overlapLength)
			.every((track, index) =>
				(track.uri || track.id) ===
				(currentTracks[currentOffset + index]?.uri || currentTracks[currentOffset + index]?.id),
			);

		if (overlaps) {
			return overlapLength;
		}
	}

	return 0;
}

function reconcileRequestedQueue(requestedTracks, currentTracks, nextTracks) {
	const remainingNextTrackCounts = countTrackIdentities(nextTracks);
	const queueOverlapLength = findQueueOverlapLength(currentTracks, nextTracks);
	const addedTrackCounts = countTrackIdentities(nextTracks.slice(queueOverlapLength));

	return requestedTracks.flatMap((request) => {
		let observed = request.observed;

		if (!observed) {
			const addedCount = addedTrackCounts.get(request.trackIdentity) || 0;
			if (addedCount > 0) {
				addedTrackCounts.set(request.trackIdentity, addedCount - 1);
				observed = true;
			}
		}

		if (!observed) {
			return [request];
		}

		const remainingCount = remainingNextTrackCounts.get(request.trackIdentity) || 0;

		if (remainingCount > 0) {
			remainingNextTrackCounts.set(request.trackIdentity, remainingCount - 1);
			return [{ ...request, observed: true }];
		}

		return [];
	});
}

function describeError(error) {
	if (error.status === 401) {
		return "Spotify authorization expired. Reconnect and try again.";
	}
	if (error.status === 403) {
		return "Spotify rejected this action. Confirm the account has Premium and granted playback access.";
	}
	if (error.status === 404) {
		return "No active Spotify player was found. Start music in Spotify, then refresh devices.";
	}
	if (error.status === 429) {
		return `Spotify rate limit reached. Try again in ${error.retryAfter || "a few"} seconds.`;
	}
	return error.message || "Something went wrong.";
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
	const [query, setQuery] = useState("");
	const [tracks, setTracks] = useState([]);
	const [upcomingTracks, setUpcomingTracks] = useState([]);
	const [playbackState, setPlaybackState] = useState(null);
	const [hasCheckedPlayback, setHasCheckedPlayback] = useState(false);
	const [playbackStatusUnavailable, setPlaybackStatusUnavailable] = useState(false);
	const [isAppActive, setIsAppActive] = useState(AppState.currentState === "active");
	const [isLoadingDevices, setIsLoadingDevices] = useState(false);
	const [isLoadingQueue, setIsLoadingQueue] = useState(false);
	const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [addingTrackId, setAddingTrackId] = useState(null);
	const [queuedTrackAnimation, setQueuedTrackAnimation] = useState(null);
	const [queuedTrackAnimations, setQueuedTrackAnimations] = useState([]);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const searchRequestIdRef = useRef(0);
	const queuedTrackAnimationIdRef = useRef(0);
	const requestedQueueRef = useRef([]);
	const upcomingTracksRef = useRef([]);
	const queueRefreshInFlightRef = useRef(false);
	const playbackRefreshInFlightRef = useRef(false);
	const nextPlaybackRefreshAtRef = useRef(0);
	const messageOpacity = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (nextState) => {
			setIsAppActive(nextState === "active");
		});

		return () => subscription.remove();
	}, []);

	useEffect(() => {
		if (!message) {
			messageOpacity.setValue(0);
			return undefined;
		}

		messageOpacity.setValue(1);
		const displayTimeoutId = setTimeout(() => {
			Animated.timing(messageOpacity, {
				duration: MESSAGE_FADE_DURATION_MS,
				toValue: 0,
				useNativeDriver: Platform.OS !== "web",
			}).start(({ finished }) => {
				if (finished) {
					setMessage("");
				}
			});
		}, MESSAGE_DISPLAY_DURATION_MS);

		return () => {
			clearTimeout(displayTimeoutId);
			messageOpacity.stopAnimation();
		};
	}, [message, messageOpacity]);

	const withSpotifyToken = useCallback(
		async (operation) => {
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
		},
		[getAccessToken],
	);

	const refreshDevices = useCallback(async () => {
		if (!isAuthenticated) {
			return;
		}
		setIsLoadingDevices(true);
		setError("");
		try {
			const nextDevices = await withSpotifyToken(getAvailableDevices);
			setDevices(nextDevices);
			setSelectedDeviceId((currentId) => {
				if (nextDevices.some((device) => device.id === currentId)) {
					return currentId;
				}
				return (
					nextDevices.find((device) => device.is_active)?.id ||
					nextDevices[0]?.id ||
					null
				);
			});
			if (nextDevices.length === 0) {
				setMessage(
					"Open Spotify on the reception device and start playing, then refresh.",
				);
			}
		} catch (requestError) {
			setError(describeError(requestError));
		} finally {
			setIsLoadingDevices(false);
		}
	}, [isAuthenticated, withSpotifyToken]);

	const refreshQueue = useCallback(async (options = {}) => {
		const { showError = true, showLoading = true } = options;

		if (!isAuthenticated || !selectedDeviceId || !isAppActive || queueRefreshInFlightRef.current) {
			return;
		}

		queueRefreshInFlightRef.current = true;
		if (showLoading) {
			setIsLoadingQueue(true);
		}

		try {
			const nextTracks = await withSpotifyToken(getPlaybackQueue);
			requestedQueueRef.current = reconcileRequestedQueue(
				requestedQueueRef.current,
				upcomingTracksRef.current,
				nextTracks,
			);
			upcomingTracksRef.current = nextTracks;
			setUpcomingTracks((currentTracks) =>
				queuesMatch(currentTracks, nextTracks) ? currentTracks : nextTracks,
			);
		} catch (requestError) {
			if (showError) {
				setError(describeError(requestError));
			}
		} finally {
			queueRefreshInFlightRef.current = false;
			if (showLoading) {
				setIsLoadingQueue(false);
			}
		}
	}, [isAppActive, isAuthenticated, selectedDeviceId, withSpotifyToken]);

	useEffect(() => {
		if (!isAuthenticated) {
			requestedQueueRef.current = [];
			upcomingTracksRef.current = [];
			setQueuedTrackAnimation(null);
			setQueuedTrackAnimations([]);
		}
	}, [isAuthenticated]);

	const handleQueuedTrackAnimation = useCallback((animationId) => {
		setQueuedTrackAnimations((currentAnimations) =>
			currentAnimations.filter((animation) => animation.id !== animationId),
		);
	}, []);

	const refreshPlayback = useCallback(async (options = {}) => {
		const { showError = true, showLoading = true } = options;

		if (
			!isAuthenticated ||
			!selectedDeviceId ||
			!isAppActive ||
			playbackRefreshInFlightRef.current ||
			Date.now() < nextPlaybackRefreshAtRef.current
		) {
			return;
		}

		playbackRefreshInFlightRef.current = true;
		if (showLoading) {
			setIsLoadingPlayback(true);
		}

		try {
			const nextPlaybackState = await withSpotifyToken(getPlaybackState);
			setPlaybackState(nextPlaybackState);
			setPlaybackStatusUnavailable(false);
			nextPlaybackRefreshAtRef.current = 0;
		} catch (requestError) {
			setPlaybackStatusUnavailable(true);
			if (requestError.status === 429) {
				const retryAfterSeconds = Number.parseInt(requestError.retryAfter, 10);
				nextPlaybackRefreshAtRef.current = Date.now() +
					(Number.isFinite(retryAfterSeconds) ? Math.max(retryAfterSeconds, 5) : 30) * 1000;
			}
			if (showError) {
				setError(describeError(requestError));
			}
		} finally {
			setHasCheckedPlayback(true);
			playbackRefreshInFlightRef.current = false;
			if (showLoading) {
				setIsLoadingPlayback(false);
			}
		}
	}, [isAppActive, isAuthenticated, selectedDeviceId, withSpotifyToken]);

	useEffect(() => {
		refreshDevices();
	}, [refreshDevices]);

	useEffect(() => {
		refreshQueue();
		const intervalId = setInterval(
			() => refreshQueue({ showError: false, showLoading: false }),
			QUEUE_REFRESH_INTERVAL_MS,
		);
		return () => clearInterval(intervalId);
	}, [refreshQueue]);

	useEffect(() => {
		setHasCheckedPlayback(false);
		setPlaybackStatusUnavailable(false);
		nextPlaybackRefreshAtRef.current = 0;
	}, [isAuthenticated, selectedDeviceId]);

	useEffect(() => {
		if (!selectedDeviceId) {
			return undefined;
		}

		refreshPlayback();
		const intervalId = setInterval(
			() => refreshPlayback({ showError: false, showLoading: false }),
			PLAYBACK_REFRESH_INTERVAL_MS,
		);
		return () => clearInterval(intervalId);
	}, [refreshPlayback, selectedDeviceId]);

	useEffect(() => {
		const normalizedQuery = query.trim();
		const requestId = searchRequestIdRef.current;

		if (normalizedQuery.length < MIN_SEARCH_LENGTH) {
			setTracks([]);
			setIsSearching(false);
			return;
		}

		const timeoutId = setTimeout(async () => {
			setIsSearching(true);
			setTracks([]);

			try {
				const results = await withSpotifyToken((accessToken) =>
					searchTracks(accessToken, normalizedQuery),
				);

				if (requestId !== searchRequestIdRef.current) {
					return;
				}

				setTracks(results);
				if (results.length === 0) {
					setMessage("No tracks matched that search.");
				}
			} catch (requestError) {
				if (requestId === searchRequestIdRef.current) {
					setError(describeError(requestError));
				}
			} finally {
				if (requestId === searchRequestIdRef.current) {
					setIsSearching(false);
				}
			}
		}, SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timeoutId);
	}, [query, withSpotifyToken]);

	const handleQueryChange = (nextQuery) => {
		searchRequestIdRef.current += 1;
		setQuery(nextQuery);
		setError("");
		setMessage("");
	};

	const handleAddTrack = async (track) => {
		if (addingTrackId || !selectedDeviceId) {
			return;
		}
		setAddingTrackId(track.id);
		setError("");
		setMessage("");
		try {
			await withSpotifyToken((accessToken) =>
				addTrackToQueue(accessToken, track.uri, selectedDeviceId),
			);
			queuedTrackAnimationIdRef.current += 1;
			const animationId = queuedTrackAnimationIdRef.current;
			const shouldDropIntoFirstSlot = requestedQueueRef.current.length === 0;
			requestedQueueRef.current = [
				...requestedQueueRef.current,
				{
					id: animationId,
					observed: false,
					trackIdentity: track.uri || track.id,
				},
			];
			const queuedAnimation = {
				id: animationId,
				shouldDropIntoFirstSlot,
				track,
			};
			setQueuedTrackAnimation(queuedAnimation);
			setQueuedTrackAnimations((currentAnimations) => [
				...currentAnimations,
				queuedAnimation,
			]);
			searchRequestIdRef.current += 1;
			setQuery("");
			setTracks([]);
			Keyboard.dismiss();
			setMessage(`Added “${track.name}” to the queue.`);
			await refreshQueue({ showError: false, showLoading: false });
		} catch (requestError) {
			setError(describeError(requestError));
		} finally {
			setAddingTrackId(null);
		}
	};

	const selectedDevice = devices.find((device) => device.id === selectedDeviceId) || null;

	if (isRestoring) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator color='#7a3145' size='large' />
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
					Connect the wedding Spotify account to test search, device
					discovery, and queueing.
				</Text>
				<View style={styles.setupCard}>
					<Text style={styles.cardTitle}>Spotify setup</Text>
					<Text style={styles.label}>Registered redirect URI</Text>
					<Text selectable style={styles.code}>
						{redirectUri}
					</Text>
					<Text style={styles.hint}>
						Add this exact URI in the Spotify Developer Dashboard
						before connecting.
					</Text>
					{!clientConfigured ? (
						<Text style={styles.warning}>
							Create a .env file and add
							EXPO_PUBLIC_SPOTIFY_CLIENT_ID.
						</Text>
					) : null}
					{authError ? (
						<Text style={styles.error}>{authError}</Text>
					) : null}
					<Pressable
						disabled={isAuthenticating || !clientConfigured}
						onPress={signIn}
						style={({ pressed }) => [
							styles.primaryButton,
							(!clientConfigured || isAuthenticating) &&
								styles.disabledButton,
							pressed && styles.pressedButton,
						]}>
						{isAuthenticating ? (
							<ActivityIndicator color='#fff' />
						) : (
							<Text style={styles.primaryButtonText}>
								Connect Spotify
							</Text>
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
				<View style={styles.connectedPill}>
					<Text style={styles.connectedText}>
						● Spotify connected
					</Text>
				</View>

				<View style={styles.sectionHeader}>
					<Text style={styles.label}>PLAYBACK DEVICE</Text>
					<Pressable
						disabled={isLoadingDevices}
						onPress={refreshDevices}>
						<Text style={styles.link}>
							{isLoadingDevices ? "Refreshing…" : "Refresh"}
						</Text>
					</Pressable>
				</View>

				<ScrollView style={styles.deviceList}>
					{devices.map((device) => {
						const selected = selectedDeviceId === device.id;
						return (
							<Pressable
								key={device.id}
								onPress={() => setSelectedDeviceId(device.id)}
								style={[
									styles.device,
									selected && styles.selectedDevice,
								]}>
								<View
									style={[
										styles.radio,
										selected && styles.radioSelected,
									]}
								/>
								<View style={styles.deviceText}>
									<Text
										numberOfLines={1}
										style={styles.deviceName}>
										{device.name}
									</Text>
									<Text style={styles.deviceMeta}>
										{device.type}
										{device.is_active ? " · Active" : ""}
									</Text>
								</View>
							</Pressable>
						);
					})}
				</ScrollView>

				<Pressable onPress={signOut} style={styles.secondaryButton}>
					<Text style={styles.secondaryButtonText}>
						Disconnect Spotify
					</Text>
				</Pressable>
			</View>

			<View style={styles.main}>
				<Text style={styles.mainTitle}>What should we play?</Text>
				<Text style={styles.mainSubtitle}>
					Search Spotify and add a track to the selected reception
					device.
				</Text>
				<View style={styles.searchRow}>
					<TextInput
						autoCapitalize='none'
						onChangeText={handleQueryChange}
						onSubmitEditing={Keyboard.dismiss}
						placeholder='Song or artist'
						placeholderTextColor='#9a8e87'
						returnKeyType='search'
						style={styles.searchInput}
						value={query}
					/>
					{isSearching ? (
						<ActivityIndicator
							color='#7a3145'
							style={styles.searchSpinner}
						/>
					) : null}
					{message ? (
						<View pointerEvents='none' style={styles.messageToastLayer}>
							<Animated.View
								style={[
									styles.messageToast,
									{ opacity: messageOpacity },
								]}>
								<Text style={styles.messageToastText}>{message}</Text>
							</Animated.View>
						</View>
					) : null}
				</View>

				{error ? <Text style={styles.errorBanner}>{error}</Text> : null}
				{!selectedDeviceId ? (
					<Text style={styles.warningBanner}>
						Select an active Spotify device before queueing.
					</Text>
				) : null}

				{query.trim() ? (
					<View style={styles.searchResultsLayout}>
						<View style={styles.fixedNowPlaying}>
							<NowPlayingCard
								hasLoaded={hasCheckedPlayback}
								isLoading={isLoadingPlayback}
								playbackState={playbackState}
								selectedDevice={selectedDevice}
								statusUnavailable={playbackStatusUnavailable}
							/>
						</View>
						<FlatList
							contentContainerStyle={styles.results}
							data={tracks}
							keyExtractor={(track) => track.id}
							keyboardShouldPersistTaps='handled'
							renderItem={({ item }) => (
								<TrackCard
									disabled={
										!selectedDeviceId || Boolean(addingTrackId)
									}
									isAdding={addingTrackId === item.id}
									onAdd={handleAddTrack}
									track={item}
								/>
							)}
							style={styles.searchResultsList}
						/>
					</View>
				) : (
					<ScrollView contentContainerStyle={styles.dashboardContent}>
						<NowPlayingCard
							hasLoaded={hasCheckedPlayback}
							isLoading={isLoadingPlayback}
							playbackState={playbackState}
							selectedDevice={selectedDevice}
							statusUnavailable={playbackStatusUnavailable}
						/>
						<UpcomingTrackList
							isLoading={isLoadingQueue}
							onQueuedTrackAnimationHandled={handleQueuedTrackAnimation}
							onRefresh={() => refreshQueue()}
							queuedTrackAnimation={queuedTrackAnimation}
							queuedTrackAnimations={queuedTrackAnimations}
							tracks={upcomingTracks}
						/>
					</ScrollView>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	centered: { alignItems: "center", flex: 1, justifyContent: "center" },
	muted: { color: "#7b6f69", marginTop: 14 },
	setupContainer: {
		alignItems: "center",
		flexGrow: 1,
		justifyContent: "center",
		padding: 36,
	},
	eyebrow: {
		color: "#a36f4c",
		fontSize: 12,
		fontWeight: "800",
		letterSpacing: 2,
	},
	heroTitle: {
		color: "#342622",
		fontSize: 54,
		fontWeight: "800",
		letterSpacing: -2,
		marginTop: 8,
	},
	heroCopy: {
		color: "#6d5f58",
		fontSize: 17,
		lineHeight: 25,
		marginBottom: 28,
		marginTop: 8,
		maxWidth: 600,
		textAlign: "center",
	},
	setupCard: {
		backgroundColor: "#fff",
		borderColor: "#e8ddd2",
		borderRadius: 22,
		borderWidth: 1,
		maxWidth: 590,
		padding: 28,
		width: "100%",
	},
	cardTitle: {
		color: "#342622",
		fontSize: 22,
		fontWeight: "800",
		marginBottom: 22,
	},
	label: {
		color: "#7b6d66",
		fontSize: 11,
		fontWeight: "800",
		letterSpacing: 1.2,
	},
	code: {
		backgroundColor: "#f5f0ea",
		borderRadius: 8,
		color: "#4d403a",
		fontFamily: "monospace",
		marginTop: 8,
		padding: 12,
	},
	hint: { color: "#897b74", fontSize: 13, lineHeight: 19, marginTop: 9 },
	warning: { color: "#925b10", fontSize: 14, marginTop: 18 },
	error: { color: "#a52d36", fontSize: 14, marginTop: 14 },
	primaryButton: {
		alignItems: "center",
		backgroundColor: "#7a3145",
		borderRadius: 12,
		justifyContent: "center",
		marginTop: 22,
		minHeight: 50,
	},
	primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
	disabledButton: { backgroundColor: "#b9aaa7" },
	pressedButton: { opacity: 0.84 },
	appContainer: { flex: 1, flexDirection: "row" },
	sidebar: {
		backgroundColor: "#efe5db",
		borderRightColor: "#dfd2c5",
		borderRightWidth: 1,
		padding: 26,
		width: 300,
	},
	sidebarTitle: {
		color: "#342622",
		fontSize: 25,
		fontWeight: "800",
		marginTop: 8,
	},
	connectedPill: {
		alignSelf: "flex-start",
		backgroundColor: "#dcebdc",
		borderRadius: 20,
		marginTop: 18,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	connectedText: { color: "#32623b", fontSize: 12, fontWeight: "700" },
	sectionHeader: {
		alignItems: "center",
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 30,
	},
	link: { color: "#7a3145", fontSize: 13, fontWeight: "800" },
	deviceList: { marginTop: 10 },
	device: {
		alignItems: "center",
		borderColor: "transparent",
		borderRadius: 12,
		borderWidth: 1,
		flexDirection: "row",
		marginBottom: 8,
		padding: 11,
	},
	selectedDevice: { backgroundColor: "#fff", borderColor: "#dbc8bc" },
	radio: {
		borderColor: "#aa9c94",
		borderRadius: 8,
		borderWidth: 2,
		height: 16,
		width: 16,
	},
	radioSelected: { backgroundColor: "#7a3145", borderColor: "#7a3145" },
	deviceText: { flex: 1, marginLeft: 10 },
	deviceName: { color: "#443631", fontSize: 14, fontWeight: "700" },
	deviceMeta: {
		color: "#897b74",
		fontSize: 11,
		marginTop: 2,
		textTransform: "capitalize",
	},
	secondaryButton: {
		alignItems: "center",
		borderColor: "#b99ca4",
		borderRadius: 10,
		borderWidth: 1,
		minHeight: 42,
		justifyContent: "center",
		marginTop: 16,
	},
	secondaryButtonText: { color: "#7a3145", fontSize: 13, fontWeight: "700" },
	main: { flex: 1, paddingHorizontal: 34, paddingTop: 30 },
	mainTitle: {
		color: "#342622",
		fontSize: 32,
		fontWeight: "800",
		letterSpacing: -0.8,
	},
	mainSubtitle: { color: "#7b6d66", fontSize: 15, marginTop: 5 },
	searchRow: { marginTop: 22, position: "relative" },
	searchInput: {
		backgroundColor: "#fff",
		borderColor: "#dfd2c8",
		borderRadius: 12,
		borderWidth: 1,
		color: "#342622",
		fontSize: 16,
		minHeight: 50,
		paddingHorizontal: 16,
		paddingRight: 50,
	},
	searchSpinner: { position: "absolute", right: 16, top: 15 },
	messageToastLayer: {
		alignItems: "center",
		left: 0,
		position: "absolute",
		right: 0,
		top: 52,
		zIndex: 10,
	},
	messageToast: {
		backgroundColor: "#dcebdc",
		borderColor: "#bdd8c0",
		borderRadius: 12,
		borderWidth: 1,
		maxWidth: "86%",
		paddingHorizontal: 22,
		paddingVertical: 11,
		...Platform.select({
			web: {
				boxShadow: "0 3px 16px rgba(52, 38, 34, 0.16)",
			},
			default: {
				elevation: 5,
				shadowColor: "#342622",
				shadowOffset: { height: 3, width: 0 },
				shadowOpacity: 0.16,
				shadowRadius: 8,
			},
		}),
	},
	messageToastText: {
		color: "#32623b",
		fontSize: 13,
		fontWeight: "700",
		textAlign: "center",
	},
	errorBanner: {
		backgroundColor: "#f8dfe1",
		borderRadius: 9,
		color: "#8d2931",
		marginTop: 12,
		padding: 11,
	},
	warningBanner: {
		backgroundColor: "#f5e8ce",
		borderRadius: 9,
		color: "#805515",
		marginTop: 12,
		padding: 11,
	},
	results: { paddingBottom: 30 },
	fixedNowPlaying: {
		backgroundColor: "#f7f2eb",
		paddingBottom: 12,
	},
	searchResultsLayout: { flex: 1, minHeight: 0 },
	searchResultsList: { flex: 1, minHeight: 0 },
	dashboardContent: { paddingBottom: 30 },
});
