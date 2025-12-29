import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";
import { useRealtimeVoice } from "@/hooks/useRealtimeVoice";
import { VoiceVisualizer } from "./VoiceVisualizer";

interface RealtimeVoiceInterfaceProps {
  voice?: string;
  onTranscript?: (text: string, role: "user" | "assistant") => void;
}

export const RealtimeVoiceInterface = ({
  voice = "alloy",
  onTranscript,
}: RealtimeVoiceInterfaceProps) => {
  const {
    isConnected,
    isConnecting,
    isSpeaking,
    startConversation,
    endConversation,
    transcript,
  } = useRealtimeVoice({
    voice,
    onTranscript,
  });

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Voice Visualizer */}
      <VoiceVisualizer isListening={isConnected && !isSpeaking} isSpeaking={isSpeaking} />

      {/* Current Transcript */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-md text-center"
          >
            <p className="text-sm text-muted-foreground italic">"{transcript}"</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control Buttons */}
      <div className="flex items-center gap-4">
        {!isConnected ? (
          <motion.button
            onClick={startConversation}
            disabled={isConnecting}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative w-20 h-20 rounded-full flex items-center justify-center bg-primary hover:bg-primary/90 text-primary-foreground glow-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isConnecting ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
            
            {/* Pulsing ring when connecting */}
            {isConnecting && (
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-primary"
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </motion.button>
        ) : (
          <motion.button
            onClick={endConversation}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-20 h-20 rounded-full flex items-center justify-center bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-all"
          >
            <PhoneOff className="w-8 h-8" />
          </motion.button>
        )}
      </div>

      {/* Status Label */}
      <motion.p
        className="text-xs font-display uppercase tracking-wider text-muted-foreground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {isConnecting
          ? "Connecting..."
          : isConnected
          ? isSpeaking
            ? "NOVA is speaking..."
            : "Listening..."
          : "Tap to start voice chat"}
      </motion.p>

      {/* Connection indicator */}
      {isConnected && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30"
        >
          <motion.div
            className="w-2 h-2 rounded-full bg-green-400"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-xs text-green-400 font-medium">Live</span>
        </motion.div>
      )}
    </div>
  );
};
