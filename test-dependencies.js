#!/usr/bin/env node

import { GitHubClient } from './build/github-client.js';
import { readFileSync } from 'fs';

// Load environment variables manually
const envContent = readFileSync('.env', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  if (line.includes('=') && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    envVars[key.trim()] = value.trim();
  }
});
process.env.GITHUB_TOKEN = envVars.GITHUB_TOKEN;

async function testFindDependencies() {
  console.log('🔍 Testing GitHub Documentation MCP - Find Dependencies');
  console.log('=' .repeat(60));

  const client = new GitHubClient(process.env.GITHUB_TOKEN);

  try {
    // Test with your user-service repository
    console.log('\n📋 Testing with user-service repository...');
    const userServiceDocs = await client.getDocumentationFiles('bitartes', 'user-service');
    
    console.log(`Found ${userServiceDocs.length} documentation files in user-service:`);
    userServiceDocs.forEach(doc => {
      console.log(`  - ${doc.path}`);
    });

    // Test with your payment-service repository  
    console.log('\n💳 Testing with payment-service repository...');
    const paymentServiceDocs = await client.getDocumentationFiles('bitartes', 'payment-service');
    
    console.log(`Found ${paymentServiceDocs.length} documentation files in payment-service:`);
    paymentServiceDocs.forEach(doc => {
      console.log(`  - ${doc.path}`);
    });

    // Analyze dependencies by looking for service mentions in documentation
    console.log('\n🔗 Analyzing cross-service dependencies...');
    
    const allDocs = [...userServiceDocs, ...paymentServiceDocs];
    const dependencies = new Map();

    allDocs.forEach(doc => {
      const content = doc.content.toLowerCase();
      const repoName = doc.path.includes('user-service') ? 'user-service' : 'payment-service';
      
      // Look for mentions of other services
      const servicePatterns = [
        'payment service', 'payment-service',
        'user service', 'user-service', 
        'notification service', 'notification-service',
        'analytics service', 'analytics-service',
        'fraud detection', 'fraud-detection',
        'billing service', 'billing-service',
        'order service', 'order-service'
      ];

      servicePatterns.forEach(pattern => {
        if (content.includes(pattern)) {
          if (!dependencies.has(repoName)) {
            dependencies.set(repoName, new Set());
          }
          dependencies.get(repoName).add(pattern);
        }
      });
    });

    // Display found dependencies
    console.log('\n📊 Discovered Dependencies:');
    dependencies.forEach((deps, repo) => {
      console.log(`\n${repo}:`);
      deps.forEach(dep => {
        console.log(`  → ${dep}`);
      });
    });

    // Test rate limit
    console.log('\n⚡ Checking GitHub API rate limit...');
    const rateLimit = await client.checkRateLimit();
    console.log(`Remaining requests: ${rateLimit.remaining}`);
    console.log(`Reset time: ${rateLimit.resetTime.toLocaleString()}`);

    console.log('\n✅ Test completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Add your OpenAI API key to .env file');
    console.log('2. Run the full MCP server with: node build/index.js');
    console.log('3. Test the find_dependencies tool via MCP protocol');

  } catch (error) {
    console.error('❌ Error during testing:', error.message);
    
    if (error.message.includes('Bad credentials')) {
      console.log('\n💡 Tip: Make sure your GitHub token has the correct permissions:');
      console.log('   - For public repos: public_repo scope');
      console.log('   - For private repos: repo scope');
    }
  }
}

testFindDependencies().catch(console.error);