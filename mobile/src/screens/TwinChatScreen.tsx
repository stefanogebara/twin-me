import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../constants';
import { sendChatMessage } from '../services/api';
import type { ChatMessage } from '../types';

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
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
            m.id === assistantId
              ? { ...m, content: m.content + chunk }
              : m,
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
          {['What music do I like?', 'How do I spend my time?', 'What motivates me?'].map(q => (
            <TouchableOpacity key={q} style={styles.suggestion} onPress={() => setInput(q)}>
              <Text style={styles.suggestionText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message your twin..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={500}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!input.trim() || streaming}
        >
          {streaming
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.sendIcon}>↑</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 24,
  },
  emptyLogo: {
    width: 72,
    height: 72,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Halant_600SemiBold',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  suggestion: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginBottom: 8,
    backgroundColor: COLORS.card,
  },
  suggestionText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: COLORS.text,
  },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { marginBottom: 12, flexDirection: 'row' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    padding: 12,
    paddingHorizontal: 15,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: COLORS.text,
    lineHeight: 22,
  },
  bubbleTextUser: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    fontSize: 15,
    color: COLORS.text,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
