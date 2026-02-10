import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Upload, FileText, X, Loader2 } from "lucide-react";

const UploadDocument = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);

    try {
      const filePath = `${user.id}/${Date.now()}_${file.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("clinical-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create document record with a placeholder type — edge function will auto-classify
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          filename: file.name,
          file_type: "imaging_report",  // placeholder, will be overwritten by classifier
          file_path: filePath,
          file_size: file.size,
          status: "pending",
        })
        .select()
        .single();

      if (docError) throw docError;

      // Log audit
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "document_uploaded",
        target_type: "document",
        target_id: doc.id,
        details: { filename: file.name },
      });

      // Trigger AI classification + extraction
      const { error: fnError } = await supabase.functions.invoke("process-document", {
        body: { document_id: doc.id },
      });

      if (fnError) {
        console.error("Processing error:", fnError);
        toast({ title: "Upload successful", description: "Document uploaded. Processing may take a moment." });
      } else {
        toast({ title: "Processing started", description: "AI is classifying and extracting your document." });
      }

      navigate(`/documents/${doc.id}`);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload Document</h1>
        <p className="text-sm text-muted-foreground">
          Upload a clinical document — it will be automatically classified and processed by AI
        </p>
      </div>

      {/* File Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-16 transition-all ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card/50"
        }`}
      >
        {file ? (
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button onClick={() => setFile(null)} className="ml-4 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-foreground">Drop your clinical document here</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, images, or Word documents — type will be auto-detected</p>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </>
        )}
      </div>

      {/* Upload Button */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={handleUpload}
        disabled={!file || uploading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-40"
        style={{ boxShadow: file ? "var(--shadow-glow)" : "none" }}
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading & Classifying...
          </>
        ) : (
          "Upload & Auto-Process"
        )}
      </motion.button>
    </div>
  );
};

export default UploadDocument;
