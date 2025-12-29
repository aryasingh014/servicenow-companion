import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Trash2, Volume2, VolumeX, CheckCircle2, AlertCircle, Loader2, Radio } from "lucide-react";
import { Header } from "@/components/Header";
import { VoiceVisualizer } from "@/components/VoiceVisualizer";
import { VoiceButton } from "@/components/VoiceButton";
import { ChatMessage } from "@/components/ChatMessage";
import { QuickActions } from "@/components/QuickActions";
import { VoiceSelector } from "@/components/VoiceSelector";
import { RealtimeVoiceInterface } from "@/components/RealtimeVoiceInterface";
import { useVoiceRecognition } from "@/hooks/useVoiceRecognition";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useConversation } from "@/hooks/useConversation";
import { streamChat } from "@/services/chatService";
import { getConnectedSources } from "@/services/connectorService";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [inputText, setInputText] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [realtimeMode, setRealtimeMode] = useState(false);
  const [connectedSources, setConnectedSources] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    messages,
    addMessage,
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

  const { 
    isSpeaking, 
    speak, 
    stop: stopSpeaking, 
    isSupported: ttsSupported,
    isLoading: ttsLoading,
    selectedVoice,
    setSelectedVoice,
    customVoices,
    addCustomVoice,
  } = useTextToSpeech();

  // Check connected sources on mount
  useEffect(() => {
    const sources = getConnectedSources();
    setConnectedSources(sources.map(s => s.name));
  }, []);

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

      let assistantResponse = "";

      try {
        // Convert messages to the format expected by the API
        const chatMessages = messages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content }));
        chatMessages.push({ role: "user" as const, content: message });

        await streamChat({
          messages: chatMessages,
          onDelta: (chunk) => {
            assistantResponse += chunk;
            // Update or add the assistant message
            const existingMessages = messages;
            const lastMessage = existingMessages[existingMessages.length - 1];
            if (lastMessage?.role === "assistant" && lastMessage.id.startsWith("streaming-")) {
              // This is handled by state update in addMessage
            }
          },
          onDone: () => {
            addMessage("assistant", assistantResponse);
            setIsProcessing(false);

            // Speak the response if voice is enabled
            if (voiceEnabled && ttsSupported && assistantResponse) {
              speak(assistantResponse.replace(/\*\*/g, "").replace(/•/g, "").replace(/\n/g, " "));
            }
          },
          onError: (error) => {
            console.error("Chat error:", error);
            addMessage("assistant", "I apologize, but I encountered an error processing your request. Please try again.");
            setIsProcessing(false);
            toast({
              variant: "destructive",
              title: "Error",
              description: error.message,
            });
          },
        });
      } catch (error) {
        console.error("Error:", error);
        addMessage("assistant", "I apologize, but I encountered an error. Please try again.");
        setIsProcessing(false);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to process your request.",
        });
      }
    },
    [messages, addMessage, setIsProcessing, voiceEnabled, speak, ttsSupported, toast]
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

  const handleRealtimeTranscript = useCallback((text: string, role: "user" | "assistant") => {
    addMessage(role, text);
  }, [addMessage]);

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

      {/* Connection Status */}
      <div className="absolute top-20 right-6 z-10">
        <Badge
          variant={connectedSources.length > 0 ? "default" : "secondary"}
          className="flex items-center gap-1.5 cursor-pointer"
          onClick={() => navigate("/settings")}
        >
          {connectedSources.length > 0 ? (
            <>
              <CheckCircle2 className="w-3 h-3" />
              <span>{connectedSources.length} source{connectedSources.length !== 1 ? 's' : ''} connected</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3 h-3" />
              <span>No sources connected</span>
            </>
          )}
        </Badge>
      </div>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Voice Interface */}
        <motion.section
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full lg:w-1/3 p-6 flex flex-col items-center justify-center border-r border-border/30"
        >
          <div className="flex flex-col items-center gap-8">
            {/* Realtime Mode Toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
              <Label htmlFor="realtime-mode" className="text-sm text-muted-foreground flex items-center gap-2">
                <Radio className="w-4 h-4" />
                Realtime Voice
              </Label>
              <Switch
                id="realtime-mode"
                checked={realtimeMode}
                onCheckedChange={setRealtimeMode}
              />
            </div>

            {realtimeMode ? (
              <RealtimeVoiceInterface
                voice="alloy"
                onTranscript={handleRealtimeTranscript}
              />
            ) : (
              <>
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
              </>
            )}

            {/* Voice controls - only show when not in realtime mode */}
            {!realtimeMode && (
              <div className="flex items-center gap-4 mt-4">
                <motion.button
                  onClick={handleVoiceToggle}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {voiceEnabled ? (
                    <>
                      <Volume2 className="w-4 h-4" />
                      <span>On</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4" />
                      <span>Off</span>
                    </>
                  )}
                </motion.button>

                {voiceEnabled && (
                  <VoiceSelector
                    selectedVoice={selectedVoice}
                    onVoiceChange={setSelectedVoice}
                    customVoices={customVoices}
                    onAddCustomVoice={addCustomVoice}
                  />
                )}

                {ttsLoading && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading voice...</span>
                  </div>
                )}
              </div>
            )}

            {/* Connected Sources */}
            {connectedSources.length > 0 && (
              <div className="w-full mt-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Connected sources:</p>
                <div className="flex flex-wrap gap-1">
                  {connectedSources.map((name) => (
                    <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                  ))}
                </div>
              </div>
            )}
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
                <span className="text-sm">Connecting to ServiceNow...</span>
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
