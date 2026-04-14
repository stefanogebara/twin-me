import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Alert, Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import { sendChatMessage } from '../services/api';
import type { ChatMessage } from '../types';

const CHAT_HISTORY_KEY = 'twinme_chat_history';
const MAX_HISTORY = 60;

// ── Suggestions ───────────────────────────────────────────────────────────────

const SUGGESTION_GROUPS = [
  {
    label: 'Personality',
    suggestions: [
      'What kind of person am I?',
      'What motivates me?',
      'What are my core values?',
    ],
  },
  {
    label: 'Patterns',
    suggestions: [
      'How do I spend my time?',
      'What are my daily habits?',
      'When am I most productive?',
    ],
  },
  {
    label: 'Music & culture',
    suggestions: [
      'What music do I like?',
      'What content do I consume?',
      'What are my aesthetic preferences?',
    ],
  },
  {
    label: 'Social',
    suggestions: [
      'How do I communicate?',
      'What kind of relationships do I have?',
      'How do I show up for people?',
    ],
  },
  {
    label: 'Goals',
    suggestions: [
      'What should I focus on this week?',
      'What am I working toward?',
      'What holds me back?',
    ],
  },
];

// ── Thinking indicator ────────────────────────────────────────────────────────

const THINKING_LABELS = [
  'Searching your memories...',
  'Connecting the patterns...',
  'Thinking as you...',
  'Almost there...',
];

function TypingIndicator() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  const [labelIdx, setLabelIdx] = useState(0);

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 350, useNativeDriver: true }),
          Animated.delay((dots.length - i - 1) * 150),
        ]),
      ),
    );
    anims.forEach(a => a.start());
    const interval = setInterval(() => {
      setLabelIdx(i => (i + 1) % THINKING_LABELS.length);
    }, 2200);
    return () => {
      anims.forEach(a => a.stop());
      clearInterval(interval);
    };
  }, []);

  return (
    <View style={styles.bubbleRow}>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        <Text style={styles.thinkingLabel}>{THINKING_LABELS[labelIdx]}</Text>
        <View style={styles.dotsRow}>
          {dots.map((dot, i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: dot }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isTyping,
}: {
  message: ChatMessage;
  isTyping?: boolean;
}) {
  const isUser = message.role === 'user';

  if (!isUser && isTyping && !message.content) {
    return <TypingIndicator />;
  }

  const handleLongPress = useCallback(() => {
    if (!message.content) return;
    Share.share({ message: message.content }).catch(() => {/* non-critical */});
  }, [message.content]);

  return (
    <TouchableOpacity
      style={[styles.bubbleRow, isUser && styles.bubbleRowRight]}
      onLongPress={handleLongPress}
      delayLongPress={400}
      activeOpacity={1}
    >
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
          {message.content}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function TwinChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [activeSuggestionGroup, setActiveSuggestionGroup] = useState(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const streamingIdRef = useRef<string | null>(null);

  // ── Persist / load history ─────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(CHAT_HISTORY_KEY)
      .then(raw => {
        if (raw) {
          const parsed: ChatMessage[] = JSON.parse(raw);
          setMessages(parsed.slice(-MAX_HISTORY));
        }
      })
      .catch(() => {/* non-critical */})
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    // Don't save if we're in the middle of streaming (incomplete message)
    if (streaming) return;
    AsyncStorage.setItem(
      CHAT_HISTORY_KEY,
      JSON.stringify(messages.slice(-MAX_HISTORY)),
    ).catch(() => {/* non-critical */});
  }, [messages, streaming, historyLoaded]);

  // ── Clear conversation ─────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    Alert.alert(
      'Clear conversation',
      'Remove all messages? Your twin still remembers everything from your history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setMessages([]);
            AsyncStorage.removeItem(CHAT_HISTORY_KEY).catch(() => {});
          },
        },
      ],
    );
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || streaming) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    };
    const assistantId = (Date.now() + 1).toString();
    streamingIdRef.current = assistantId;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    try {
      await sendChatMessage(msg, (chunk) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m,
          ),
        );
        listRef.current?.scrollToEnd({ animated: false });
      });
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: 'Sorry, something went wrong. Try again.' }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
      streamingIdRef.current = null;
    }
  }, [input, streaming]);

  // ── Empty state ────────────────────────────────────────────────────────────

  const currentGroup = SUGGESTION_GROUPS[activeSuggestionGroup];

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Image
        source={require('../../assets/flower-hero.png')}
        style={styles.emptyLogo}
        resizeMode="contain"
      />
      <Text style={styles.emptyTitle}>Talk to your twin</Text>
      <Text style={styles.emptySubtitle}>
        Ask anything — it knows your patterns, preferences, and personality.
      </Text>

      {/* Category tabs */}
      <View style={styles.categoryTabs}>
        {SUGGESTION_GROUPS.map((group, idx) => (
          <TouchableOpacity
            key={group.label}
            style={[styles.categoryTab, activeSuggestionGroup === idx && styles.categoryTabActive]}
            onPress={() => setActiveSuggestionGroup(idx)}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryTabText, activeSuggestionGroup === idx && styles.categoryTabTextActive]}>
              {group.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Suggestions for active category */}
      <View style={styles.suggestionsCol}>
        {currentGroup.suggestions.map(q => (
          <TouchableOpacity
            key={q}
            style={styles.suggestion}
            onPress={() => send(q)}
            activeOpacity={0.7}
          >
            <Text style={styles.suggestionText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      {/* Header actions */}
      {messages.length > 0 && (
        <View style={styles.chatHeader}>
          <Text style={styles.chatHeaderTitle}>Your twin</Text>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            activeOpacity={0.7}
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isTyping={streaming && item.id === streamingIdRef.current}
          />
        )}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={messages.length === 0 ? styles.emptyContainer : styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message your twin..."
          placeholderTextColor="#B5B0A8"
          multiline
          maxLength={500}
          onSubmitEditing={() => send()}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
          onPress={() => send()}
          disabled={!input.trim() || streaming}
          activeOpacity={0.8}
        >
          {streaming
            ? <ActivityIndicator color={COLORS.primaryFg} size="small" />
            : <Text style={styles.sendIcon}>↑</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Chat header (when messages exist)
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.inputBorder,
  },
  chatHeaderTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: COLORS.textMuted,
    letterSpacing: 0.2,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  clearBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  emptyLogo: { width: 52, height: 52, marginBottom: 18 },
  emptyTitle: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 26,
    color: COLORS.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },

  // Category tabs
  categoryTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    backgroundColor: 'transparent',
  },
  categoryTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryTabText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
  },
  categoryTabTextActive: {
    color: COLORS.primaryFg,
  },

  // Suggestions
  suggestionsCol: { width: '100%', gap: 8 },
  suggestion: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  suggestionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },

  // Messages
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { marginBottom: 12, flexDirection: 'row' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    padding: 12,
    paddingHorizontal: 16,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  bubbleTextUser: { color: COLORS.primaryFg },

  // Typing indicator
  typingBubble: { paddingVertical: 14, paddingHorizontal: 18, gap: 8 },
  thinkingLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: COLORS.textMuted,
    letterSpacing: 0.2,
  },
  dotsRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.textMuted,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.inputBorder,
    backgroundColor: COLORS.background,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 9999,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.text,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 9999,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sendBtnDisabled: { opacity: 0.35 },
  sendIcon: {
    color: COLORS.primaryFg,
    fontSize: 18,
    fontWeight: '700',
  },
});
