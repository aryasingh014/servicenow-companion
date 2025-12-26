import { motion } from "framer-motion";
import { Search, FolderOpen, MessageSquare, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuickActionsProps {
  onAction: (action: string) => void;
}

const actions = [
  {
    icon: Search,
    label: "Search Data",
    query: "What information can you help me find?",
    color: "from-cyan-500/20 to-blue-500/20",
  },
  {
    icon: FolderOpen,
    label: "Browse Files",
    query: "Show me my recent files and documents",
    color: "from-orange-500/20 to-red-500/20",
  },
  {
    icon: MessageSquare,
    label: "Ask Question",
    query: "What can you help me with today?",
    color: "from-purple-500/20 to-pink-500/20",
  },
];

export const QuickActions = ({ onAction }: QuickActionsProps) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action, index) => (
        <motion.button
          key={action.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          onClick={() => onAction(action.query)}
          className={`group relative p-4 rounded-xl glass-surface border border-border/50 hover:border-primary/50 transition-all duration-300`}
        >
          <div
            className={`absolute inset-0 rounded-xl bg-gradient-to-br ${action.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
          />
          <div className="relative flex items-center gap-3">
            <action.icon className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">{action.label}</span>
          </div>
        </motion.button>
      ))}
      
      {/* Connect Sources Button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        onClick={() => navigate("/settings")}
        className="group relative p-4 rounded-xl glass-surface border border-border/50 hover:border-primary/50 transition-all duration-300"
      >
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-green-500/20 to-teal-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="relative flex items-center gap-3">
          <Settings className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">Connect Sources</span>
        </div>
      </motion.button>
    </div>
  );
};
