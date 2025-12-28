import { motion } from "framer-motion";
import { Check, Settings, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Connector } from "@/types/connector";
import { connectorIcons } from "@/components/ConnectorIcons";

interface ConnectorCardProps {
  connector: Connector;
  onConnect: (connector: Connector) => void;
  onDisconnect: (connectorId: string) => void;
  onConfigure: (connector: Connector) => void;
}

export const ConnectorCard = ({
  connector,
  onConnect,
  onDisconnect,
  onConfigure,
}: ConnectorCardProps) => {
  const IconComponent = connectorIcons[connector.id];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className={`relative p-4 rounded-xl border transition-all ${
        connector.isConnected
          ? "bg-primary/5 border-primary/30"
          : "bg-card/50 border-border/50 hover:border-primary/30"
      }`}
    >
      {connector.isConnected && (
        <div className="absolute top-2 right-2">
          <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-primary rounded-full text-xs font-medium">
            <Check className="w-3 h-3" />
            Connected
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
          {IconComponent ? (
            <IconComponent className="w-8 h-8" />
          ) : (
            <span className="text-3xl">{connector.icon}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {connector.name}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {connector.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        {connector.isConnected ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onConfigure(connector)}
            >
              <Settings className="w-4 h-4 mr-1" />
              Configure
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDisconnect(connector.id)}
            >
              <Unplug className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => onConnect(connector)}
          >
            Connect
          </Button>
        )}
      </div>
    </motion.div>
  );
};
