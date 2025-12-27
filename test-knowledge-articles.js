import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testKnowledgeArticles() {
  console.log('🧪 Testing knowledge article fetching via Supabase function...\n');

  try {
    const { data, error } = await supabase.functions.invoke('servicenow-api', {
      body: {
        action: 'testKnowledgeArticles'
      }
    });

    if (error) {
      console.error('❌ Function invocation failed:', error);
      return;
    }

    console.log('✅ Test completed successfully!\n');

    // Display results
    const { testResults } = data;

    console.log('📄 Article by ID Test:');
    console.log(`   Requested: ${testResults.articleById.requested}`);
    console.log(`   Found: ${testResults.articleById.found ? '✅ Yes' : '❌ No'}`);
    if (testResults.articleById.article) {
      console.log(`   Number: ${testResults.articleById.article.number}`);
      console.log(`   Title: ${testResults.articleById.article.short_description}`);
      console.log(`   Category: ${testResults.articleById.article.category || 'N/A'}`);
    }
    console.log('');

    console.log('🔍 Search Query Test:');
    console.log(`   Query: "${testResults.searchQuery.query}"`);
    console.log(`   Results found: ${testResults.searchQuery.count}`);
    if (testResults.searchQuery.articles.length > 0) {
      console.log('   Articles:');
      testResults.searchQuery.articles.forEach((article, index) => {
        console.log(`     ${index + 1}. ${article.number}: ${article.short_description}`);
      });
    } else {
      console.log('   No articles found');
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

// Run the test
testKnowledgeArticles();