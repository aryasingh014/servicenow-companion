import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { FileText, AlertCircle, ShoppingCart, RefreshCw, Database } from "lucide-react";
import { serviceNow } from "@/services/serviceNowService";
import { isConnectorConnected } from "@/services/connectorService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  articles: number;
  incidents: number;
  catalogItems: number;
}

export const ServiceNowDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const checkConnection = useCallback(async () => {
    const connected = await isConnectorConnected('servicenow');
    setIsConnected(connected);
    return connected;
  }, []);

  const fetchStats = useCallback(async (showRefresh = false) => {
    const connected = await checkConnection();
    if (!connected) {
      setLoading(false);
      return;
    }

    if (showRefresh) setIsRefreshing(true);
    try {
      const [articles, incidents, catalogItems] = await Promise.all([
        serviceNow.getArticleCount(),
        serviceNow.getIncidentCount(),
        serviceNow.getCatalogItemCount(),
      ]);
      setStats({ articles, incidents, catalogItems });
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch ServiceNow stats:", error);
      // Set stats to 0 on error - don't show mock data
      setStats({ articles: 0, incidents: 0, catalogItems: 0 });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [checkConnection]);

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 30 seconds if connected
    const interval = setInterval(() => {
      if (isConnected) fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStats, isConnected]);

  const handleManualRefresh = () => {
    fetchStats(true);
  };

  // If not connected, show a message instead of stats
  if (!isConnected && !loading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">ServiceNow Stats</h3>
        <Card className="border-border/50 bg-secondary/30">
          <CardContent className="p-4 flex flex-col items-center justify-center gap-2">
            <Database className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Connect ServiceNow in Settings to view live stats
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statCards = [
    {
      label: "Knowledge Articles",
      value: stats?.articles ?? 0,
      icon: FileText,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Incidents",
      value: stats?.incidents ?? 0,
      icon: AlertCircle,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Catalog Items",
      value: stats?.catalogItems ?? 0,
      icon: ShoppingCart,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">ServiceNow Stats</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="h-7 px-2 text-xs"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-border/50 bg-secondary/30">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-md ${stat.bgColor}`}>
                    <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {loading ? (
                      <Skeleton className="h-5 w-8" />
                    ) : (
                      <p className="text-lg font-bold leading-none">{stat.value}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {stat.label}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground text-center">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
};
