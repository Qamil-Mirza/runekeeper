export interface IntegrationNodeDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "active" | "setup-required" | "coming-soon";
  color: string;
  angle: number; // degrees, 0 = top
}

export interface IntegrationConfig {
  enabled: boolean;
  config: {
    monitoredSenders: string[];
    autoCreateTasks: boolean;
    pubsubSubscriptionActive: boolean;
  };
  lastSyncAt: string | null;
  lastSyncError: string | null;
  watchExpiration: string | null;
}
