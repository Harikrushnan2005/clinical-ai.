import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ClipboardList, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const actionLabels: Record<string, string> = {
  document_uploaded: "Document Uploaded",
  extraction_completed: "Extraction Completed",
  extraction_failed: "Extraction Failed",
  pdf_downloaded: "PDF Downloaded",
  document_reprocessed: "Document Reprocessed",
};

const actionColors: Record<string, string> = {
  document_uploaded: "text-info",
  extraction_completed: "text-success",
  extraction_failed: "text-destructive",
  pdf_downloaded: "text-primary",
  document_reprocessed: "text-warning",
};

const AuditLog = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Tables<"audit_logs">[]>([]);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");

  useEffect(() => {
    if (!user) return;
    const fetchLogs = async () => {
      let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (filterAction !== "all") query = query.eq("action", filterAction);
      const { data } = await query;
      if (data) setLogs(data);
    };
    fetchLogs();
  }, [user, filterAction]);

  const filtered = logs.filter((l) =>
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.target_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Track all document processing activities</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", "document_uploaded", "extraction_completed", "extraction_failed", "pdf_downloaded"].map((a) => (
            <button
              key={a}
              onClick={() => setFilterAction(a)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filterAction === a ? "bg-primary/10 text-primary glow-border" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {a === "all" ? "All" : actionLabels[a] || a}
            </button>
          ))}
        </div>
      </div>

      {/* Logs */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <ClipboardList className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No audit logs yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const details = log.details as Record<string, unknown> | null;
            return (
              <div
                key={log.id}
                className="glass flex items-start gap-4 rounded-xl p-4"
              >
                <div className="mt-0.5 h-2 w-2 rounded-full bg-primary/60" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${actionColors[log.action] || "text-foreground"}`}>
                      {actionLabels[log.action] || log.action}
                    </span>
                    <span className="text-xs text-muted-foreground">· {log.target_type}</span>
                  </div>
                  {details && Object.keys(details).length > 0 && (
                    <p className="mt-1 truncate text-xs font-mono text-muted-foreground">
                      {JSON.stringify(details)}
                    </p>
                  )}
                </div>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AuditLog;
