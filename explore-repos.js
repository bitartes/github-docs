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

async function exploreRepositories() {
  console.log('🔍 Exploring Repository Structure');
  console.log('=' .repeat(50));

  const client = new GitHubClient(process.env.GITHUB_TOKEN);

  try {
    const repos = ['user-service', 'payment-service'];
    
    for (const repo of repos) {
      console.log(`\n📁 Repository: ${repo}`);
      console.log('-'.repeat(30));
      
      try {
        // Get repository root contents
        const { data } = await client.octokit.rest.repos.getContent({
          owner: 'bitartes',
          repo: repo,
          path: ''
        });

        console.log('Root contents:');
        data.forEach(item => {
          console.log(`  ${item.type === 'dir' ? '📁' : '📄'} ${item.name}`);
        });

        // Check for docs directory specifically
        const docsItem = data.find(item => item.name === 'docs' && item.type === 'dir');
        if (docsItem) {
          console.log('\n📚 Contents of docs/ directory:');
          const docsData = await client.octokit.rest.repos.getContent({
            owner: 'bitartes',
            repo: repo,
            path: 'docs'
          });
          
          docsData.data.forEach(item => {
            console.log(`  📄 ${item.name}`);
          });
        } else {
          console.log('\n❌ No docs/ directory found');
        }

        // Look for README files
        const readmeFiles = data.filter(item => 
          item.name.toLowerCase().includes('readme') && item.type === 'file'
        );
        
        if (readmeFiles.length > 0) {
          console.log('\n📖 README files found:');
          readmeFiles.forEach(file => {
            console.log(`  📄 ${file.name}`);
          });
        }

      } catch (error) {
        console.error(`❌ Error accessing ${repo}:`, error.message);
      }
    }

  } catch (error) {
    console.error('❌ Error during exploration:', error.message);
  }
}

exploreRepositories().catch(console.error);