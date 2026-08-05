import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';

import { SpotifyProvider } from './src/context/SpotifyContext';
import { ProofOfConceptScreen } from './src/screens/ProofOfConceptScreen';

export default function App() {
  return (
    <SpotifyProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ProofOfConceptScreen />
      </SafeAreaView>
    </SpotifyProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f2eb',
  },
});
