import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';

interface PaymentWebViewModalProps {
  visible: boolean;
  /** URL to load in WebView (3D Secure page / provider checkout). */
  paymentUrl?: string;
  /** Raw HTML to render (e.g. Garanti auto-submit form). */
  paymentHtml?: string;
  /** URL pattern that signals payment completion (success return). */
  successUrlPattern?: string;
  /** URL pattern that signals cancellation / failure. */
  failureUrlPattern?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PaymentWebViewModal({
  visible,
  paymentUrl,
  paymentHtml,
  successUrlPattern = '/payment/success',
  failureUrlPattern = '/payment/fail',
  onSuccess,
  onCancel,
}: PaymentWebViewModalProps): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);

  const handleNavigationChange = useCallback(
    (event: WebViewNavigation) => {
      const url = event.url.toLowerCase();
      if (url.includes(successUrlPattern)) {
        onSuccess();
      } else if (url.includes(failureUrlPattern)) {
        onCancel();
      }
    },
    [successUrlPattern, failureUrlPattern, onSuccess, onCancel],
  );

  const source = paymentHtml
    ? { html: paymentHtml }
    : paymentUrl
      ? { uri: paymentUrl }
      : undefined;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Ödeme</Text>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
            <Text style={styles.closeText}>Kapat</Text>
          </TouchableOpacity>
        </View>

        {source ? (
          <WebView
            ref={webViewRef}
            source={source}
            style={styles.webView}
            onNavigationStateChange={handleNavigationChange}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
          />
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Ödeme sayfası yüklenemedi.</Text>
          </View>
        )}

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#12022B" />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A0836' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A164D',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  closeButton: { padding: 8 },
  closeText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
  webView: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: '#A0A0C0' },
});
