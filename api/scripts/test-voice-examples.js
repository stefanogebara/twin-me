/**
 * Quick test: verify voice examples are being fetched
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

async function test() {
  console.log('=== Voice Examples Test ===\n');

  // 1. Check mcp_conversation_logs for user messages
  const { data: logs, error } = await supabase
    .from('mcp_conversation_logs')
    .select('user_message, created_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    console.error('Error fetching logs:', error.message);
    return;
  }

  console.log(`Found ${logs.length} conversation logs`);

  // Filter valid messages (same logic as twinContextBuilder)
  const validMessages = logs
    .map(l => l.user_message)
    .filter(m => m && m.length >= 15 && !m.startsWith('/') && !m.startsWith('['));

  console.log(`Valid messages for voice examples: ${validMessages.length}`);

  // Show a few
  console.log('\nSample voice examples:');
  validMessages.slice(0, 8).forEach((m, i) => {
    console.log(`  ${i + 1}. "${m.substring(0, 100)}${m.length > 100 ? '...' : ''}"`);
  });

  // 2. Check twin summary exists
  const { data: summary } = await supabase
    .from('twin_summaries')
    .select('summary, generated_at')
    .eq('user_id', USER_ID)
    .single();

  console.log(`\nTwin summary: ${summary ? `${summary.summary.length} chars, generated ${summary.generated_at}` : 'MISSING'}`);

  // 3. Check memory stats
  const { count: totalMemories } = await supabase
    .from('user_memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID);

  const { count: withEmbeddings } = await supabase
    .from('user_memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .not('embedding', 'is', null);

  console.log(`\nMemories: ${totalMemories} total, ${withEmbeddings} with embeddings (${Math.round(withEmbeddings/totalMemories*100)}%)`);

  // 4. Test search_memory_stream with 7 params works
  const { data: searchResult, error: searchErr } = await supabase.rpc('search_memory_stream', {
    p_user_id: USER_ID,
    p_query_embedding: Array(1536).fill(0.01).map(() => (Math.random() - 0.5) * 0.1),
    p_limit: 3,
    p_decay_factor: 0.995,
    p_weight_recency: 1.0,
    p_weight_importance: 1.0,
    p_weight_relevance: 1.0,
  });

  if (searchErr) {
    console.log(`\nsearch_memory_stream (7-param): FAILED - ${searchErr.message}`);
  } else {
    console.log(`\nsearch_memory_stream (7-param): OK - returned ${searchResult.length} results`);
    if (searchResult.length > 0) {
      searchResult.forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.memory_type}] score=${r.combined_score?.toFixed(3)} "${r.content?.substring(0, 80)}..."`);
      });
    }
  }

  console.log('\n=== All checks passed ===');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
