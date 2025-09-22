// Test script for searching files in OneDrive
// Usage: node test-search-files.js <accessToken> <searchQuery>

import { createGraphClient } from './build/microsoft-graph-utils.js';

async function testSearchFiles() {
  if (process.argv.length < 4) {
    console.error('Usage: node test-search-files.js <accessToken> <searchQuery>');
    process.exit(1);
  }

  const accessToken = process.argv[2];
  const searchQuery = process.argv[3];
  
  try {
    console.log('Initializing Microsoft Graph client...');
    const graphClient = createGraphClient({
      clientId: 'dummy', // Not used when providing token directly
      accessToken: accessToken
    });
    
    console.log(`Searching for files matching: "${searchQuery}"...`);
    const searchResults = await graphClient.searchFiles(searchQuery);
    
    console.log('\nSearch Results:');
    console.log('==============');
    
    if (searchResults.length === 0) {
      console.log('No files found matching your search criteria.');
    } else {
      console.log(`Found ${searchResults.length} files:`);
      searchResults.forEach((file, index) => {
        console.log(`\n[${index + 1}] ${file.name}`);
        console.log(`  ID: ${file.id}`);
        console.log(`  URL: ${file.url}`);
        console.log(`  Last Modified: ${file.lastModified}`);
        console.log(`  Size: ${file.size !== undefined ? `${Math.round(file.size / 1024)} KB` : 'Unknown'}`);
        console.log(`  Type: ${file.mimeType || 'Unknown'}`);
      });
    }
    
    console.log('\nOperation completed successfully.');
  } catch (error) {
    console.error('ERROR:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testSearchFiles();