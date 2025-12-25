import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Trash2, Volume2, VolumeX } from "lucide-react";
import { Header } from "@/components/Header";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { VoiceButton } from "@/components/VoiceButton";
import { ChatMessage } from "@/components/ChatMessage";
import { QuickActions } from "@/components/QuickActions";
import { useVoiceRecognition } from "@/hooks/useVoiceRecognition";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useConversation } from "@/hooks/useConversation";
import { MockServiceNowService, processUserMessage } from "@/services/mockServiceNow";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const serviceNow = new MockServiceNowService();

const Index = () => {
  const [inputText, setInputText] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const {
    messages,
    context,
    addMessage,
    updateContext,
    clearMessages,
    isProcessing,
    setIsProcessing,
  } = useConversation();

  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    isSupported: voiceSupported,
  } = useVoiceRecognition();

  const { isSpeaking, speak, stop: stopSpeaking, isSupported: ttsSupported } = useTextToSpeech();

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle voice transcript
  useEffect(() => {
    if (transcript && !isListening) {
      handleUserMessage(transcript);
    }
  }, [transcript, isListening]);

  const handleUserMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      addMessage("user", message);
      setIsProcessing(true);

      try {
        const { response, contextUpdates } = await processUserMessage(
          message,
          context,
          serviceNow
        );

        addMessage("assistant", response);
        updateContext(contextUpdates);

        // Speak the response if voice is enabled
        if (voiceEnabled && ttsSupported) {
          speak(response.replace(/\*\*/g, "").replace(/•/g, ""));
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to process your request. Please try again.",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [context, addMessage, updateContext, setIsProcessing, voiceEnabled, speak, ttsSupported, toast]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      handleUserMessage(inputText);
      setInputText("");
    }
  };

  const handleQuickAction = (query: string) => {
    handleUserMessage(query);
  };

  const handleVoiceToggle = () => {
    if (isSpeaking) {
      stopSpeaking();
    }
    setVoiceEnabled(!voiceEnabled);
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-20 pointer-events-none" />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 0%, hsl(var(--primary) / 0.1) 0%, transparent 50%)",
        }}
      />

      <Header />

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Voice Interface */}
        <motion.section
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full lg:w-1/3 p-6 flex flex-col items-center justify-center border-r border-border/30"
        >
          <div className="flex flex-col items-center gap-8">
            <VoiceVisualizer isListening={isListening} isSpeaking={isSpeaking} />

            <div className="mt-8">
              <VoiceButton
                isListening={isListening}
                isProcessing={isProcessing}
                onClick={startListening}
                onStop={stopListening}
              />
            </div>

            {!voiceSupported && (
              <p className="text-xs text-muted-foreground text-center mt-4">
                Voice recognition not supported in this browser.
                <br />
                Please use Chrome or Edge for voice features.
              </p>
            )}

            <motion.button
              onClick={handleVoiceToggle}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-4"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {voiceEnabled ? (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Voice responses on</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4" />
                  <span>Voice responses off</span>
                </>
              )}
            </motion.button>
          </div>
        </motion.section>

        {/* Right Panel - Chat Interface */}
        <section className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <AnimatePresence mode="popLayout">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  timestamp={message.timestamp}
                />
              ))}
            </AnimatePresence>

            {isProcessing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 bg-primary rounded-full"
                      animate={{ y: [0, -8, 0] }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.1,
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm">Processing...</span>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length <= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-6 pb-4"
            >
              <p className="text-sm text-muted-foreground mb-3">Quick actions:</p>
              <QuickActions onAction={handleQuickAction} />
            </motion.div>
          )}

          {/* Input Area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 border-t border-border/30 glass-surface"
          >
            <form onSubmit={handleSubmit} className="flex gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearMessages}
                className="flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="w-5 h-5" />
              </Button>
              <Input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your message or use voice..."
                className="flex-1 bg-secondary/50 border-border/50 focus:border-primary/50"
                disabled={isProcessing}
              />
              <Button
                type="submit"
                disabled={!inputText.trim() || isProcessing}
                className="flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </Button>
            </form>
          </motion.div>
        </section>
      </main>
    </div>
  );
};

export default Index;
