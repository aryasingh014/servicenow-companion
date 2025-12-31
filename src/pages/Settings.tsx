import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, CheckCircle2, Sparkles, Link2, Volume2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ConnectorCard } from "@/components/ConnectorCard";
import { ConnectorConfigDialog } from "@/components/ConnectorConfigDialog";
import { VoiceCloneSettings } from "@/components/VoiceCloneSettings";
import { connectors as defaultConnectors, connectorCategories } from "@/data/connectors";
import { Connector, ConnectorConfig } from "@/types/connector";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceCloneTTS } from "@/hooks/useVoiceCloneTTS";

const STORAGE_KEY = "connected-sources";

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [connectorList, setConnectorList] = useState<Connector[]>(defaultConnectors);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Voice settings
  const { voiceSettings, setVoice, setPitch, setRate, availableVoices, speak, isSpeaking } = useVoiceCloneTTS();
  const [connectedConfigs, setConnectedConfigs] = useState<ConnectorConfig[]>([]);

  // Handle OAuth callback for Google Drive, Email, and Calendar
  useEffect(() => {
    const connectorParam = searchParams.get('connector');
    const validConnectors = ['google-drive', 'email', 'calendar'];
    if (!connectorParam || !validConnectors.includes(connectorParam)) return;

    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.provider_token;
      const email = session?.user?.email || '';

      if (!accessToken) {
        const displayName = connectorParam === 'email' ? 'Email' : connectorParam === 'calendar' ? 'Calendar' : 'Google Drive';
        toast({
          title: `${displayName} connection incomplete`,
          description: 'Could not get an access token. Please try connecting again.',
          variant: 'destructive',
        });
        return;
      }

      // Quick verification based on connector type
      const { data: testData, error: testError } = await supabase.functions.invoke('connector-api', {
        body: {
          connector: connectorParam,
          action: 'testConnection',
          config: { accessToken },
        },
      });

      const testOk = !testError && (testData as { success?: boolean })?.success === true;
      if (!testOk) {
        const reason = testError?.message || (testData as { error?: string })?.error || 'API request failed';
        const displayName = connectorParam === 'email' ? 'Email' : connectorParam === 'calendar' ? 'Calendar' : 'Google Drive';
        toast({
          title: `${displayName} connected, but access failed`,
          description: `${reason}. If you're seeing a 403 error, you may be signed into a different Google account.`,
          variant: 'destructive',
        });
        return;
      }

      if (cancelled) return;

      const newConfig: ConnectorConfig = {
        connectorId: connectorParam,
        config: {
          accessToken,
          email,
        },
        connectedAt: new Date().toISOString(),
      };

      // Save to connected configs
      const saved = localStorage.getItem(STORAGE_KEY);
      let configs: ConnectorConfig[] = saved ? JSON.parse(saved) : [];
      const existingIndex = configs.findIndex(c => c.connectorId === connectorParam);

      if (existingIndex >= 0) {
        configs[existingIndex] = newConfig;
      } else {
        configs.push(newConfig);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
      setConnectedConfigs(configs);

      // Update connector status
      setConnectorList((prev) =>
        prev.map((c) => (c.id === connectorParam ? { ...c, isConnected: true } : c))
      );

      const displayNames: Record<string, string> = {
        'email': 'Email (Gmail)',
        'calendar': 'Google Calendar',
        'google-drive': 'Google Drive',
      };
      const descriptions: Record<string, string> = {
        'email': `Connected as ${email}. You can now index your emails for AI search.`,
        'calendar': `Connected as ${email}. You can now search your calendar events.`,
        'google-drive': `Connected as ${email}. You can now ask NOVA to search your Drive files.`,
      };

      toast({
        title: `${displayNames[connectorParam]} connected`,
        description: descriptions[connectorParam],
      });

      // Clean up URL
      navigate('/settings', { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  // Load connected configs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      let configs: ConnectorConfig[] = JSON.parse(saved);
      
      // Clean up any OAuth connectors that have invalid config (clientId/clientSecret instead of accessToken)
      const oauthConnectorIds = ['google-drive', 'email', 'calendar'];
      let hasInvalidConfig = false;
      
      configs = configs.filter((cfg) => {
        if (oauthConnectorIds.includes(cfg.connectorId)) {
          // OAuth connectors MUST have accessToken, not clientId/clientSecret
          if (!cfg.config?.accessToken && (cfg.config?.clientId || cfg.config?.clientSecret)) {
            console.warn(`Removing invalid OAuth config for ${cfg.connectorId} - has clientId/clientSecret instead of accessToken`);
            hasInvalidConfig = true;
            return false; // Remove this invalid config
          }
        }
        return true;
      });
      
      // Save cleaned config if we removed any invalid entries
      if (hasInvalidConfig) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
      }
      
      setConnectedConfigs(configs);

      // Update connector list with connected status.
      // For OAuth connectors, only treat as "connected" if we have a usable accessToken.
      setConnectorList((prev) =>
        prev.map((connector) => {
          const cfg = configs.find((c) => c.connectorId === connector.id);
          const hasConfig = Boolean(cfg);
          const hasOAuthToken = Boolean(cfg?.config?.accessToken);

          const isConnected = connector.useOAuth ? hasOAuthToken : hasConfig;
          return { ...connector, isConnected };
        })
      );
    } catch (e) {
      console.error("Error parsing saved connectors:", e);
    }
  }, []);

  const handleConnect = (connector: Connector) => {
    setSelectedConnector(connector);
    setDialogOpen(true);
  };

  const handleDisconnect = (connectorId: string) => {
    const connector = connectorList.find((c) => c.id === connectorId);
    
    // Update local state
    const newConfigs = connectedConfigs.filter((c) => c.connectorId !== connectorId);
    setConnectedConfigs(newConfigs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfigs));
    
    setConnectorList((prev) =>
      prev.map((c) => (c.id === connectorId ? { ...c, isConnected: false } : c))
    );
    
    toast({
      title: "Disconnected",
      description: `${connector?.name || "Connector"} has been disconnected.`,
    });
  };

  const handleConfigure = (connector: Connector) => {
    setSelectedConnector(connector);
    setDialogOpen(true);
  };

  const handleSaveConfig = async (connectorId: string, config: Record<string, string>) => {
    const connector = connectorList.find((c) => c.id === connectorId);
    
    // Create new config
    const newConfig: ConnectorConfig = {
      connectorId,
      config,
      connectedAt: new Date().toISOString(),
    };
    
    // Update configs
    const existingIndex = connectedConfigs.findIndex((c) => c.connectorId === connectorId);
    let newConfigs: ConnectorConfig[];
    
    if (existingIndex >= 0) {
      newConfigs = [...connectedConfigs];
      newConfigs[existingIndex] = newConfig;
    } else {
      newConfigs = [...connectedConfigs, newConfig];
    }
    
    setConnectedConfigs(newConfigs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfigs));
    
    // Update connector status
    setConnectorList((prev) =>
      prev.map((c) => (c.id === connectorId ? { ...c, isConnected: true } : c))
    );
    
    toast({
      title: connector?.isConnected ? "Configuration Updated" : "Connected Successfully! 🎉",
      description: `${connector?.name} is now ready. Ask NOVA anything about your ${connector?.name} data!`,
    });
  };

  const getExistingConfig = (connectorId: string) => {
    const config = connectedConfigs.find((c) => c.connectorId === connectorId);
    return config?.config;
  };

  const filteredConnectors = connectorList.filter(
    (connector) =>
      connector.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      connector.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const connectedConnectors = connectorList.filter((c) => c.isConnected);
  const connectedCount = connectedConnectors.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 glass-surface border-b border-border/50 px-6 py-4"
      >
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-display font-semibold">Data Sources</h1>
            <p className="text-sm text-muted-foreground">
              Connect your tools to unlock AI-powered insights
            </p>
          </div>
        </div>
      </motion.header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Voice Settings */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <VoiceCloneSettings
            voiceSettings={voiceSettings}
            availableVoices={availableVoices}
            onVoiceChange={setVoice}
            onPitchChange={setPitch}
            onRateChange={setRate}
            onTestVoice={() => speak("Hello! I'm your ServiceNow voice assistant. How can I help you today?")}
            isSpeaking={isSpeaking}
          />
        </motion.div>
        {/* Connected Sources Summary */}
        <AnimatePresence>
          {connectedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8"
            >
              <div className="rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Your Connected Sources</h2>
                    <p className="text-sm text-muted-foreground">
                      NOVA can now search and answer questions from these sources
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {connectedConnectors.map((connector) => (
                    <Badge
                      key={connector.id}
                      variant="secondary"
                      className="gap-1.5 py-1.5 px-3 bg-background/50"
                    >
                      <span>{connector.icon}</span>
                      {connector.name}
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    </Badge>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Getting Started Banner (when no sources connected) */}
        <AnimatePresence>
          {connectedCount === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-8"
            >
              <div className="rounded-xl bg-gradient-to-br from-secondary/80 to-secondary/40 border border-border p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <Link2 className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-2">Connect Your First Source</h2>
                <p className="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
                  Choose a data source below to get started. Once connected, you can ask NOVA 
                  questions about your data - no coding required!
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search connectors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </motion.div>

        {/* Connector Categories */}
        {connectorCategories.map((category, categoryIndex) => {
          const categoryConnectors = filteredConnectors.filter(
            (c) => c.category === category.id
          );

          if (categoryConnectors.length === 0) return null;

          return (
            <motion.section
              key={category.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: categoryIndex * 0.1 }}
              className="mb-10"
            >
              <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
                <span>{category.icon}</span>
                {category.name}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryConnectors.map((connector) => (
                  <ConnectorCard
                    key={connector.id}
                    connector={connector}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onConfigure={handleConfigure}
                  />
                ))}
              </div>
            </motion.section>
          );
        })}

        {filteredConnectors.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No connectors found matching "{searchQuery}"
            </p>
          </div>
        )}
      </main>

      {/* Config Dialog */}
      <ConnectorConfigDialog
        connector={selectedConnector}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSaveConfig}
        existingConfig={selectedConnector ? getExistingConfig(selectedConnector.id) : undefined}
      />
    </div>
  );
}
