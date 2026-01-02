import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";

interface VoiceButtonProps {
  isSessionActive: boolean;
  isProcessing: boolean;
  onToggleSession: () => void;
}

export const VoiceButton = ({
  isSessionActive,
  isProcessing,
  onToggleSession,
}: VoiceButtonProps) => {
  return (
    <div className="relative">
      {/* Outer rings for active session */}
      {isSessionActive && (
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
        onClick={onToggleSession}
        disabled={isProcessing}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
          isSessionActive
            ? "bg-destructive glow-primary"
            : isProcessing
            ? "bg-muted cursor-not-allowed"
            : "bg-primary hover:bg-primary/90 glow-primary"
        }`}
      >
        {isSessionActive ? (
          <MicOff className="w-6 h-6 text-destructive-foreground" />
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
        {isSessionActive ? "Session active • Tap to end" : isProcessing ? "Processing..." : "Tap to start session"}
      </motion.p>
    </div>
  );
};
