import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { FileText, CheckCircle, Clock, AlertTriangle, Upload, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

type Stats = {
  total: number;
  completed: number;
  processing: number;
  failed: number;
};

type RecentDoc = {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  created_at: string;
};

const docTypeLabels: Record<string, string> = {
  pet_ct_scan: "PET/CT Scan",
  imaging_report: "Imaging Report",
  referral_report: "Referral Report",
  prescription: "Prescription",
};

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle }> = {
  pending: { color: "text-warning", icon: Clock },
  processing: { color: "text-info", icon: Clock },
  completed: { color: "text-success", icon: CheckCircle },
  failed: { color: "text-destructive", icon: AlertTriangle },
};

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, processing: 0, failed: 0 });
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, filename, file_type, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (docs) {
        setRecentDocs(docs);
        const total = docs.length;
        // Get full count
        const { count: totalCount } = await supabase.from("documents").select("*", { count: "exact", head: true });
        const { count: completedCount } = await supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "completed");
        const { count: processingCount } = await supabase.from("documents").select("*", { count: "exact", head: true }).in("status", ["pending", "processing"]);
        const { count: failedCount } = await supabase.from("documents").select("*", { count: "exact", head: true }).eq("status", "failed");

        setStats({
          total: totalCount ?? 0,
          completed: completedCount ?? 0,
          processing: processingCount ?? 0,
          failed: failedCount ?? 0,
        });
      }
    };

    fetchData();
  }, [user]);

  const statCards = [
    { label: "Total Documents", value: stats.total, icon: FileText, color: "text-primary" },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-success" },
    { label: "Processing", value: stats.processing, icon: Clock, color: "text-info" },
    { label: "Failed", value: stats.failed, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Clinical document processing overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-xl p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p>
              </div>
              <stat.icon className={`h-8 w-8 ${stat.color} opacity-60`} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions + Recent */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upload Card */}
        <Link
          to="/upload"
          className="glass group flex items-center gap-4 rounded-xl p-6 transition-all hover:glow-border"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Upload Document</h3>
            <p className="text-xs text-muted-foreground">Process a new clinical document</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </Link>

        {/* Recent Documents */}
        <div className="glass rounded-xl p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Recent Documents</h3>
            <Link to="/documents" className="text-xs text-primary hover:underline">View all</Link>
          </div>

          {recentDocs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No documents yet. Upload your first document to get started.</p>
          ) : (
            <div className="space-y-2">
              {recentDocs.map((doc) => {
                const sc = statusConfig[doc.status] || statusConfig.pending;
                return (
                  <Link
                    key={doc.id}
                    to={`/documents/${doc.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary/50"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground">{docTypeLabels[doc.file_type] || doc.file_type}</p>
                    </div>
                    <span className={`text-xs font-medium ${sc.color}`}>{doc.status}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
