import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Message, ConversationContext } from "@/types/chat";

interface UseConversationReturn {
  messages: Message[];
  context: ConversationContext;
  addMessage: (role: "user" | "assistant", content: string) => void;
  updateContext: (updates: Partial<ConversationContext>) => void;
  clearMessages: () => void;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  conversationId: string | null;
  loadConversation: (id: string, title: string, msgs: Message[]) => void;
  saveConversation: () => Promise<void>;
  startNewConversation: () => void;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hello! I'm NOVA, your universal AI assistant. How can I help you today?",
  timestamp: new Date(),
};

export const useConversation = (): UseConversationReturn => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [context, setContext] = useState<ConversationContext>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("New Conversation");

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    const newMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);

    // Auto-generate title from first user message
    if (role === "user" && messages.length <= 1) {
      const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
      setConversationTitle(title);
    }
  }, [messages.length]);

  const updateContext = useCallback((updates: Partial<ConversationContext>) => {
    setContext((prev) => ({ ...prev, ...updates }));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Conversation cleared. How can I help you?",
        timestamp: new Date(),
      },
    ]);
    setContext({});
    setConversationId(null);
    setConversationTitle("New Conversation");
  }, []);

  const loadConversation = useCallback((id: string, title: string, msgs: Message[]) => {
    setConversationId(id);
    setConversationTitle(title);
    setMessages(msgs.length > 0 ? msgs : [WELCOME_MESSAGE]);
    setContext({});
  }, []);

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setConversationTitle("New Conversation");
    setMessages([WELCOME_MESSAGE]);
    setContext({});
  }, []);

  // Save conversation to database
  const saveConversation = useCallback(async () => {
    if (!user) return;

    // Don't save if only welcome message
    if (messages.length <= 1 && messages[0]?.id === "welcome") return;

    const messagesJson = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    }));

    try {
      if (conversationId) {
        // Update existing conversation
        await supabase
          .from("conversations")
          .update({
            title: conversationTitle,
            messages: messagesJson,
          })
          .eq("id", conversationId);
      } else {
        // Create new conversation
        const { data, error } = await supabase
          .from("conversations")
          .insert({
            user_id: user.id,
            title: conversationTitle,
            messages: messagesJson,
          })
          .select("id")
          .single();

        if (!error && data) {
          setConversationId(data.id);
        }
      }
    } catch (error) {
      console.error("Failed to save conversation:", error);
    }
  }, [user, messages, conversationId, conversationTitle]);

  // Auto-save on message changes (debounced)
  useEffect(() => {
    if (!user || messages.length <= 1) return;

    const timer = setTimeout(() => {
      saveConversation();
    }, 2000);

    return () => clearTimeout(timer);
  }, [messages, user, saveConversation]);

  return {
    messages,
    context,
    addMessage,
    updateContext,
    clearMessages,
    isProcessing,
    setIsProcessing,
    conversationId,
    loadConversation,
    saveConversation,
    startNewConversation,
  };
};
