import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated,
} from 'react-native';
import { COLORS } from '../constants';
import { sendChatMessage } from '../services/api';
import type { ChatMessage } from '../types';

const SUGGESTIONS = [
  'What music do I like?',
  'How do I spend my time?',
  'What motivates me?',
];

const THINKING_LABELS = [
  'Searching your memories...',
  'Connecting the patterns...',
  'Thinking as you...',
  'Almost there...',
];

function TypingIndicator() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
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

function MessageBubble({ message, isTyping }: { message: ChatMessage; isTyping?: boolean }) {
  const isUser = message.role === 'user';

  if (!isUser && isTyping && !message.content) {
    return <TypingIndicator />;
  }

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowRight]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

export function TwinChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const streamingIdRef = useRef<string | null>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
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
      await sendChatMessage(text, (chunk) => {
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
    }
  }, [input, streaming]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      {/* Empty state */}
      {messages.length === 0 && (
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
          <View style={styles.suggestionsRow}>
            {SUGGESTIONS.map(q => (
              <TouchableOpacity
                key={q}
                style={styles.suggestion}
                onPress={() => setInput(q)}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestionText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
        contentContainerStyle={styles.messageList}
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
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
          onPress={send}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 52,
    paddingBottom: 24,
  },
  emptyLogo: { width: 64, height: 64, marginBottom: 20 },
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
  suggestionsRow: { alignItems: 'center', gap: 8 },
  suggestion: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  suggestionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.text,
  },

  // Messages
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { marginBottom: 12, flexDirection: 'row' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
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
