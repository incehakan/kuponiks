import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import GradientButton from '../../components/GradientButton';
import { colors, radii } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import {
  authApi,
  extractAuthToken,
  extractAuthUser,
  getErrorMessage,
  saveToken,
} from '../../services/api';
import { syncExpoPushTokenWithBackend } from '../../services/pushNotifications';
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandBlock}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kayıt Ol</Text>

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

          <GradientButton
            label="FIRSATLARI KEŞFET"
            onPress={() => void handleRegister()}
            loading={isSubmitting}
            disabled={isSubmitting}
            style={styles.cta}
          />

          <Pressable
            style={styles.linkButton}
            onPress={() => navigation.navigate('Login')}
            disabled={isSubmitting}
          >
            <Text style={styles.linkText}>
              Zaten hesabın var mı?{' '}
              <Text style={styles.linkAccent}>Giriş Yap</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 48,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logo: {
    width: '100%',
    maxWidth: 320,
    height: 180,
  },
  card: {
    backgroundColor: 'rgba(36, 16, 70, 0.92)',
    borderRadius: radii.lg,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
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
  },
  cta: { marginTop: 8 },
  linkButton: {
    marginTop: 18,
    alignItems: 'center',
  },
  linkText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  linkAccent: {
    color: colors.accent,
    fontWeight: '700',
  },
});
