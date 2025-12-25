import { motion } from "framer-motion";
import { Mic, MicOff, Square } from "lucide-react";

interface VoiceButtonProps {
  isListening: boolean;
  isProcessing: boolean;
  onClick: () => void;
  onStop: () => void;
}

export const VoiceButton = ({
  isListening,
  isProcessing,
  onClick,
  onStop,
}: VoiceButtonProps) => {
  return (
    <div className="relative">
      {/* Outer rings for active state */}
      {isListening && (
        <>
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary/30"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary/30"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
          />
        </>
      )}

      <motion.button
        onClick={isListening ? onStop : onClick}
        disabled={isProcessing}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
          isListening
            ? "bg-destructive glow-primary"
            : isProcessing
            ? "bg-muted cursor-not-allowed"
            : "bg-primary hover:bg-primary/90 glow-primary"
        }`}
      >
        {isListening ? (
          <Square className="w-6 h-6 text-destructive-foreground" />
        ) : isProcessing ? (
          <motion.div
            className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        ) : (
          <Mic className="w-6 h-6 text-primary-foreground" />
        )}
      </motion.button>

      {/* Label */}
      <motion.p
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-display uppercase tracking-wider text-muted-foreground whitespace-nowrap"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {isListening ? "Tap to stop" : isProcessing ? "Processing..." : "Tap to speak"}
      </motion.p>
    </div>
  );
};
