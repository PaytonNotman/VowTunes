# VowTunes

VowTunes is an iPad-first wedding song request app. The host connects one
Spotify Premium account, selects the reception playback device, and lets guests
search for tracks and add them to the active Spotify queue.

The current Phase 1 proof of concept includes:

- Spotify Authorization Code with PKCE (no client secret in the app)
- secure native token persistence, browser persistence for local development,
  and automatic access-token refresh
- available-device discovery and selection
- a resilient Now Playing card for the selected device, including paused and
  inactive-player states
- track search with Spotify's Development Mode limit of 10 results
- add-to-queue with double-tap protection
- useful messages for inactive players, missing Premium access, expired auth,
  and rate limits

## Prerequisites

- Node.js 20.19 or newer
- a Spotify Premium account
- a Spotify Developer application
- an Expo account and Apple Developer Program membership only when creating an
  installable iPhone or iPad development build through EAS

## Spotify configuration

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Open the app's settings and add the redirect URIs needed for the platforms
   you want to test:

   ```text
   http://127.0.0.1:8081/spotify-callback
   vowtunes://spotify-callback
   ```

   The loopback URI is used for local web development. The custom-scheme URI is
   reserved for future native iPhone and iPad builds.

3. Copy `.env.example` to `.env` and replace the placeholder with the app's
   client ID:

   ```dotenv
   EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id
   ```

The client ID is a public OAuth identifier. Do not add the Spotify client
secret to `.env`, the JavaScript bundle, or any other mobile app file.

## Install and run

Install dependencies:

```powershell
npm install
```

### Test locally on Windows

Start the web version on the fixed port registered in the Spotify dashboard:

```powershell
npx expo start --web --port 8081
```

Open `http://127.0.0.1:8081` rather than `localhost` so the browser origin
matches the registered Spotify redirect. Sign in, select an active Spotify
Connect device, search for a track, and add it to the queue.

### Create a future iPhone or iPad build

Native OAuth requires a development build so iOS can register the
`vowtunes://` URL scheme. From Windows, use an EAS cloud build after enrolling
in the Apple Developer Program:

```powershell
npx eas-cli login
npx eas-cli build --platform ios --profile development
```

Install the resulting build on the registered iPad. Then start Metro and open
the installed VowTunes development app:

```powershell
npm start
```

For a local Android proof of concept, use `npm run android`. A Mac with Xcode is
required for a local iOS build.

## Reception proof-of-concept test

1. Open Spotify using the same account that VowTunes will authorize.
2. Start playing music on the intended iPad, computer, or Spotify Connect
   speaker.
3. Open VowTunes and connect Spotify.
4. Select the active playback device.
5. Confirm the current song and playback state appear in **Now Playing**.
6. Search for a track and press **+ Queue**.
7. Confirm the track appears in Spotify's upcoming queue.

Run the project checks with:

```powershell
npm run check
npx expo export --platform web
```

## Project structure

```text
src/
|-- api/          Spotify authentication and Web API calls
|-- components/   Reusable track result UI
|-- config/       Spotify endpoints, scopes, and redirect settings
|-- context/      Authentication lifecycle and token refresh
|-- screens/      Phase 1 setup/search proof-of-concept screen
`-- storage/      Secure token persistence
```

Guest-mode protections such as request cooldowns, duplicate blocking,
explicit-content policy, and an organizer PIN are intentionally reserved for
the next phase.
