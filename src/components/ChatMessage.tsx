import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

export const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ role, content, timestamp }, ref) => {
    const isUser = role === "user";

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-secondary border border-border"
            : "bg-primary/20 border border-primary/50 glow-primary"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-primary" />
        )}
      </div>

      {/* Message bubble */}
      <div
        className={`max-w-[80%] ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? "bg-secondary border border-border rounded-br-sm"
              : "glass-surface rounded-bl-sm border-primary/30"
          }`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    </motion.div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";
