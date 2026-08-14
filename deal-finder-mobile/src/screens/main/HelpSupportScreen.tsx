import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import GlyphIcon from '../../components/GlyphIcon';
import { colors, spacing } from '../../theme';
import type { MainStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<MainStackParamList, 'HelpSupport'>;

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'Kuponiks nasıl çalışır?',
    body: 'Arama görevlerinize uygun ilanlar tarayıcı platformlarından toplanır, piyasa medyanıyla karşılaştırılır ve fırsat skoru yüksek olanlar Fırsatlar ekranında listelenir.',
  },
  {
    title: 'Arama görevi nasıl oluşturulur?',
    body: 'Aramalarım sekmesinden yeni görev ekleyin. Kategori, marka, model ve isteğe bağlı fiyat/yıl/km kriterleri gelecekte hangi ilanların takip edileceğini belirler.',
  },
  {
    title: 'Fırsat skoru nedir?',
    body: 'İlanın fiyat avantajı, piyasa güveni ve emsal büyüklüğüne göre hesaplanan 0–100 arası bir skordur. Yüksek skor, ilanın piyasa medyanına göre daha avantajlı olduğunu gösterir.',
  },
  {
    title: 'Piyasa medyanı nedir?',
    body: 'Aynı segmentteki emsal ilanların orta fiyatıdır. Yeterli emsal yoksa medyan gösterilmez; uydurma piyasa değeri üretilmez.',
  },
  {
    title: 'Bildirimler nasıl çalışır?',
    body: 'Eşleşen bir fırsat bulunduğunda, arama görevinizde açık olan kanallara (push ve/veya Telegram) bildirim gider. Tercihler görev bazındadır.',
  },
  {
    title: 'İlan neden görünmeyebilir?',
    body: 'Görev kriterlerine uymuyorsa, henüz taranmadıysa, eşik skorun altındaysa veya piyasa analizi hazır değilse listede yer almayabilir.',
  },
];

export default function HelpSupportScreen({ navigation }: Props): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <GlyphIcon name="back" size={26} color={colors.white} />
        </Pressable>
        <Text style={styles.title}>Yardım & Destek</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.cardTitle}>{section.title}</Text>
            <Text style={styles.cardBody}>{section.body}</Text>
          </View>
        ))}
        <Text style={styles.support}>
          Destek iletişim kanalı yakında eklenecek.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 12,
  },
  headerSpacer: { width: 26 },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  body: { padding: spacing.lg, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { color: colors.white, fontWeight: '800', fontSize: 16 },
  cardBody: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  support: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
