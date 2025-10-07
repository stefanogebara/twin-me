# Critical Database Migration Required

## ⚠️ Issue Found

The `digital_twins` table does **not exist** in your Supabase database, which is causing the 500 error when creating a soul signature.

**Error Message:**
```
Could not find the 'favorite_analogies' column of 'digital_twins' in the schema cache
```

**Root Cause:** The table doesn't exist at all!

## 🔧 How to Fix

### Option 1: Apply via Supabase Dashboard (Recommended)

1. **Go to Supabase SQL Editor:**
   - Visit: https://supabase.com/dashboard/project/lurebwaudisfilhuhmnj/sql

2. **Create a new query**

3. **Copy and paste the entire contents of:**
   - `database/migrations/003_create_digital_twins_table.sql`

4. **Click "Run"** to execute the migration

5. **Verify the tables were created:**
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('digital_twins', 'training_materials', 'chat_history')
   ORDER BY table_name;
   ```

   You should see all 3 tables listed.

### Option 2: Apply via Supabase CLI (Advanced)

If you have Supabase CLI installed:

```bash
cd twin-ai-learn
supabase db push --db-url "postgresql://postgres:[YOUR-PASSWORD]@db.lurebwaudisfilhuhmnj.supabase.co:5432/postgres"
```

## 📋 What This Migration Creates

### Tables Created:

1. **digital_twins** - Main table for storing soul signatures and professor twins
   - `id`, `creator_id`, `name`, `description`
   - `personality_traits`, `teaching_style`, `common_phrases`, `favorite_analogies`
   - `soul_signature`, `connected_platforms`
   - `is_active`, `knowledge_base_status`

2. **training_materials** - Knowledge base files for training twins
   - Stores PDFs, documents, videos for twin learning

3. **chat_history** - Conversation history with digital twins
   - Stores all chat interactions with twins

### Security Features:
- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Users can only access their own twins
- ✅ Public can view active professor twins
- ✅ Proper indexes for performance
- ✅ Auto-updating timestamps

## 🧪 Test After Migration

After applying the migration, test the soul signature creation:

1. Go to http://localhost:8086/get-started
2. Complete the onboarding flow
3. The twin should be created successfully without 500 errors

## ❓ Need Help?

If you encounter any issues:
1. Check Supabase logs in the dashboard
2. Verify the tables exist with the SQL query above
3. Ensure your API key has the correct permissions
