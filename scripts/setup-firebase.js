#!/usr/bin/env node

/**
 * Firebase Setup Helper Script
 * 
 * This script helps you configure Firebase Cloud Messaging for push notifications.
 * 
 * Usage:
 *   node scripts/setup-firebase.js path/to/firebase-service-account.json
 */

const fs = require('fs');
const path = require('path');

function setupFirebase(serviceAccountPath) {
  try {
    // Check if file exists
    if (!fs.existsSync(serviceAccountPath)) {
      console.error('❌ Error: Service account file not found:', serviceAccountPath);
      console.log('\n📝 To get your Firebase service account file:');
      console.log('   1. Go to https://console.firebase.google.com/');
      console.log('   2. Select your project');
      console.log('   3. Go to Project Settings → Service Accounts');
      console.log('   4. Click "Generate New Private Key"');
      console.log('   5. Download the JSON file');
      process.exit(1);
    }

    // Read and parse the service account file
    const serviceAccountContent = fs.readFileSync(serviceAccountPath, 'utf8');
    let serviceAccount;
    
    try {
      serviceAccount = JSON.parse(serviceAccountContent);
    } catch (error) {
      console.error('❌ Error: Invalid JSON in service account file');
      process.exit(1);
    }

    // Validate required fields
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !serviceAccount[field]);
    
    if (missingFields.length > 0) {
      console.error('❌ Error: Service account file is missing required fields:', missingFields.join(', '));
      process.exit(1);
    }

    // Minify JSON (remove whitespace)
    const minifiedJson = JSON.stringify(serviceAccount);

    // Read current .env file
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Check if FIREBASE_SERVICE_ACCOUNT already exists
    const firebaseRegex = /^FIREBASE_SERVICE_ACCOUNT=.*$/m;
    
    if (firebaseRegex.test(envContent)) {
      // Replace existing
      envContent = envContent.replace(
        firebaseRegex,
        `FIREBASE_SERVICE_ACCOUNT='${minifiedJson}'`
      );
      console.log('✅ Updated existing FIREBASE_SERVICE_ACCOUNT in .env');
    } else {
      // Append new
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `\n# Firebase Cloud Messaging (Push Notifications)\n`;
      envContent += `FIREBASE_SERVICE_ACCOUNT='${minifiedJson}'\n`;
      console.log('✅ Added FIREBASE_SERVICE_ACCOUNT to .env');
    }

    // Write back to .env
    fs.writeFileSync(envPath, envContent);

    console.log('\n🎉 Firebase setup complete!');
    console.log('\n📋 Project Details:');
    console.log(`   Project ID: ${serviceAccount.project_id}`);
    console.log(`   Client Email: ${serviceAccount.client_email}`);
    console.log('\n🚀 Next Steps:');
    console.log('   1. Restart your server: npm run dev');
    console.log('   2. Check logs for: "✅ PushNotificationService initialized with Firebase"');
    console.log('   3. Test with: POST /api/notifications/test');
    console.log('\n📖 Full documentation: server/PUSH_NOTIFICATIONS_GUIDE.md');

  } catch (error) {
    console.error('❌ Error setting up Firebase:', error.message);
    process.exit(1);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('🔥 Firebase Cloud Messaging Setup Helper\n');
  console.log('Usage:');
  console.log('  node scripts/setup-firebase.js <path-to-service-account.json>\n');
  console.log('Example:');
  console.log('  node scripts/setup-firebase.js ~/Downloads/firebase-service-account.json\n');
  console.log('📝 To get your Firebase service account file:');
  console.log('   1. Go to https://console.firebase.google.com/');
  console.log('   2. Select your project (or create a new one)');
  console.log('   3. Go to Project Settings → Service Accounts');
  console.log('   4. Click "Generate New Private Key"');
  console.log('   5. Download the JSON file');
  console.log('   6. Run this script with the path to that file\n');
  process.exit(0);
}

const serviceAccountPath = path.resolve(args[0]);
setupFirebase(serviceAccountPath);
