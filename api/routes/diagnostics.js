import express from 'express';
import supabase from '../config/supabase.js';

const router = express.Router();

// Diagnostic endpoint to test Supabase connection
router.get('/supabase-test', async (req, res) => {
  try {
    console.log('🔍 [Diagnostics] Testing Supabase connection...');

    // Test 1: Check environment variables
    const envCheck = {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL_value: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY_length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length,
      NODE_ENV: process.env.NODE_ENV
    };

    // Test 2: Try to query users table
    const { data: users, error: queryError } = await supabase
      .from('users')
      .select('id, email')
      .limit(3);

    // Test 3: Try to find specific user
    const { data: stefano, error: stefanoError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'stefanogebara@gmail.com')
      .single();

    // Test 4: Try insert test record
    const { data: testUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email: `test-diagnostic-${Date.now()}@example.com`,
        first_name: 'Test',
        last_name: 'Diagnostic',
        oauth_provider: 'diagnostic'
      })
      .select()
      .single();

    res.json({
      success: true,
      tests: {
        environmentVariables: envCheck,
        queryUsers: {
          success: !queryError,
          error: queryError,
          count: users?.length,
          users: users
        },
        findStefano: {
          success: !stefanoError,
          error: stefanoError,
          found: !!stefano,
          user: stefano
        },
        insertTest: {
          success: !insertError,
          error: insertError,
          userId: testUser?.id
        }
      }
    });
  } catch (error) {
    console.error('❌ [Diagnostics] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// OAuth environment variables check
router.get('/oauth-env', async (req, res) => {
  try {
    const envCheck = {
      GOOGLE_CLIENT_ID: {
        exists: !!process.env.GOOGLE_CLIENT_ID,
        value: process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 20)}...` : null,
        length: process.env.GOOGLE_CLIENT_ID?.length
      },
      GOOGLE_CLIENT_SECRET: {
        exists: !!process.env.GOOGLE_CLIENT_SECRET,
        length: process.env.GOOGLE_CLIENT_SECRET?.length
      },
      JWT_SECRET: {
        exists: !!process.env.JWT_SECRET,
        length: process.env.JWT_SECRET?.length
      },
      NODE_ENV: process.env.NODE_ENV,
      requestInfo: {
        protocol: req.protocol,
        host: req.get('host'),
        constructedApiUrl: process.env.NODE_ENV === 'production'
          ? `https://${req.get('host')}/api`
          : 'http://localhost:3001/api',
        constructedFrontendUrl: process.env.NODE_ENV === 'production'
          ? `https://${req.get('host')}`
          : 'http://localhost:8086'
      }
    };

    res.json({
      success: true,
      environment: envCheck
    });
  } catch (error) {
    console.error('❌ [Diagnostics] OAuth env check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
