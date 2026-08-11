import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { PLAN_DEFINITIONS } from '../constants/planFeatures';

interface UpgradeModalProps {
  visible: boolean;
  targetPlan: 'PRO' | 'VIP';
  reason?: 'filter-limit' | 'telegram' | 'whatsapp';
  onUpgrade: () => void;
  onClose: () => void;
  /** Called when user chooses card payment (Sanal POS). */
  onPayWithCard?: () => void;
}

function getReasonCopy(
  targetPlan: 'PRO' | 'VIP',
  reason: UpgradeModalProps['reason'],
): string {
  if (reason === 'telegram') {
    return 'Telegram bildirimleri PRO veya VIP paketlerde kullanılabilir.';
  }
  if (reason === 'whatsapp') {
    return 'WhatsApp bildirimleri yalnızca VIP pakette kullanılabilir.';
  }
  if (reason === 'filter-limit') {
    return targetPlan === 'VIP'
      ? 'PRO paketinizde en fazla 10 aktif alarm kullanabilirsiniz. Sınırsız alarm için VIP pakete geçin.'
      : 'Ücretsiz planda yalnızca 1 aktif alarm kullanabilirsiniz. Daha fazlası için PRO pakete geçin.';
  }

  return `${PLAN_DEFINITIONS[targetPlan].title} paketi ile daha fazla özelliğe erişin.`;
}

export default function UpgradeModal({
  visible,
  targetPlan,
  reason = 'filter-limit',
  onUpgrade,
  onClose,
  onPayWithCard,
}: UpgradeModalProps): React.JSX.Element {
  const plan = PLAN_DEFINITIONS[targetPlan];

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={[styles.badge, targetPlan === 'VIP' ? styles.badgeVip : styles.badgePro]}>
            {targetPlan}
          </Text>
          <Text style={styles.title}>
            {targetPlan === 'VIP' ? "VIP'ye Yükselt" : "PRO'ya Yükselt"}
          </Text>
          <Text style={styles.body}>{getReasonCopy(targetPlan, reason)}</Text>

          <View style={styles.features}>
            {plan.features.map((feature) => (
              <Text key={feature} style={styles.feature}>
                • {feature}
              </Text>
            ))}
          </View>

          <Text style={styles.price}>{plan.priceLabel}</Text>

          <TouchableOpacity style={styles.primaryButton} onPress={onUpgrade} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>
              Apple / Google Pay ile Öde
            </Text>
          </TouchableOpacity>

          {onPayWithCard && (
            <TouchableOpacity style={styles.cardButton} onPress={onPayWithCard} activeOpacity={0.85}>
              <Text style={styles.cardButtonText}>
                Kredi / Banka Kartı ile Öde
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.secondaryButtonText}>Şimdilik Vazgeç</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 2, 43, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1A0836',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#2A164D',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#3D1E6D',
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#FF7A00',
  },
  badgePro: {
    backgroundColor: '#3D1E6D',
    color: '#FF7A00',
  },
  badgeVip: {
    backgroundColor: '#3D1E6D',
    color: '#FF7A00',
  },
  title: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    color: '#A0A0C0',
    lineHeight: 21,
  },
  features: {
    marginTop: 16,
    gap: 6,
  },
  feature: {
    fontSize: 14,
    color: '#A0A0C0',
    lineHeight: 20,
  },
  price: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '800',
    color: '#FF7A00',
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: '#FF7A00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  cardButton: {
    marginTop: 10,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#8A2BE2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cardButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(42, 22, 77, 0.7)',
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
