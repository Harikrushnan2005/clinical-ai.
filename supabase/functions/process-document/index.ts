import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- AI Provider Config ---
type AIProvider = "lovable" | "openai";
function getAIConfig(): { provider: AIProvider; apiKey: string; baseUrl: string; model: string } {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (lovableKey) {
    console.log("Using Lovable AI Gateway (Gemini)");
    return {
      provider: "lovable",
      apiKey: lovableKey,
      baseUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
      model: "google/gemini-2.5-flash",
    };
  }
  if (openaiKey) {
    console.log("Using OpenAI directly");
    return {
      provider: "openai",
      apiKey: openaiKey,
      baseUrl: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o",
    };
  }
  throw new Error("No AI API key found. Set LOVABLE_API_KEY (Lovable Cloud) or OPENAI_API_KEY (local dev).");
}
// --- Prompts ---

const CLASSIFICATION_PROMPT = `You are a clinical document classifier. Read the document carefully and classify it into exactly ONE of these types:
- pet_ct_scan: PET/CT scan reports with SUV values, tracers, imaging findings
- imaging_report: Radiology/imaging reports (X-ray, MRI, CT, ultrasound) with findings, impressions, comparisons
- referral_report: Referral documents with referring provider, reason for referral, specialty
- prescription: Prescription or refill reports with medication details, NDC codes, dosing, pharmacy info

IMPORTANT: Read ALL text in the document including headers, labels, and notes to determine the correct type.
Respond with ONLY a JSON object: {"document_type": "<type>", "classification_confidence": <0-100>}`;

const agentPrompts: Record<string, string> = {
  pet_ct_scan: `You are an expert clinical data extraction agent for PET/CT Scan reports.

INSTRUCTIONS:
1. Read EVERY word, number, and label in the document carefully.
2. Extract ALL fields listed below. For each field, search the entire document thoroughly.
3. If a value can be reasonably inferred from context (e.g., dose from "20 mg once daily"), do so.
4. Only use null when the information is truly absent and cannot be inferred.
5. For numeric fields, extract just the number without units.

Return ONLY this JSON structure:
{
  "patient_details": { "name": string|null, "date_of_birth": string|null, "health_plan_member_id": string|null },
  "provider_details": { "ordering_provider_name": string|null, "npi": string|null, "tax_id": string|null },
  "facility_details": { "name": string|null, "npi": string|null },
  "quantitative_metrics": { "suv_values": [{ "location": string, "suv_max": number|null, "suv_mean": number|null }] },
  "radiopharmaceutical": { "tracer_name": string|null, "dose": string|null, "route_of_administration": string|null },
  "findings_and_impressions": [{ "description": string, "anatomical_location": string|null, "size": string|null, "disease_label": string|null }],
  "technical_parameters": { "reconstruction_method": string|null, "slice_thickness": string|null, "image_resolution": string|null },
  "patient_metrics_at_scan": { "weight_kg": number|null, "serum_glucose_mg_dl": number|null }
}`,

  imaging_report: `You are an expert clinical data extraction agent for Imaging/Radiology Reports.

INSTRUCTIONS:
1. Read EVERY word, number, and label in the document carefully.
2. Extract ALL fields listed below. Search headers, body text, footers, and any tables.
3. If a value can be reasonably inferred from context, do so.
4. Only use null when the information is truly absent and cannot be inferred.

Return ONLY this JSON structure:
{
  "patient_details": { "name": string|null, "date_of_birth": string|null, "health_plan_member_id": string|null },
  "provider_details": { "ordering_provider_name": string|null, "npi": string|null, "tax_id": string|null },
  "facility_details": { "name": string|null, "npi": string|null },
  "comparison_with_prior_studies": [{ "prior_study_date": string|null, "modality": string|null, "change_description": string|null, "status": string|null }],
  "incidental_findings": [{ "description": string, "clinical_significance": string|null, "recommendation": string|null }],
  "primary_findings": [{ "description": string, "anatomical_location": string|null, "measurements": string|null }],
  "impression": string|null,
  "modality": string|null,
  "study_date": string|null
}`,

  referral_report: `You are an expert clinical data extraction agent for Referral Reports.

INSTRUCTIONS:
1. Read EVERY word, number, and label in the document carefully.
2. Extract ALL fields listed below. Search headers, body text, footers, and any tables.
3. If a value can be reasonably inferred from context, do so.
4. Only use null when the information is truly absent and cannot be inferred.

Return ONLY this JSON structure:
{
  "patient_details": { "name": string|null, "date_of_birth": string|null, "health_plan_member_id": string|null },
  "provider_details": { "ordering_provider_name": string|null, "npi": string|null, "tax_id": string|null },
  "facility_details": { "name": string|null, "npi": string|null },
  "referring_provider": { "name": string|null, "npi": string|null },
  "reason_for_referral": string|null,
  "clinical_diagnosis": string|null,
  "specialty_type": string|null,
  "urgency_priority": string|null,
  "clinical_history_summary": string|null,
  "requested_services": [string]
}`,

  prescription: `You are an expert clinical data extraction agent for Prescription and Prescription Refill Reports.

INSTRUCTIONS:
1. Read EVERY word, number, and label in the document carefully, including notes sections.
2. Extract ALL fields listed below. Search headers, body text, footers, tables, and notes.
3. IMPORTANT INFERENCE RULES:
   - If "Prescriber NPI" is listed, use it for both provider_details.npi AND prescriber.npi
   - If "Pharmacist ID" or "Pharmacy ID" is listed, use it for pharmacy_details.pharmacy_id
   - If frequency is "once daily" and quantity is 30, then days_supply is 30
   - If there are notes about gaps in dispense history, extract gap dates and calculate gap_days
   - "Dose: 20 mg once daily" means strength is "20 mg", frequency is "once daily", dosage_form can be inferred from drug name
   - If route is not stated but drug is an oral tablet/capsule, route is "oral"
   - Look for any notes about adherence, gaps, or refill history
4. Only use null when the information is truly absent and CANNOT be inferred.

Return ONLY this JSON structure:
{
  "patient_details": { "name": string|null, "date_of_birth": string|null, "health_plan_member_id": string|null },
  "provider_details": { "ordering_provider_name": string|null, "npi": string|null, "tax_id": string|null },
  "facility_details": { "name": string|null, "npi": string|null },
  "medication_specifics": { "drug_name": string|null, "ndc_code": string|null, "dosage_form": string|null, "strength": string|null, "frequency": string|null, "route": string|null },
  "dispensing_history": { "original_dispense_date": string|null, "refills_remaining": number|null, "quantity_per_refill": number|null, "days_supply": number|null },
  "adherence_data": { "last_fill_date": string|null, "expected_next_fill_date": string|null, "gap_days": number|null, "adherence_status": string|null },
  "pharmacy_details": { "pharmacy_name": string|null, "pharmacy_id": string|null },
  "prescriber": { "name": string|null, "npi": string|null, "dea_number": string|null }
}`,
};


const requiredFields: Record<string, string[]> = {
  prescription: [
    "patient_details.name", "patient_details.date_of_birth", "patient_details.health_plan_member_id",
    "medication_specifics.drug_name", "medication_specifics.strength", "medication_specifics.frequency",
    "dispensing_history.refills_remaining", "dispensing_history.quantity_per_refill",
    "prescriber.npi"
  ],
  imaging_report: [
    "patient_details.name", "modality", "study_date", "impression"
  ],
  pet_ct_scan: [
    "patient_details.name", "radiopharmaceutical.tracer_name"
  ],
  referral_report: [
    "patient_details.name", "reason_for_referral", "specialty_type"
  ],
};

function parseJsonFromText(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text); } catch { /* continue */ }
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch { /* continue */ }
  }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch { /* continue */ }
  }
  return null;
}

/**
 * Build message content based on AI provider and file type.
 * - Lovable (Gemini): supports PDF as base64 image_url natively
 * - OpenAI: does NOT support PDF as image_url, so we send extracted text instead
 */
function buildMessageContent(
  provider: AIProvider,
  fileBase64: string,
  mimeType: string,
  fileText: string,
  userPrompt: string
) {
  // Images work on both providers
  if (mimeType.startsWith("image/") && fileBase64) {
    return [
      { type: "text", text: userPrompt },
      { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
    ];
  }
  // PDFs: Gemini supports native PDF, OpenAI does NOT
  if (mimeType === "application/pdf") {
    if (provider === "lovable" && fileBase64) {
      // Gemini accepts PDF as image_url
      return [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: `data:application/pdf;base64,${fileBase64}` } },
      ];
    }
    // OpenAI fallback: send as text content
    console.log("PDF detected with OpenAI provider — sending as extracted text");
    return [{ type: "text", text: `${userPrompt}\n\n--- DOCUMENT TEXT ---\n${fileText.substring(0, 50000)}` }];
  }

  // Fallback: send as text
  return [{ type: "text", text: `${userPrompt}\n\n${fileText.substring(0, 30000)}` }];

}

function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "tiff": case "tif": return "image/tiff";
    default: return "application/octet-stream";
  }
}

function getFieldValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function calculateConfidence(data: Record<string, unknown>, docType: string): { score: number; nullFields: string[]; missingRequired: string[] } {
  const nullFields: string[] = [];
  const checkNull = (obj: Record<string, unknown>, path: string) => {
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = `${path}.${key}`;
      if (value === null) {
        nullFields.push(fieldPath);
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        checkNull(value as Record<string, unknown>, fieldPath);
      }
    }
  };
  checkNull(data, "root");

  const required = requiredFields[docType] || [];
  const missingRequired = required.filter(f => {
    const val = getFieldValue(data, f);
    return val === null || val === undefined;
  });

  // Score: start at 100, lose 10 per missing required field, 2 per optional null
  const optionalNulls = nullFields.length - missingRequired.length;
  const score = Math.max(10, 100 - (missingRequired.length * 10) - (optionalNulls * 2));

  return { score, nullFields, missingRequired };
}


async function callAI(config: ReturnType<typeof getAIConfig>, systemPrompt: string, messageContent: unknown) {
  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
       Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
       model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageContent },
      ],
      temperature: 0.05,
      max_tokens: 4096,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error ${response.status}: ${errText}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in AI response");
  return content as string;
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "Missing document_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiConfig = getAIConfig();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: doc, error: docErr } = await supabase.from("documents").select("*").eq("id", document_id).single();
    if (docErr || !doc) throw new Error("Document not found");

    const { data: fileData, error: fileErr } = await supabase.storage.from("clinical-documents").download(doc.file_path);
    if (fileErr || !fileData) throw new Error("Failed to download document file");

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let base64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      base64 += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
    }
    const fileBase64 = btoa(base64);
    const mimeType = getMimeType(doc.filename);
    const fileText = await new Blob([arrayBuffer]).text();
    const startTime = Date.now();

    // STEP 1: Classify
    console.log(`Step 1: Classifying with ${aiConfig.provider} (${aiConfig.model})...`);
    const classContent = buildMessageContent(aiConfig.provider, fileBase64, mimeType, fileText, "Classify this clinical document. Read all text carefully including headers, notes, and labels.");
    const classRaw = await callAI(aiConfig, CLASSIFICATION_PROMPT, classContent);
    console.log("Classification:", classRaw);

    const classParsed = parseJsonFromText(classRaw);
    let detectedType = (classParsed?.document_type as string) || "imaging_report";
    const classConfidence = (classParsed?.classification_confidence as number) || 50;
    const validTypes = ["pet_ct_scan", "imaging_report", "referral_report", "prescription"];
    if (!validTypes.includes(detectedType)) detectedType = "imaging_report";

    console.log(`Type: ${detectedType} (${classConfidence}%)`);
    await supabase.from("documents").update({ file_type: detectedType, status: "processing" }).eq("id", document_id);

    // STEP 2: Extract
    console.log(`Step 2: Extracting with ${aiConfig.provider}...`);
    const extractContent = buildMessageContent(
      aiConfig.provider, fileBase64, mimeType, fileText,
      "Extract ALL structured data from this clinical document. Read every word, number, header, label, note, and table. Infer values when reasonable (e.g., route='oral' for tablets, days_supply from quantity and frequency). Use null ONLY when truly absent."
    );
    const extractRaw = await callAI(aiConfig, agentPrompts[detectedType], extractContent);
    console.log("Extraction (first 500):", extractRaw.substring(0, 500));

    const extractedData = parseJsonFromText(extractRaw);
    const processingTime = Date.now() - startTime;

    if (!extractedData) {
      console.error("Parse failed:", extractRaw.substring(0, 500));
      await supabase.from("documents").update({ status: "failed" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "Failed to parse extraction" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STEP 3: Smart confidence scoring
    const { score: confidenceScore, nullFields, missingRequired } = calculateConfidence(extractedData, detectedType);
    const validationStatus = missingRequired.length === 0 ? (nullFields.length === 0 ? "valid" : "partial") : "incomplete";

    console.log(`Confidence: ${confidenceScore}%, nulls: ${nullFields.length}, missing required: ${missingRequired.length}`);

    await supabase.from("extractions").insert({
      document_id,
      extracted_data: extractedData,
      confidence_score: confidenceScore,
      validation_status: validationStatus,
      validation_errors: nullFields,
      processing_time_ms: processingTime,
      model_used: aiConfig.model,
    });

    await supabase.from("documents").update({ status: "completed" }).eq("id", document_id);

    await supabase.from("audit_logs").insert({
      user_id: doc.user_id,
      action: "extraction_completed",
      target_type: "document",
      target_id: document_id,
      details: {
        ai_provider: aiConfig.provider,
        classified_type: detectedType,
        classification_confidence: classConfidence,
        confidence_score: confidenceScore,
        processing_time_ms: processingTime,
        validation_status: validationStatus,
        null_fields_count: nullFields.length,
        missing_required: missingRequired,
      },
    });

    console.log(`Done: ${detectedType}, confidence: ${confidenceScore}%, time: ${processingTime}ms, provider: ${aiConfig.provider}`);

    return new Response(JSON.stringify({
      success: true,
      document_type: detectedType,
      classification_confidence: classConfidence,
      confidence_score: confidenceScore,
      ai_provider: aiConfig.provider,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("process-document error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
