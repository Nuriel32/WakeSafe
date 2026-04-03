#!/usr/bin/env node

/**
 * Environment switcher for WakeSafe Mobile App
 * Usage: node switch-env.js [development|local|staging|production]
 * Writes EXPO_PUBLIC_ENV into .env.local (no source-file edits).
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '.env.local');

function updateEnvironment(env) {
  const validEnvs = ['development', 'local', 'staging', 'production'];
  
  if (!validEnvs.includes(env)) {
    console.error(`❌ Invalid environment: ${env}`);
    console.log(`Valid environments: ${validEnvs.join(', ')}`);
    process.exit(1);
  }

  try {
    const content = `EXPO_PUBLIC_ENV=${env}\n`;
    fs.writeFileSync(ENV_FILE, content, 'utf8');
    
    console.log(`✅ Environment switched to: ${env}`);
    console.log(`📱 Mobile app will now connect to ${env} server`);
    
    if (env === 'development') {
      console.log('🌐 Using GCP Cloud Run server: https://wakesafe-api-227831302277.us-central1.run.app');
    } else if (env === 'local') {
      console.log('🔧 Make sure your local server is running on http://192.168.1.133:5000');
      console.log('📝 Optional: set EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_WS_URL in .env.local');
    } else if (env === 'staging') {
      console.log('🧪 Using staging server: https://wakesafe-api-staging-227831302277.us-central1.run.app');
    } else if (env === 'production') {
      console.log('🚀 Using production server: https://wakesafe-api-227831302277.us-central1.run.app');
    }
    
  } catch (error) {
    console.error('❌ Error updating environment:', error.message);
    process.exit(1);
  }
}

// Get environment from command line argument
const env = process.argv[2];

if (!env) {
  console.log('🔧 WakeSafe Mobile Environment Switcher');
  console.log('');
  console.log('Usage: node switch-env.js [development|local|staging|production]');
  console.log('');
  console.log('Environments:');
  console.log('  development  # GCP Cloud Run server (default)');
  console.log('  local        # Local development server');
  console.log('  staging      # GCP staging server');
  console.log('  production   # GCP production server');
  console.log('');
  console.log('Examples:');
  console.log('  node switch-env.js development  # Use GCP server');
  console.log('  node switch-env.js local        # Use local server');
  console.log('  node switch-env.js production   # Use GCP production');
  console.log('');
  process.exit(0);
}

updateEnvironment(env);