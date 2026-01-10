import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Settings, Unplug, RefreshCw, CheckCircle, XCircle, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Connector } from "@/types/connector";
import { connectorIcons } from "@/components/ConnectorIcons";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getConnectorConfig } from "@/services/connectorService";

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
  const [isTesting, setIsTesting] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();
  const IconComponent = connectorIcons[connector.id];

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestStatus('idle');
    
    try {
      const config = await getConnectorConfig(connector.id);
      
      // For OAuth connectors (google-drive, email, calendar), check for accessToken
      const oauthConnectors = ['google-drive', 'email', 'calendar'];
      if (oauthConnectors.includes(connector.id)) {
        if (!config?.accessToken) {
          throw new Error('Please reconnect with Google OAuth to get an access token.');
        }
      } else if (!config) {
        throw new Error('No configuration found. Please configure the connector first.');
      }

      const { data, error } = await supabase.functions.invoke('connector-api', {
        body: {
          connector: connector.id,
          action: 'testConnection',
          config,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setTestStatus('success');
      toast({
        title: "Connection successful",
        description: `${connector.name} is working correctly.`,
      });
    } catch (err: unknown) {
      setTestStatus('error');
      const message = err instanceof Error ? err.message : 'Connection test failed';
      toast({
        title: "Connection failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  };

  const handleIndexEmails = async () => {
    setIsIndexing(true);
    
    try {
      const config = await getConnectorConfig(connector.id);
      if (!config) {
        throw new Error('No configuration found');
      }

      toast({
        title: "Indexing emails...",
        description: "Fetching and indexing your latest emails for AI search.",
      });

      const { data, error } = await supabase.functions.invoke('connector-api', {
        body: {
          connector: 'email',
          action: 'indexEmails',
          config,
          params: { limit: 50 },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = data?.data as { indexed?: number; skipped?: number; errors?: number; message?: string } | undefined;
      toast({
        title: "Emails indexed! 🎉",
        description: result?.message || `${result?.indexed || 0} emails are now searchable by NOVA.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to index emails';
      toast({
        title: "Indexing failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsIndexing(false);
    }
  };

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

      <div className="flex flex-col gap-2 mt-4">
        {connector.isConnected ? (
          <>
            <div className="flex items-center gap-2">
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
            </div>
            
            {/* Email-specific: Index Emails button */}
            {connector.id === 'email' && (
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={handleIndexEmails}
                disabled={isIndexing}
              >
                {isIndexing ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-1" />
                )}
                {isIndexing ? 'Indexing...' : 'Index Emails'}
              </Button>
            )}
            
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : testStatus === 'success' ? (
                <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
              ) : testStatus === 'error' ? (
                <XCircle className="w-4 h-4 mr-1 text-destructive" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              {isTesting ? 'Testing...' : testStatus === 'success' ? 'Connected!' : testStatus === 'error' ? 'Failed' : 'Test Connection'}
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
