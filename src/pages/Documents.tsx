import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileText, CheckCircle, Clock, AlertTriangle, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const docTypeLabels: Record<string, string> = {
  pet_ct_scan: "PET/CT Scan",
  imaging_report: "Imaging Report",
  referral_report: "Referral Report",
  prescription: "Prescription",
};

const statusConfig: Record<string, { color: string; bg: string }> = {
  pending: { color: "text-warning", bg: "bg-warning/10" },
  processing: { color: "text-info", bg: "bg-info/10" },
  completed: { color: "text-success", bg: "bg-success/10" },
  failed: { color: "text-destructive", bg: "bg-destructive/10" },
};

const Documents = () => {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Tables<"documents">[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    const fetchDocs = async () => {
      let query = supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (filterType !== "all") query = query.eq("file_type", filterType as any);
      const { data } = await query;
      if (data) setDocs(data);
    };
    fetchDocs();
  }, [user, filterType]);

  const filtered = docs.filter((d) =>
    d.filename.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground">All processed clinical documents</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          {["all", "pet_ct_scan", "imaging_report", "referral_report", "prescription"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filterType === t ? "bg-primary/10 text-primary glow-border" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? "All" : docTypeLabels[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Documents List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <FileText className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No documents found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const sc = statusConfig[doc.status] || statusConfig.pending;
            return (
              <Link
                key={doc.id}
                to={`/documents/${doc.id}`}
                className="glass flex items-center gap-4 rounded-xl p-4 transition-all hover:glow-border"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{doc.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {docTypeLabels[doc.file_type]} · {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${sc.color} ${sc.bg}`}>
                  {doc.status}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Documents;
