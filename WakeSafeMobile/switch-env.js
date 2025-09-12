#!/usr/bin/env node

/**
 * Environment switcher for WakeSafe Mobile App
 * Usage: node switch-env.js [development|production]
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, 'src/config/environment.ts');

function updateEnvironment(env) {
  const validEnvs = ['development', 'staging', 'production'];
  
  if (!validEnvs.includes(env)) {
    console.error(`❌ Invalid environment: ${env}`);
    console.log(`Valid environments: ${validEnvs.join(', ')}`);
    process.exit(1);
  }

  try {
    let content = fs.readFileSync(ENV_FILE, 'utf8');
    
    // Update the getCurrentEnvironment function to force the selected environment
    const newFunction = `export const getCurrentEnvironment = (): Environment => {
  // Force environment: ${env}
  return '${env}';
};`;
    
    content = content.replace(
      /export const getCurrentEnvironment = \(\): Environment => \{[\s\S]*?\};/,
      newFunction
    );
    
    fs.writeFileSync(ENV_FILE, content);
    
    console.log(`✅ Environment switched to: ${env}`);
    console.log(`📱 Mobile app will now connect to ${env} server`);
    
    if (env === 'development') {
      console.log('🔧 Make sure your local server is running on http://localhost:5000');
      console.log('📝 To test on physical device, update the IP address in environment.ts');
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
  console.log('Usage: node switch-env.js [development|production]');
  console.log('');
  console.log('Examples:');
  console.log('  node switch-env.js development  # Use local server');
  console.log('  node switch-env.js production   # Use GCP server');
  console.log('');
  process.exit(0);
}

updateEnvironment(env);