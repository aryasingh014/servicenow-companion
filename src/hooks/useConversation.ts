import { useState, useCallback } from "react";
import { Message, ConversationContext } from "@/types/chat";

interface UseConversationReturn {
  messages: Message[];
  context: ConversationContext;
  addMessage: (role: "user" | "assistant", content: string) => void;
  updateContext: (updates: Partial<ConversationContext>) => void;
  clearMessages: () => void;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
}

export const useConversation = (): UseConversationReturn => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm your ServiceNow voice assistant. I can help you with knowledge articles, incidents, and the service catalog. How can I assist you today?",
      timestamp: new Date(),
    },
  ]);
  const [context, setContext] = useState<ConversationContext>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    const newMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  }, []);

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
  }, []);

  return {
    messages,
    context,
    addMessage,
    updateContext,
    clearMessages,
    isProcessing,
    setIsProcessing,
  };
};
