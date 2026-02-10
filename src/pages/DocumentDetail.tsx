import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { ArrowLeft, Download, FileText, CheckCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { jsPDF } from "jspdf";
import type { Tables, Json } from "@/integrations/supabase/types";

const docTypeLabels: Record<string, string> = {
  pet_ct_scan: "PET/CT Scan",
  imaging_report: "Imaging Report",
  referral_report: "Referral Report",
  prescription: "Prescription",
};

const statusConfig: Record<string, { color: string; bg: string; icon: typeof CheckCircle }> = {
  pending: { color: "text-warning", bg: "bg-warning/10", icon: Clock },
  processing: { color: "text-info", bg: "bg-info/10", icon: Clock },
  completed: { color: "text-success", bg: "bg-success/10", icon: CheckCircle },
  failed: { color: "text-destructive", bg: "bg-destructive/10", icon: AlertTriangle },
};

// Safely render JSON values
const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

const flattenObject = (obj: Record<string, unknown>, prefix = ""): [string, unknown][] => {
  const entries: [string, unknown][] = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      entries.push(...flattenObject(val as Record<string, unknown>, fullKey));
    } else {
      entries.push([fullKey, val]);
    }
  }
  return entries;
};

const DocumentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [doc, setDoc] = useState<Tables<"documents"> | null>(null);
  const [extraction, setExtraction] = useState<Tables<"extractions"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);

  const fetchData = async () => {
    if (!id || !user) return;
    setLoading(true);

    const { data: docData } = await supabase.from("documents").select("*").eq("id", id).single();
    if (docData) setDoc(docData);

    const { data: extData } = await supabase.from("extractions").select("*").eq("document_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (extData) setExtraction(extData);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id, user]);

  // Poll if processing
  useEffect(() => {
    if (!doc || doc.status !== "processing") return;
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [doc?.status]);

  const handleReprocess = async () => {
    if (!doc) return;
    setReprocessing(true);
    try {
      await supabase.from("documents").update({ status: "processing" }).eq("id", doc.id);
      await supabase.functions.invoke("process-document", {
        body: { document_id: doc.id, document_type: doc.file_type },
      });
      toast({ title: "Reprocessing started" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setReprocessing(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!doc || !extraction) return;
    const pdf = new jsPDF();
    const extractedData = extraction.extracted_data as Record<string, unknown>;
    const entries = flattenObject(extractedData);

    pdf.setFontSize(16);
    pdf.text(`Clinical Extraction Report`, 20, 20);
    pdf.setFontSize(10);
    pdf.text(`Document: ${doc.filename}`, 20, 30);
    pdf.text(`Type: ${docTypeLabels[doc.file_type]}`, 20, 36);
    pdf.text(`Date: ${new Date(doc.created_at).toLocaleDateString()}`, 20, 42);
    pdf.text(`Confidence: ${extraction.confidence_score ?? "N/A"}%`, 20, 48);

    pdf.setFontSize(12);
    pdf.text("Extracted Data", 20, 60);

    let y = 70;
    pdf.setFontSize(9);
    for (const [key, val] of entries) {
      const label = key.replace(/_/g, " ").replace(/\./g, " > ");
      const valStr = renderValue(val);
      if (y > 270) { pdf.addPage(); y = 20; }
      pdf.setFont("helvetica", "bold");
      pdf.text(label, 20, y);
      pdf.setFont("helvetica", "normal");
      const lines = pdf.splitTextToSize(valStr, 150);
      pdf.text(lines, 80, y);
      y += Math.max(lines.length * 5, 6);
    }

    pdf.save(`${doc.filename}_extraction.pdf`);

    // Audit log
    supabase.from("audit_logs").insert({
      user_id: user!.id,
      action: "pdf_downloaded",
      target_type: "extraction",
      target_id: extraction.id,
      details: { document_id: doc.id },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Document not found</p>
        <Link to="/documents" className="mt-2 text-sm text-primary hover:underline">Back to documents</Link>
      </div>
    );
  }

  const sc = statusConfig[doc.status] || statusConfig.pending;
  const extractedData = extraction?.extracted_data as Record<string, unknown> | null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link to="/documents" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">{doc.filename}</h1>
            <p className="text-sm text-muted-foreground">
              {docTypeLabels[doc.file_type]} · {new Date(doc.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${sc.color} ${sc.bg}`}>
            {doc.status}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {extraction && (
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </button>
        )}
        <button
          onClick={handleReprocess}
          disabled={reprocessing}
          className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-secondary/80 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${reprocessing ? "animate-spin" : ""}`} />
          Reprocess
        </button>
      </div>

      {/* Extraction Info */}
      {extraction && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Confidence Score</p>
            <p className="mt-1 text-xl font-bold text-foreground">{extraction.confidence_score ?? "N/A"}%</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Processing Time</p>
            <p className="mt-1 text-xl font-bold text-foreground">{extraction.processing_time_ms ?? "N/A"}ms</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Validation</p>
            <p className="mt-1 text-xl font-bold text-foreground capitalize">{extraction.validation_status}</p>
          </div>
        </div>
      )}

      {/* Extracted Data */}
      {doc.status === "processing" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass flex flex-col items-center rounded-xl py-16"
        >
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">AI is processing your document...</p>
          <p className="mt-1 text-xs text-muted-foreground">This page will auto-refresh</p>
        </motion.div>
      )}

      {extractedData && (
        <div className="glass rounded-xl p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Extracted Data</h2>
          <div className="space-y-0.5">
            {Object.entries(extractedData).map(([section, value]) => (
              <div key={section} className="mb-4">
                <h3 className="mb-2 text-sm font-semibold text-primary capitalize">
                  {section.replace(/_/g, " ")}
                </h3>
                {value && typeof value === "object" && !Array.isArray(value) ? (
                  <div className="ml-2 space-y-1.5">
                    {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-sm">
                        <span className="min-w-[160px] text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span>
                        <span className="text-foreground font-mono text-xs">{renderValue(v)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ml-2 text-sm font-mono text-foreground">{renderValue(value)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {extraction?.validation_errors && Array.isArray(extraction.validation_errors) && (extraction.validation_errors as unknown[]).length > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-destructive">Validation Issues</h3>
          <ul className="space-y-1">
            {(extraction.validation_errors as string[]).map((err, i) => (
              <li key={i} className="text-xs text-destructive/80">• {err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DocumentDetail;
