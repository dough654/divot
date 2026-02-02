import { StyleSheet, View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type HotspotSetupGuideProps = {
  hotspotSsid?: string;
  hotspotPassword?: string;
  isCamera?: boolean;
  isDark?: boolean;
};

/**
 * Guide for setting up mobile hotspot connection.
 * Shows different instructions for camera (host) and viewer (client) roles.
 */
export const HotspotSetupGuide = ({
  hotspotSsid,
  hotspotPassword,
  isCamera = false,
  isDark = false,
}: HotspotSetupGuideProps) => {
  const cameraSteps = [
    'Enable your phone\'s mobile hotspot',
    'Note the hotspot name and password',
    'The QR code will update with hotspot info',
    'Wait for the viewer to connect',
  ];

  const viewerStepsAndroid = [
    'Open WiFi settings on this device',
    `Connect to: ${hotspotSsid || 'Camera\'s hotspot'}`,
    `Password: ${hotspotPassword || '(shown on QR)'}`,
    'Return here after connecting',
  ];

  const viewerStepsIOS = [
    'Scan the QR code with your camera app',
    'Tap "Join Network" when prompted',
    'Return to SwingLink after connecting',
  ];

  const steps = isCamera
    ? cameraSteps
    : Platform.OS === 'ios'
    ? viewerStepsIOS
    : viewerStepsAndroid;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Ionicons
          name={isCamera ? 'phone-portrait' : 'wifi'}
          size={32}
          color="#4CAF50"
        />
        <Text style={[styles.title, isDark && styles.titleDark]}>
          {isCamera ? 'Enable Hotspot' : 'Connect to Hotspot'}
        </Text>
      </View>

      <View style={styles.stepsContainer}>
        {steps.map((step, index) => (
          <View key={index} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={[styles.stepText, isDark && styles.stepTextDark]}>
              {step}
            </Text>
          </View>
        ))}
      </View>

      {!isCamera && hotspotSsid && (
        <View style={[styles.credentialsBox, isDark && styles.credentialsBoxDark]}>
          <View style={styles.credentialRow}>
            <Text style={[styles.credentialLabel, isDark && styles.credentialLabelDark]}>
              Network:
            </Text>
            <Text style={[styles.credentialValue, isDark && styles.credentialValueDark]}>
              {hotspotSsid}
            </Text>
          </View>
          {hotspotPassword && (
            <View style={styles.credentialRow}>
              <Text style={[styles.credentialLabel, isDark && styles.credentialLabelDark]}>
                Password:
              </Text>
              <Text style={[styles.credentialValue, isDark && styles.credentialValueDark]}>
                {hotspotPassword}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={isDark ? '#888' : '#666'}
        />
        <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
          Hotspot mode provides the best connection quality with lowest latency.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  containerDark: {
    backgroundColor: '#2a2a4e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  titleDark: {
    color: '#ffffff',
  },
  stepsContainer: {
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  stepTextDark: {
    color: '#ccc',
  },
  credentialsBox: {
    marginTop: 20,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  credentialsBoxDark: {
    backgroundColor: '#1a1a2e',
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  credentialLabel: {
    fontSize: 14,
    color: '#666',
  },
  credentialLabelDark: {
    color: '#888',
  },
  credentialValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    fontFamily: 'SpaceMono',
  },
  credentialValueDark: {
    color: '#ffffff',
  },
  infoBox: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 12,
  },
  infoBoxDark: {
    backgroundColor: '#1a3a1a',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  infoTextDark: {
    color: '#888',
  },
});
