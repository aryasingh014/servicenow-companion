import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, CheckCircle2, Sparkles, Link2, Volume2, Plug, Database } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ConnectorCard } from "@/components/ConnectorCard";
import { ConnectorConfigDialog } from "@/components/ConnectorConfigDialog";
import { VoiceCloneSettings } from "@/components/VoiceCloneSettings";
import { connectors as defaultConnectors, connectorCategories } from "@/data/connectors";
import { Connector } from "@/types/connector";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceCloneTTS } from "@/hooks/useVoiceCloneTTS";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentsManager } from "@/components/DocumentsManager";
import { 
  fetchUserConnectors, 
  saveConnector, 
  disconnectConnector,
  UserConnector 
} from "@/services/connectorService";
import { useAuth } from "@/hooks/useAuth";

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [connectorList, setConnectorList] = useState<Connector[]>(defaultConnectors);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("connectors");
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  
  // Voice settings
  const { voiceSettings, setVoice, setPitch, setRate, setCustomVoice, availableVoices, speak, isSpeaking } = useVoiceCloneTTS();
  const [userConnectors, setUserConnectors] = useState<UserConnector[]>([]);

  // Load user connectors from database
  const loadUserConnectors = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    
    try {
      const connectors = await fetchUserConnectors();
      setUserConnectors(connectors);
      
      // Update connector list with connected status
      setConnectorList(prev => 
        prev.map(connector => {
          const userConnector = connectors.find(c => c.connector_id === connector.id);
          return {
            ...connector,
            isConnected: userConnector?.status === 'connected'
          };
        })
      );
    } catch (error) {
      console.error("Error loading connectors:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load connectors on mount and when user changes
  useEffect(() => {
    loadUserConnectors();
  }, [user]);

  // Handle OAuth callback for Google Drive, Email, and Calendar
  useEffect(() => {
    const connectorParam = searchParams.get('connector');
    const validConnectors = ['google-drive', 'email', 'calendar'];
    if (!connectorParam || !validConnectors.includes(connectorParam)) return;
    if (!user) return; // Need to be logged in

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

      // Save to database instead of localStorage
      const result = await saveConnector(
        connectorParam,
        { email },
        { access_token: accessToken }
      );

      if (!result.success) {
        toast({
          title: "Failed to save connection",
          description: result.error || "Please try again.",
          variant: 'destructive',
        });
        return;
      }

      // Reload connectors from database
      await loadUserConnectors();

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
  }, [searchParams, navigate, user]);

  const handleConnect = (connector: Connector) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to connect data sources.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }
    setSelectedConnector(connector);
    setDialogOpen(true);
  };

  const handleDisconnect = async (connectorId: string) => {
    const connector = connectorList.find((c) => c.id === connectorId);
    
    const result = await disconnectConnector(connectorId);
    
    if (result.success) {
      // Reload connectors from database
      await loadUserConnectors();
      
      toast({
        title: "Disconnected",
        description: `${connector?.name || "Connector"} has been disconnected.`,
      });
    } else {
      toast({
        title: "Failed to disconnect",
        description: result.error || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleConfigure = (connector: Connector) => {
    setSelectedConnector(connector);
    setDialogOpen(true);
  };

  const handleSaveConfig = async (connectorId: string, config: Record<string, string>) => {
    const connector = connectorList.find((c) => c.id === connectorId);
    
    // Save to database
    const result = await saveConnector(connectorId, config);
    
    if (result.success) {
      // Reload connectors from database
      await loadUserConnectors();
      
      toast({
        title: connector?.isConnected ? "Configuration Updated" : "Connected Successfully! 🎉",
        description: `${connector?.name} is now ready. Ask NOVA anything about your ${connector?.name} data!`,
      });
    } else {
      toast({
        title: "Failed to save",
        description: result.error || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const getExistingConfig = (connectorId: string): Record<string, string> | undefined => {
    const userConnector = userConnectors.find(c => c.connector_id === connectorId);
    if (!userConnector) return undefined;
    
    const config = { ...userConnector.config };
    // Include OAuth token in config for display purposes
    if (userConnector.oauth_tokens?.access_token) {
      config.accessToken = userConnector.oauth_tokens.access_token;
    }
    return config;
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
            <h1 className="text-xl font-display font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure your voice and data sources
            </p>
          </div>
        </div>
      </motion.header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="voice" className="flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              Voice
            </TabsTrigger>
            <TabsTrigger value="connectors" className="flex items-center gap-2">
              <Plug className="w-4 h-4" />
              Connectors
              {connectedCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {connectedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Documents
            </TabsTrigger>
          </TabsList>

          {/* Voice Settings Tab */}
          <TabsContent value="voice" className="space-y-6">
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
                onCustomVoiceChange={setCustomVoice}
                onTestVoice={() => speak("Hello! I'm your voice assistant. How can I help you today?")}
                isSpeaking={isSpeaking}
              />
            </motion.div>
          </TabsContent>

          {/* Connectors Tab */}
          <TabsContent value="connectors" className="space-y-8">
            {/* Not logged in warning */}
            {!user && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-center">
                  <p className="text-amber-600 dark:text-amber-400">
                    Please <button onClick={() => navigate("/auth")} className="underline font-medium">sign in</button> to connect and manage your data sources.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Connected Sources Summary */}
            <AnimatePresence>
              {connectedCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
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
              {connectedCount === 0 && user && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
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

            {/* Loading state */}
            {isLoading && (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}

            {/* Connector Categories */}
            {!isLoading && connectorCategories.map((category, categoryIndex) => {
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

            {!isLoading && filteredConnectors.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No connectors found matching "{searchQuery}"
                </p>
              </div>
            )}
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <DocumentsManager />
          </TabsContent>
        </Tabs>
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
