# Local Development Setup Guide

This guide walks you through running this project entirely on your own machine using VS Code — no Lovable dependency required.

---

## Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org/))
- **npm** or **bun** (comes with Node.js)
- **Supabase CLI** ([install guide](https://supabase.com/docs/guides/cli/getting-started))
- **Git**
- **OpenAI API Key** ([get one here](https://platform.openai.com/api-keys))

---

## Step 1: Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd <project-folder>
npm install
```

---

## Step 2: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **"New Project"** and fill in:
   - Project name: `clinical-docs` (or any name)
   - Database password: (save this!)
   - Region: choose closest to you
3. Wait for the project to finish provisioning (~2 minutes)

---

## Step 3: Get Your Supabase Credentials

In your Supabase dashboard:
1. Go to **Settings → API**
2. Copy these values:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon/public key** (the long JWT under "Project API keys")
   - **service_role key** (click "Reveal" — keep this secret!)
   - **Project Reference ID** (the `abcdefgh` part of the URL)

---

## Step 4: Create `.env` File

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your_anon_public_key"
VITE_SUPABASE_PROJECT_ID="YOUR_PROJECT_REF"
```

---

## Step 5: Run Database Migrations

### Option A: Using Supabase CLI (recommended)

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Push all migrations
supabase db push
```

### Option B: Using SQL Editor

1. Go to your Supabase dashboard → **SQL Editor**
2. Open each file in `supabase/migrations/` folder (in order by filename/date)
3. Copy-paste and run each one

---

## Step 6: Create Storage Bucket

In Supabase dashboard → **Storage**:
1. Click **"New bucket"**
2. Name: `clinical-documents`
3. Public: **OFF** (private)
4. Click **Create**

Or run this SQL in the SQL Editor:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('clinical-documents', 'clinical-documents', false);

-- Allow authenticated users to upload
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'clinical-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to read their own documents
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'clinical-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'clinical-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

## Step 7: Deploy Edge Functions

```bash
# Set your OpenAI API key as a secret
supabase secrets set OPENAI_API_KEY="sk-proj-your-key-here"

# Deploy the process-document function
supabase functions deploy process-document --no-verify-jwt
```

---

## Step 8: Configure Authentication

In Supabase dashboard → **Authentication → Settings**:
1. **Email Auth**: Enabled (default)
2. **Confirm email**: Enable or disable based on preference
3. **Site URL**: Set to `http://localhost:8080`
4. **Redirect URLs**: Add `http://localhost:8080`

---

## Step 9: Run the App

```bash
npm run dev
```

The app will be available at **http://localhost:8080**

---

## Step 10: (Optional) Remove Lovable Tagger

In `vite.config.ts`, you can remove the lovable-tagger plugin:

```typescript
// Before
import { componentTagger } from "lovable-tagger";
plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),

// After
plugins: [react()],
```

Then uninstall:
```bash
npm uninstall lovable-tagger
```

---

## Project Architecture

```
├── src/
│   ├── components/       # React UI components
│   ├── hooks/            # Custom React hooks (auth, etc.)
│   ├── integrations/     # Supabase client & types
│   ├── pages/            # Route pages
│   └── main.tsx          # App entry point
├── supabase/
│   ├── functions/        # Edge functions (Deno)
│   │   └── process-document/  # AI document processing
│   ├── migrations/       # Database migrations (SQL)
│   └── config.toml       # Supabase config
└── .env                  # Environment variables (create this)
```

## Key Dependencies

| What | Technology | Purpose |
|------|-----------|---------|
| Frontend | React + Vite + Tailwind | UI framework |
| Backend | Supabase | Auth, DB, Storage, Edge Functions |
| AI | OpenAI GPT-4o | Document classification & extraction |
| Database | PostgreSQL (via Supabase) | Data storage with RLS |

---

## Troubleshooting

### "Failed to fetch" errors
- Check your `.env` values are correct
- Ensure your Supabase project is active (free tier pauses after inactivity)

### Edge function not working
- Run `supabase functions serve process-document --no-verify-jwt` for local testing
- Check logs: `supabase functions logs process-document`

### Auth not working
- Verify Site URL is set to `http://localhost:8080` in Supabase Auth settings
- Check that redirect URLs include `http://localhost:8080`
