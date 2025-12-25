import { motion } from "framer-motion";
import { FileText, AlertCircle, ShoppingCart, HelpCircle } from "lucide-react";

interface QuickActionsProps {
  onAction: (action: string) => void;
}

const actions = [
  {
    icon: FileText,
    label: "Knowledge Articles",
    query: "How many knowledge articles are there?",
    color: "from-cyan-500/20 to-blue-500/20",
  },
  {
    icon: AlertCircle,
    label: "View Incidents",
    query: "How many incidents are in the system?",
    color: "from-orange-500/20 to-red-500/20",
  },
  {
    icon: ShoppingCart,
    label: "Service Catalog",
    query: "Show me the service catalog items",
    color: "from-purple-500/20 to-pink-500/20",
  },
  {
    icon: HelpCircle,
    label: "Create Incident",
    query: "I want to create a new incident",
    color: "from-green-500/20 to-teal-500/20",
  },
];

export const QuickActions = ({ onAction }: QuickActionsProps) => {
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
    </div>
  );
};
