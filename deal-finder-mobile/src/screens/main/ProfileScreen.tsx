import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlyphIcon from '../../components/GlyphIcon';

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import {
  PLAN_COMPARISON_ROWS,
  PLAN_DEFINITIONS,
} from '../../constants/planFeatures';
import {
  buildTelegramDeepLink,
  TELEGRAM_BOT_USERNAME,
} from '../../constants/telegram';
import { getErrorMessage, paymentApi, telegramApi, userApi } from '../../services/api';
import PaymentWebViewModal from '../../components/PaymentWebViewModal';
import { colors } from '../../theme';
import type { SubscriptionPlan, User } from '../../types/models';
import type { MainStackParamList, MainTabParamList } from '../../types/navigation';

interface PlanBadgeStyles {
  container: ViewStyle;
  text: TextStyle;
}

function getPlanBadgeStyle(plan: SubscriptionPlan): PlanBadgeStyles {
  switch (plan) {
    case 'VIP':
      return { container: styles.badgeVip, text: styles.badgeVipText };
    case 'PRO':
      return { container: styles.badgePro, text: styles.badgeProText };
    default:
      return { container: styles.badgeFree, text: styles.badgeFreeText };
  }
}

interface ComparisonPlanCardProps {
  plan: SubscriptionPlan;
  currentPlan: SubscriptionPlan;
  isUpgrading: boolean;
  onUpgrade: (plan: 'PRO' | 'VIP') => void;
}

function ComparisonPlanCard({
  plan,
  currentPlan,
  isUpgrading,
  onUpgrade,
}: ComparisonPlanCardProps): React.JSX.Element {
  const definition = PLAN_DEFINITIONS[plan];
  const isCurrent = currentPlan === plan;
  const planRank: Record<SubscriptionPlan, number> = { FREE: 0, PRO: 1, VIP: 2 };
  const isLowerOrEqual = planRank[currentPlan] >= planRank[plan];

  return (
    <View
      style={[
        styles.planCard,
        plan === 'VIP' && styles.planCardVip,
        plan === 'PRO' && styles.planCardPro,
        isCurrent && styles.planCardCurrent,
      ]}
    >
      <View style={styles.planCardHeader}>
        <Text style={styles.planTitle}>{definition.title}</Text>
        {isCurrent ? <Text style={styles.currentPill}>Mevcut</Text> : null}
      </View>
      <Text style={styles.planPrice}>{definition.priceLabel}</Text>
      <Text style={styles.planDescription}>{definition.tagline}</Text>

      <View style={styles.featureList}>
        {definition.features.map((feature) => (
          <Text key={feature} style={styles.featureItem}>
            • {feature}
          </Text>
        ))}
      </View>

      {plan === 'FREE' ? (
        <View style={styles.freeNote}>
          <Text style={styles.freeNoteText}>Varsayılan başlangıç paketi</Text>
        </View>
      ) : (
        <Pressable
          style={[
            styles.upgradeButton,
            (isLowerOrEqual || isUpgrading) && styles.buttonDisabled,
          ]}
          onPress={() => onUpgrade(plan)}
          disabled={isLowerOrEqual || isUpgrading}
        >
          {isUpgrading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.upgradeButtonText}>
              {isCurrent ? 'Mevcut Paket' : 'Hemen Yükselt'}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

export default function ProfileScreen(): React.JSX.Element {
  const navigation =
    useNavigation<
      CompositeNavigationProp<
        BottomTabNavigationProp<MainTabParamList, 'Profile'>,
        NativeStackNavigationProp<MainStackParamList>
      >
    >();
  const { user, setUser, signOut } = useAuth();
  const [profile, setProfile] = useState<User | null>(user);
  const [isLoading, setIsLoading] = useState<boolean>(!user);
  const [upgradingPlan, setUpgradingPlan] = useState<'PRO' | 'VIP' | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string>(
    TELEGRAM_BOT_USERNAME,
  );
  const [isTelegramModalVisible, setIsTelegramModalVisible] = useState<boolean>(false);
  const [isLinkingTelegram, setIsLinkingTelegram] = useState<boolean>(false);
  const [paymentWebViewVisible, setPaymentWebViewVisible] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | undefined>();
  const [paymentHtml, setPaymentHtml] = useState<string | undefined>();
  const [pendingPaymentPlan, setPendingPaymentPlan] = useState<'PRO' | 'VIP' | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const config = await telegramApi.getConfig();
        if (config.botUsername) {
          setTelegramBotUsername(config.botUsername);
        }
      } catch {
        // Keep fallback username from constants.
      }
    })();
  }, []);

  const loadProfile = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const data = await userApi.getProfile();
      setProfile(data);
      setUser(data);
    } catch (error) {
      Alert.alert(
        'Profil yüklenemedi',
        getErrorMessage(
          error,
          'Kullanıcı bilgileri alınırken bir hata oluştu. Lütfen tekrar deneyin.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [setUser]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const handleUpgrade = (plan: 'PRO' | 'VIP'): void => {
    Alert.alert(
      'Ödeme Yöntemi Seçin',
      `${PLAN_DEFINITIONS[plan].title} paketine (${PLAN_DEFINITIONS[plan].priceLabel}) yükseltmek için ödeme yönteminizi seçin.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Apple / Google Pay',
          onPress: () => {
            void (async () => {
              setUpgradingPlan(plan);
              try {
                const updated = await userApi.upgradeSubscription({ plan });
                setProfile(updated);
                setUser(updated);
                Alert.alert(
                  'Başarılı',
                  `${PLAN_DEFINITIONS[plan].title} paketine yükseltildiniz.`,
                );
              } catch (error) {
                Alert.alert(
                  'Yükseltme başarısız',
                  getErrorMessage(error, 'Abonelik güncellenemedi. Lütfen tekrar deneyin.'),
                );
              } finally {
                setUpgradingPlan(null);
              }
            })();
          },
        },
        {
          text: 'Kredi / Banka Kartı',
          onPress: () => { void handlePayWithCard(plan); },
        },
      ],
    );
  };

  const handlePayWithCard = async (plan: 'PRO' | 'VIP'): Promise<void> => {
    try {
      setPendingPaymentPlan(plan);
      const session = await paymentApi.createCheckoutSession(plan);
      setPaymentUrl(session.paymentUrl);
      setPaymentHtml(session.paymentHtml);
      setPaymentWebViewVisible(true);
    } catch (error) {
      Alert.alert(
        'Ödeme başlatılamadı',
        getErrorMessage(error, 'Lütfen tekrar deneyin.'),
      );
      setPendingPaymentPlan(null);
    }
  };

  const handlePaymentSuccess = async (): Promise<void> => {
    setPaymentWebViewVisible(false);
    setPaymentUrl(undefined);
    setPaymentHtml(undefined);
    Alert.alert('Başarılı', 'Ödemeniz alındı. Paketiniz güncelleniyor...');
    await loadProfile();
    setPendingPaymentPlan(null);
  };

  const handlePaymentCancel = (): void => {
    setPaymentWebViewVisible(false);
    setPaymentUrl(undefined);
    setPaymentHtml(undefined);
    setPendingPaymentPlan(null);
  };

  const openTelegramLinkModal = (): void => {
    setIsTelegramModalVisible(true);
  };

  const closeTelegramLinkModal = (): void => {
    if (!isLinkingTelegram) {
      setIsTelegramModalVisible(false);
    }
  };

  const handleConnectTelegram = async (): Promise<void> => {
    if (!profile?.id) {
      Alert.alert('Hata', 'Kullanıcı bilgisi bulunamadı.');
      return;
    }

    const deepLink = buildTelegramDeepLink(telegramBotUsername, profile.id);
    setIsLinkingTelegram(true);

    try {
      const canOpen = await Linking.canOpenURL(deepLink);
      if (!canOpen) {
        Alert.alert('Telegram açılamadı', 'Telegram uygulamasının yüklü olduğundan emin olun.');
        return;
      }

      await Linking.openURL(deepLink);
      setIsTelegramModalVisible(false);

      setTimeout(() => {
        void loadProfile();
      }, 4000);
    } catch (error) {
      Alert.alert(
        'Bağlantı başarısız',
        getErrorMessage(error, 'Telegram deep link açılamadı.'),
      );
    } finally {
      setIsLinkingTelegram(false);
    }
  };

  const handleLogout = (): void => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istiyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setIsLoggingOut(true);
            try {
              await signOut();
            } catch (error) {
              Alert.alert(
                'Çıkış başarısız',
                getErrorMessage(error, 'Çıkış yapılırken bir hata oluştu.'),
              );
            } finally {
              setIsLoggingOut(false);
            }
          })();
        },
      },
    ]);
  };

  if (isLoading && !profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF7A00" />
        <Text style={styles.loadingText}>Profil yükleniyor...</Text>
      </View>
    );
  }

  const currentPlan: SubscriptionPlan = profile?.subscriptionPlan ?? 'FREE';
  const badgeStyles = getPlanBadgeStyle(currentPlan);
  const isTelegramLinked = Boolean(profile?.telegramChatId?.trim());

  return (
    <>
    <SafeAreaView style={styles.container} edges={['top']}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <Image source={require('../../../assets/icon.png')} style={styles.avatar} />
        <Text style={styles.fullName}>{profile?.fullName ?? 'Kullanıcı'}</Text>
        <Text style={styles.phone}>{profile?.phone ?? '—'}</Text>
        <View style={[styles.planBadge, badgeStyles.container]}>
          <Text style={[styles.planBadgeText, badgeStyles.text]}>{currentPlan}</Text>
        </View>
      </View>

      {currentPlan === 'FREE' ? (
        <View style={styles.premiumCard}>
          <Text style={styles.premiumTitle}>Kuponiks Premium</Text>
          <Text style={styles.premiumSub}>
            Daha fazla arama görevi ve öncelikli bildirimler için paketinizi yükseltin.
          </Text>
        </View>
      ) : null}

      <View style={styles.menu}>
        <Pressable
          style={styles.menuRow}
          onPress={() =>
            navigation.navigate('AccountInfo', {
              fullName: profile?.fullName ?? '',
              phone: profile?.phone ?? '',
              plan: currentPlan,
            })
          }
        >
          <GlyphIcon name="person-circle" size={20} color={colors.white} />
          <Text style={styles.menuText}>Hesap Bilgileri</Text>
          <GlyphIcon name="chevron" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          style={styles.menuRow}
          onPress={() => navigation.navigate('NotificationPrefs')}
        >
          <GlyphIcon name="bell" size={20} color={colors.white} />
          <Text style={styles.menuText}>Bildirim Tercihleri</Text>
          <GlyphIcon name="chevron" size={16} color={colors.textMuted} />
        </Pressable>
        <View style={[styles.menuRow, styles.menuRowDisabled]}>
          <GlyphIcon name="devices" size={20} color={colors.textMuted} />
          <Text style={[styles.menuText, styles.menuTextDisabled]}>Bağlı Cihazlar</Text>
          <View style={styles.soonBadge}>
            <Text style={styles.soonBadgeText}>Yakında</Text>
          </View>
        </View>
        <Pressable
          style={styles.menuRow}
          onPress={() => navigation.navigate('HelpSupport')}
        >
          <GlyphIcon name="help" size={20} color={colors.white} />
          <Text style={styles.menuText}>Yardım & Destek</Text>
          <GlyphIcon name="chevron" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          style={styles.menuRow}
          onPress={() => navigation.navigate('About')}
        >
          <GlyphIcon name="info" size={20} color={colors.white} />
          <Text style={styles.menuText}>Hakkımızda</Text>
          <GlyphIcon name="chevron" size={16} color={colors.textMuted} />
        </Pressable>
      </View>


      <View style={styles.telegramCard}>
        <Text style={styles.sectionTitle}>Telegram Bildirimleri</Text>
        <Text style={styles.sectionSubtitle}>
          PRO ve VIP paketlerde kelepir ilan bildirimlerini Telegram üzerinden alın.
        </Text>

        {isTelegramLinked ? (
          <View style={styles.telegramLinkedBadge}>
            <Text style={styles.telegramLinkedText}>Telegram bağlı</Text>
          </View>
        ) : (
          <Pressable style={styles.telegramConnectButton} onPress={openTelegramLinkModal}>
            <Text style={styles.telegramConnectButtonText}>Telegram Hesabını Bağla</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.sectionTitle}>Paket Karşılaştırması</Text>
      <Text style={styles.sectionSubtitle}>
        Ücretsiz, Standart (PRO) ve Sınırsız (VIP) paketler arasında seçim yapın.
      </Text>

      <View style={styles.comparisonTable}>
        <View style={styles.comparisonHeaderRow}>
          <Text style={[styles.comparisonHeaderCell, styles.comparisonFeatureCol]}>
            Özellik
          </Text>
          <Text style={styles.comparisonHeaderCell}>Ücretsiz</Text>
          <Text style={styles.comparisonHeaderCell}>PRO</Text>
          <Text style={styles.comparisonHeaderCell}>VIP</Text>
        </View>
        {PLAN_COMPARISON_ROWS.map((row) => (
          <View key={row.label} style={styles.comparisonRow}>
            <Text style={[styles.comparisonCell, styles.comparisonFeatureCol]}>
              {row.label}
            </Text>
            <Text style={styles.comparisonCell}>{row.free}</Text>
            <Text style={styles.comparisonCell}>{row.pro}</Text>
            <Text style={styles.comparisonCell}>{row.vip}</Text>
          </View>
        ))}
      </View>

      {(['FREE', 'PRO', 'VIP'] as SubscriptionPlan[]).map((plan) => (
        <ComparisonPlanCard
          key={plan}
          plan={plan}
          currentPlan={currentPlan}
          isUpgrading={upgradingPlan === plan}
          onUpgrade={handleUpgrade}
        />
      ))}

      <Pressable
        style={[styles.logoutButton, isLoggingOut && styles.buttonDisabled]}
        onPress={handleLogout}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.logoutButtonText}>Çıkış Yap</Text>
        )}
      </Pressable>

      <Modal
        visible={isTelegramModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeTelegramLinkModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Telegram Hesabını Bağla</Text>
            <Text style={styles.modalBody}>
              Telegram uygulamasında botu açın ve Başlat&apos;a dokunun. Bot hesabınızı
              otomatik eşleştirecek ve onay mesajı gönderecektir.
            </Text>
            <Text style={styles.modalHint}>
              Bot: @{telegramBotUsername.replace(/^@/, '')}
            </Text>
            <TouchableOpacity
              style={[styles.modalPrimaryButton, isLinkingTelegram && styles.buttonDisabled]}
              onPress={() => {
                void handleConnectTelegram();
              }}
              disabled={isLinkingTelegram}
              activeOpacity={0.85}
            >
              {isLinkingTelegram ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>Telegram&apos;da Aç</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={closeTelegramLinkModal}
              disabled={isLinkingTelegram}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSecondaryButtonText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </SafeAreaView>

    <PaymentWebViewModal
      visible={paymentWebViewVisible}
      paymentUrl={paymentUrl}
      paymentHtml={paymentHtml}
      onSuccess={() => { void handlePaymentSuccess(); }}
      onCancel={handlePaymentCancel}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 8,
  },
  premiumCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  premiumTitle: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  premiumSub: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 48,
  },
  menuRowDisabled: {
    opacity: 0.7,
  },
  menuText: {
    flex: 1,
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  menuTextDisabled: {
    color: colors.textMuted,
  },
  soonBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  soonBadgeText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666688',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fullName: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  phone: {
    marginTop: 6,
    fontSize: 15,
    color: '#A0A0C0',
  },
  planBadge: {
    marginTop: 16,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  planBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  badgeFree: {
    backgroundColor: '#2A164D',
  },
  badgeFreeText: {
    color: '#A0A0C0',
  },
  badgePro: {
    backgroundColor: '#3D1E6D',
  },
  badgeProText: {
    color: '#FF7A00',
  },
  badgeVip: {
    backgroundColor: '#3D1E6D',
  },
  badgeVipText: {
    color: '#FF7A00',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 14,
    color: '#A0A0C0',
    lineHeight: 20,
  },
  telegramCard: {
    backgroundColor: '#1A0836',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A164D',
    marginBottom: 20,
  },
  telegramLinkedBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#3D1E6D',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#8A2BE2',
  },
  telegramLinkedText: {
    color: '#FF7A00',
    fontSize: 14,
    fontWeight: '700',
  },
  telegramConnectButton: {
    marginTop: 4,
    backgroundColor: '#FF7A00',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  telegramConnectButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1A0836',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#2A164D',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalBody: {
    marginTop: 10,
    fontSize: 14,
    color: '#A0A0C0',
    lineHeight: 21,
  },
  modalHint: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#FF7A00',
  },
  modalPrimaryButton: {
    marginTop: 18,
    backgroundColor: '#FF7A00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  modalSecondaryButton: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(42, 22, 77, 0.85)',
    borderRadius: 12,
  },
  modalSecondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  comparisonTable: {
    backgroundColor: '#1A0836',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A164D',
    marginBottom: 16,
    overflow: 'hidden',
  },
  comparisonHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#240D47',
    borderBottomWidth: 1,
    borderBottomColor: '#2A164D',
  },
  comparisonRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#12022B',
  },
  comparisonHeaderCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: '800',
    color: '#A0A0C0',
    textAlign: 'center',
  },
  comparisonCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 12,
    color: '#A0A0C0',
    textAlign: 'center',
  },
  comparisonFeatureCol: {
    flex: 1.4,
    textAlign: 'left',
  },
  planCard: {
    backgroundColor: '#1A0836',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A164D',
    marginBottom: 12,
  },
  planCardPro: {
    borderColor: '#8A2BE2',
  },
  planCardVip: {
    borderColor: '#FF7A00',
    backgroundColor: '#1A0836',
  },
  planCardCurrent: {
    borderWidth: 2,
    borderColor: '#FF7A00',
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  currentPill: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF7A00',
    backgroundColor: '#3D1E6D',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  planPrice: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: '#FF7A00',
  },
  planDescription: {
    marginTop: 8,
    fontSize: 14,
    color: '#A0A0C0',
    lineHeight: 20,
  },
  featureList: {
    marginTop: 12,
    gap: 4,
  },
  featureItem: {
    fontSize: 14,
    color: '#A0A0C0',
    lineHeight: 20,
  },
  freeNote: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#240D47',
    borderRadius: 10,
  },
  freeNoteText: {
    fontSize: 13,
    color: '#A0A0C0',
    fontWeight: '600',
  },
  upgradeButton: {
    marginTop: 14,
    backgroundColor: '#FF7A00',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  logoutButton: {
    marginTop: 18,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
