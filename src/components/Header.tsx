import { motion } from "framer-motion";
import { Settings, Info } from "lucide-react";

export const Header = () => {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between px-6 py-4 glass-surface border-b border-border/50"
    >
      <div className="flex items-center gap-3">
        {/* Logo */}
        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/50 flex items-center justify-center glow-primary">
          <span className="font-display font-bold text-primary text-lg">S</span>
          <motion.div
            className="absolute inset-0 rounded-xl border border-primary/30"
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.2, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </div>
        <div>
          <h1 className="font-display text-lg font-semibold tracking-wide">
            <span className="text-primary">Service</span>
            <span className="text-foreground">Now</span>
          </h1>
          <p className="text-xs text-muted-foreground">Voice Assistant</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
        >
          <Info className="w-5 h-5 text-muted-foreground" />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
        </motion.button>
      </div>
    </motion.header>
  );
};
