import { motion } from "framer-motion";

interface VoiceVisualizerProps {
  isListening: boolean;
  isSpeaking: boolean;
}

export const VoiceVisualizer = ({ isListening, isSpeaking }: VoiceVisualizerProps) => {
  const bars = 12;
  const isActive = isListening || isSpeaking;

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer glow ring */}
      <motion.div
        className="absolute w-48 h-48 rounded-full border-2 border-primary/30"
        animate={{
          scale: isActive ? [1, 1.1, 1] : 1,
          opacity: isActive ? [0.3, 0.6, 0.3] : 0.2,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Middle ring */}
      <motion.div
        className="absolute w-40 h-40 rounded-full border border-primary/50"
        animate={{
          scale: isActive ? [1, 1.05, 1] : 1,
          opacity: isActive ? [0.5, 0.8, 0.5] : 0.3,
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.2,
        }}
      />

      {/* Core circle with glow */}
      <motion.div
        className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${
          isActive ? "glow-primary" : ""
        }`}
        style={{
          background: `radial-gradient(circle at center, hsl(var(--primary) / ${isActive ? 0.3 : 0.1}) 0%, transparent 70%)`,
        }}
        animate={{
          scale: isActive ? [1, 1.02, 1] : 1,
        }}
        transition={{
          duration: 0.5,
          repeat: isActive ? Infinity : 0,
          ease: "easeInOut",
        }}
      >
        {/* Voice bars */}
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: bars }).map((_, i) => (
            <motion.div
              key={i}
              className="w-1 rounded-full bg-primary"
              animate={{
                height: isActive
                  ? [8, Math.random() * 32 + 16, 8]
                  : 8,
                opacity: isActive ? [0.5, 1, 0.5] : 0.3,
              }}
              transition={{
                duration: 0.3 + Math.random() * 0.3,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.05,
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Status indicator */}
      <motion.div
        className="absolute -bottom-8 flex items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <motion.div
          className={`w-2 h-2 rounded-full ${
            isListening
              ? "bg-green-400"
              : isSpeaking
              ? "bg-primary"
              : "bg-muted-foreground"
          }`}
          animate={{
            scale: isActive ? [1, 1.2, 1] : 1,
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
          }}
        />
        <span className="text-xs font-display uppercase tracking-wider text-muted-foreground">
          {isListening ? "Listening" : isSpeaking ? "Speaking" : "Ready"}
        </span>
      </motion.div>
    </div>
  );
};
