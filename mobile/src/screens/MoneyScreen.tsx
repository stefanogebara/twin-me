/**
 * MoneyScreen — mobile mirror of web MoneyPage
 * ==============================================
 * Surfaces the Financial-Emotional Twin on mobile:
 *   - Summary stats (outflow, stress shop count, ratio)
 *   - Risk forecast card (Renan's "before it happens")
 *   - Recent stress nudges feed
 *   - Bank connections list
 *   - In-app Pluggy Connect widget (WebView modal — no browser jump needed)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, Alert,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants';
import { authFetch } from '../services/api';
import type { User } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────

interface TransactionsSummary {
  window_days: number;
  transaction_count: number;
  total_outflow: number;
  total_inflow: number;
  stress_shop_count: number;
  stress_shop_total: number;
  emotional_spend_ratio: number | null;
  currencies?: Array<{ currency: string; outflow: number; inflow: number; count: number; stress_shop_total: number }>;
}

interface BankConnection {
  id: string;
  provider?: 'pluggy' | 'truelayer';
  connector_name: string;
  status: string;
  last_synced_at: string | null;
}

interface RiskForecast {
  status: 'high_risk' | 'low_risk' | 'no_history' | 'no_biology' | 'insufficient_data';
  headline?: string;
  detail?: string;
  message?: string;
  expected_extra?: number;
}

interface NudgeRecent {
  id: string;
  title: string;
  body: string;
  amount: number;
  merchant: string;
  stress_score: number | null;
  followed: boolean | null;
  checked: boolean;
  created_at: string;
}

interface NudgeStats {
  total_sent: number;
  checked_count: number;
  followed_count: number;
  est_saved: number;
  dominant_currency: string;
  recent?: NudgeRecent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency: string = 'BRL'): string {
  const locale = currency === 'BRL' ? 'pt-BR' : currency === 'EUR' ? 'es-ES' : currency === 'GBP' ? 'en-GB' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 2) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ── Screen ────────────────────────────────────────────────────────────────

export function MoneyScreen({ user: _user }: { user: User }) {
  const [summary, setSummary] = useState<TransactionsSummary | null>(null);
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [forecast, setForecast] = useState<RiskForecast | null>(null);
  const [nudgeStats, setNudgeStats] = useState<NudgeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [widgetVisible, setWidgetVisible] = useState(false);
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const loadAll = useCallback(async () => {
    try {
      const [sumRes, connRes, forecastRes, nudgeRes] = await Promise.all([
        authFetch('/transactions/summary').then(r => r.ok ? r.json() : null),
        authFetch('/transactions/pluggy/connections').then(r => r.ok ? r.json() : null),
        authFetch('/transactions/risk-forecast').then(r => r.ok ? r.json() : null),
        authFetch('/transactions/nudge-stats').then(r => r.ok ? r.json() : null),
      ]);

      if (sumRes?.success) {
        const { success: _, ...rest } = sumRes;
        setSummary(rest as TransactionsSummary);
      }
      setConnections(connRes?.connections ?? []);
      setForecast(forecastRes?.forecast ?? null);
      if (nudgeRes?.success) {
        const { success: _, ...rest } = nudgeRes;
        setNudgeStats(rest as NudgeStats);
      }
    } catch (err) {
      // Silent fail — UI degrades gracefully
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadAll();
  }, [loadAll]));

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onConnect = async (provider: 'br' | 'eu') => {
    if (provider === 'eu') {
      // TrueLayer uses a standard OAuth redirect — keep the external browser path
      try {
        const { Linking } = await import('react-native');
        await Linking.openURL('https://twinme.me/money?autoconnect=truelayer');
      } catch {
        Alert.alert('Erro', 'Não foi possível abrir o navegador');
      }
      return;
    }

    // Pluggy: fetch a short-lived connect token and open the hosted widget in-app
    try {
      const res = await authFetch('/transactions/pluggy/connect-token', { method: 'POST' });
      if (!res.ok) throw new Error('connect-token request failed');
      const { connectToken, environment } = await res.json() as { connectToken: string; environment: string };
      const includeSandbox = environment === 'sandbox' ? '&includeSandbox=true' : '';
      setWidgetUrl(`https://connect.pluggy.ai/?connect_token=${connectToken}${includeSandbox}`);
      setWidgetVisible(true);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível iniciar a conexão bancária');
    }
  };

  const onWidgetMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { event?: string; payload?: { itemId?: string } };
      if (msg.event === 'pluggyConnect/success' || msg.event === 'pluggyConnect/updateSuccess') {
        setWidgetVisible(false);
        loadAll(); // refresh connections list
      } else if (msg.event === 'pluggyConnect/close' || msg.event === 'pluggyConnect/error') {
        setWidgetVisible(false);
      }
    } catch {
      // non-JSON postMessage from the widget page — ignore
    }
  };

  const dominantCurrency = summary?.currencies?.[0]?.currency ?? 'BRL';

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadAll(); }}
          tintColor={COLORS.primary}
        />
      }
    >
      <Text style={styles.title}>Dinheiro</Text>
      <Text style={styles.subtitle}>Seu dinheiro tem sentimentos. A gente traduz.</Text>

      {/* Risk Forecast — high-visibility card */}
      {forecast && (forecast.status === 'high_risk' || forecast.status === 'low_risk') && (
        <View
          style={[
            styles.forecastCard,
            forecast.status === 'high_risk' ? styles.forecastHigh : styles.forecastLow,
          ]}
        >
          <Text style={styles.forecastHeadline}>{forecast.headline}</Text>
          <Text style={styles.forecastDetail}>{forecast.detail}</Text>
          {typeof forecast.expected_extra === 'number' && forecast.expected_extra > 0 && (
            <Text style={styles.forecastExtra}>
              +{formatCurrency(forecast.expected_extra, dominantCurrency)} esperado hoje
            </Text>
          )}
        </View>
      )}

      {/* Summary stats */}
      {summary && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Últimos {summary.window_days} dias</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatCurrency(summary.total_outflow, dominantCurrency)}</Text>
              <Text style={styles.statLabel}>Gasto</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{summary.stress_shop_count}</Text>
              <Text style={styles.statLabel}>Impulsivas</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {summary.emotional_spend_ratio !== null ? `${Math.round(summary.emotional_spend_ratio * 100)}%` : '—'}
              </Text>
              <Text style={styles.statLabel}>Emocional</Text>
            </View>
          </View>
          {summary.currencies && summary.currencies.length > 1 && (
            <View style={styles.currencyList}>
              {summary.currencies.map((c) => (
                <Text key={c.currency} style={styles.currencyLine}>
                  {c.currency}: {formatCurrency(c.outflow, c.currency)} em {c.count} lançamentos
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Nudge affirmation card */}
      {nudgeStats && nudgeStats.checked_count > 0 && (
        <View style={[styles.card, styles.nudgeCard]}>
          <Text style={styles.nudgeTitle}>
            Você seguiu {nudgeStats.followed_count} de {nudgeStats.checked_count} avisos
          </Text>
          <Text style={styles.nudgeBody}>
            Cerca de {formatCurrency(nudgeStats.est_saved, nudgeStats.dominant_currency)} pausados em gastos impulsivos.
          </Text>
        </View>
      )}

      {/* Recent nudges feed */}
      {nudgeStats?.recent && nudgeStats.recent.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Avisos recentes</Text>
          {nudgeStats.recent.slice(0, 5).map((n) => (
            <View key={n.id} style={styles.nudgeItem}>
              <View style={styles.nudgeRow}>
                <Text style={styles.nudgeMerchant}>{n.merchant}</Text>
                <Text style={styles.nudgeAmount}>{formatCurrency(Math.abs(n.amount), nudgeStats.dominant_currency)}</Text>
              </View>
              <View style={styles.nudgeMetaRow}>
                <Text style={styles.nudgeMeta}>
                  {n.stress_score !== null ? `stress ${Math.round(n.stress_score * 100)}%` : 'stress —'}
                </Text>
                <Text style={styles.nudgeMeta}>{timeAgo(n.created_at)}</Text>
              </View>
              {n.checked && (
                <Text style={[styles.outcomeChip, n.followed ? styles.outcomeFollowed : styles.outcomeProceeded]}>
                  {n.followed ? 'você parou' : 'continuou'}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Bank connections */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bancos conectados</Text>
        {connections.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum banco conectado ainda.</Text>
        ) : (
          connections.map((c) => (
            <View key={c.id} style={styles.connectionItem}>
              <View style={styles.connectionRow}>
                <Text style={styles.connectionName}>{c.connector_name}</Text>
                <Text style={[styles.connectionBadge, c.provider === 'truelayer' ? styles.badgeEU : styles.badgeBR]}>
                  {c.provider === 'truelayer' ? 'EU/UK' : 'BR'}
                </Text>
              </View>
              <Text style={styles.connectionMeta}>
                {c.status === 'UPDATED' ? 'sincronizado' : c.status.toLowerCase()}
                {c.last_synced_at ? ` · ${timeAgo(c.last_synced_at)}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Connect buttons */}
      <View style={styles.connectActions}>
        <TouchableOpacity style={styles.connectBtn} onPress={() => onConnect('br')} activeOpacity={0.85}>
          <Text style={styles.connectBtnText}>Conectar banco BR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.connectBtn, styles.connectBtnSecondary]} onPress={() => onConnect('eu')} activeOpacity={0.85}>
          <Text style={[styles.connectBtnText, styles.connectBtnTextSecondary]}>Conectar banco EU/UK</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* Pluggy Connect in-app widget */}
    <Modal
      visible={widgetVisible}
      animationType="slide"
      onRequestClose={() => setWidgetVisible(false)}
    >
      <View style={styles.webViewContainer}>
        <TouchableOpacity style={styles.webViewClose} onPress={() => setWidgetVisible(false)}>
          <Text style={styles.webViewCloseText}>Fechar</Text>
        </TouchableOpacity>
        {widgetUrl ? (
          <WebView
            ref={webViewRef}
            source={{ uri: widgetUrl }}
            onMessage={onWidgetMessage}
            javaScriptEnabled
            domStorageEnabled
            style={{ flex: 1 }}
          />
        ) : (
          <ActivityIndicator color={COLORS.primary} style={{ flex: 1 }} />
        )}
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },

  title: { fontSize: 32, fontFamily: 'InstrumentSerif_400Regular', color: COLORS.text, letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: COLORS.textMuted, marginBottom: 20 },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  forecastCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  forecastHigh: { backgroundColor: '#FFF4E5', borderColor: '#F59E0B' },
  forecastLow: { backgroundColor: '#F0FDF4', borderColor: '#10B981' },
  forecastHeadline: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: COLORS.text,
    marginBottom: 6,
  },
  forecastDetail: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: COLORS.text,
    lineHeight: 18,
  },
  forecastExtra: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: COLORS.textMuted,
  },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start', flex: 1 },
  statValue: {
    fontSize: 20,
    fontFamily: 'InstrumentSerif_400Regular',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  currencyList: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  currencyLine: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    marginBottom: 2,
  },

  nudgeCard: { backgroundColor: '#F0FDF4', borderColor: '#A7F3D0' },
  nudgeTitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: COLORS.text,
    marginBottom: 4,
  },
  nudgeBody: { fontSize: 12, fontFamily: 'Inter_400Regular', color: COLORS.textMuted },

  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },

  nudgeItem: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  nudgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nudgeMerchant: { fontSize: 14, fontFamily: 'Inter_500Medium', color: COLORS.text, flex: 1 },
  nudgeAmount: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: COLORS.text },
  nudgeMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  nudgeMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: COLORS.textMuted },
  outcomeChip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  outcomeFollowed: { backgroundColor: '#DCFCE7', color: '#166534' },
  outcomeProceeded: { backgroundColor: COLORS.border, color: COLORS.textMuted },

  connectionItem: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  connectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  connectionName: { fontSize: 14, fontFamily: 'Inter_500Medium', color: COLORS.text },
  connectionBadge: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  badgeBR: { backgroundColor: '#FEF3C7', color: '#92400E' },
  badgeEU: { backgroundColor: '#DBEAFE', color: '#1E40AF' },
  connectionMeta: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
  },

  connectActions: { marginTop: 16, gap: 8 },
  connectBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
  },
  connectBtnSecondary: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  connectBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: COLORS.primaryFg,
  },
  connectBtnTextSecondary: { color: COLORS.text },

  webViewContainer: { flex: 1, backgroundColor: COLORS.background },
  webViewClose: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  webViewCloseText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: COLORS.text,
  },
});
