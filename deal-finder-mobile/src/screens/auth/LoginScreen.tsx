import { NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import KuponiksLogo from '../../components/KuponiksLogo';
import PrimaryButton from '../../components/PrimaryButton';
import SecondaryButton from '../../components/SecondaryButton';
import { APP_DESCRIPTION } from '../../constants/brand';
import { useAuth } from '../../context/AuthContext';
import {
  authApi,
  extractAuthToken,
  extractAuthUser,
  saveToken,
} from '../../services/api';
import { syncExpoPushTokenWithBackend } from '../../services/pushNotifications';
import { colors, radii, spacing } from '../../theme';
import type { AuthStackParamList } from '../../types/navigation';

type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;

interface LoginFormState {
  phone: string;
  password: string;
}

export default function LoginScreen({
  navigation,
}: LoginScreenProps): React.JSX.Element {
  const { signIn } = useAuth();
  const [form, setForm] = useState<LoginFormState>({
    phone: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleChange = (field: keyof LoginFormState, value: string): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogin = async (): Promise<void> => {
    const phone = form.phone.trim();
    const password = form.password;

    if (!phone || !password) {
      Alert.alert('Eksik bilgi', 'Lütfen telefon numarası ve şifrenizi girin.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authApi.login(phone, password);
      const token =
        extractAuthToken(response) ?? extractAuthToken({ data: response });

      if (!token) {
        Alert.alert(
          'Giriş başarısız',
          'Sunucudan geçerli bir token alınamadı. Lütfen tekrar deneyin.',
        );
        return;
      }

      await saveToken(token);
      const user = extractAuthUser(response);
      if (!user) {
        Alert.alert(
          'Giriş başarısız',
          'Sunucudan kullanıcı bilgisi alınamadı. Lütfen tekrar deneyin.',
        );
        return;
      }

      await signIn(String(token), user);
      void syncExpoPushTokenWithBackend();
    } catch (error) {
      let message = 'Giriş yapılamadı. Lütfen bilgilerinizi kontrol edin.';

      if (axios.isAxiosError(error)) {
        const backendMessage = error.response?.data?.message;
        if (typeof backendMessage === 'string' && backendMessage.trim()) {
          message = backendMessage.trim();
        } else if (error.message) {
          message = error.message;
        }
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }

      Alert.alert('Giriş başarısız', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <KuponiksLogo size="lg" showWordmark showTagline />
          <Text style={styles.description}>{APP_DESCRIPTION}</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Telefon Numarası</Text>
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={(value) => handleChange('phone', value)}
              placeholder="05XXXXXXXXX"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
              autoCapitalize="none"
              editable={!isSubmitting}
            />

            <Text style={styles.label}>Şifre</Text>
            <TextInput
              style={styles.input}
              value={form.password}
              onChangeText={(value) => handleChange('password', value)}
              placeholder="••••••••"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              editable={!isSubmitting}
            />
          </View>

          <PrimaryButton
            label="Giriş Yap"
            onPress={() => void handleLogin()}
            loading={isSubmitting}
            disabled={isSubmitting}
            style={styles.cta}
          />
          <SecondaryButton
            label="Kayıt Ol"
            onPress={() => navigation.navigate('Register')}
            disabled={isSubmitting}
            style={styles.secondary}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 36,
    paddingTop: 24,
  },
  description: {
    marginTop: spacing.xl,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    marginTop: spacing.xxl,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.white,
    marginBottom: 14,
    minHeight: 48,
  },
  cta: { marginTop: spacing.xl },
  secondary: { marginTop: spacing.md },
});
