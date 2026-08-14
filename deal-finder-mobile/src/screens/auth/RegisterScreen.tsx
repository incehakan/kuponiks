import { NativeStackScreenProps } from '@react-navigation/native-stack';
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
import { useAuth } from '../../context/AuthContext';
import {
  authApi,
  extractAuthToken,
  extractAuthUser,
  getErrorMessage,
  saveToken,
} from '../../services/api';
import { syncExpoPushTokenWithBackend } from '../../services/pushNotifications';
import { colors, radii, spacing } from '../../theme';
import type { AuthStackParamList } from '../../types/navigation';

type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;

interface RegisterFormState {
  fullName: string;
  phone: string;
  password: string;
}

export default function RegisterScreen({
  navigation,
}: RegisterScreenProps): React.JSX.Element {
  const { signIn } = useAuth();
  const [form, setForm] = useState<RegisterFormState>({
    fullName: '',
    phone: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleChange = (field: keyof RegisterFormState, value: string): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegister = async (): Promise<void> => {
    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    const password = form.password;

    if (!fullName || !phone || !password) {
      Alert.alert(
        'Eksik bilgi',
        'Lütfen ad soyad, telefon ve şifre alanlarını doldurun.',
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert('Geçersiz şifre', 'Şifreniz en az 6 karakter olmalıdır.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authApi.register(fullName, phone, password);
      const token =
        extractAuthToken(response) ?? extractAuthToken({ data: response });

      if (!token) {
        Alert.alert(
          'Kayıt başarısız',
          'Sunucudan geçerli bir token alınamadı. Lütfen tekrar deneyin.',
        );
        return;
      }

      await saveToken(token);
      const user = extractAuthUser(response);
      if (!user) {
        Alert.alert(
          'Kayıt başarısız',
          'Sunucudan kullanıcı bilgisi alınamadı. Lütfen tekrar deneyin.',
        );
        return;
      }

      await signIn(String(token), user);
      void syncExpoPushTokenWithBackend();
    } catch (error) {
      Alert.alert(
        'Kayıt başarısız',
        getErrorMessage(error, 'Kayıt oluşturulamadı. Lütfen tekrar deneyin.'),
      );
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
          <KuponiksLogo size="md" showWordmark showTagline />
          <Text style={styles.heading}>Kayıt Ol</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Ad Soyad</Text>
            <TextInput
              style={styles.input}
              value={form.fullName}
              onChangeText={(value) => handleChange('fullName', value)}
              placeholder="Adınız Soyadınız"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="words"
              editable={!isSubmitting}
            />

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
              placeholder="En az 6 karakter"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              editable={!isSubmitting}
            />
          </View>

          <PrimaryButton
            label="Kayıt Ol"
            onPress={() => void handleRegister()}
            loading={isSubmitting}
            disabled={isSubmitting}
            style={styles.cta}
          />
          <SecondaryButton
            label="Giriş Yap"
            onPress={() => navigation.navigate('Login')}
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
  heading: {
    marginTop: spacing.lg,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  card: {
    marginTop: spacing.xl,
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
