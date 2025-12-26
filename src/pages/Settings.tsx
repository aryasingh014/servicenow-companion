import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ConnectorCard } from "@/components/ConnectorCard";
import { ConnectorConfigDialog } from "@/components/ConnectorConfigDialog";
import { connectors as defaultConnectors, connectorCategories } from "@/data/connectors";
import { Connector, ConnectorConfig } from "@/types/connector";
import { toast } from "@/hooks/use-toast";

const STORAGE_KEY = "connected-sources";

export default function Settings() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [connectorList, setConnectorList] = useState<Connector[]>(defaultConnectors);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connectedConfigs, setConnectedConfigs] = useState<ConnectorConfig[]>([]);

  // Load connected configs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const configs: ConnectorConfig[] = JSON.parse(saved);
        setConnectedConfigs(configs);
        
        // Update connector list with connected status
        setConnectorList((prev) =>
          prev.map((connector) => ({
            ...connector,
            isConnected: configs.some((c) => c.connectorId === connector.id),
          }))
        );
      } catch (e) {
        console.error("Error parsing saved connectors:", e);
      }
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
      title: connector?.isConnected ? "Configuration Updated" : "Connected Successfully",
      description: `${connector?.name} is now ${connector?.isConnected ? "reconfigured" : "connected"} and ready to use.`,
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

  const connectedCount = connectorList.filter((c) => c.isConnected).length;

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
          <div>
            <h1 className="text-xl font-display font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              {connectedCount} connector{connectedCount !== 1 ? "s" : ""} connected
            </p>
          </div>
        </div>
      </motion.header>

      <main className="max-w-4xl mx-auto px-6 py-8">
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
