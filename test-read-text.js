// Test script for reading a text file from OneDrive
// Usage: node test-read-text.js <accessToken> <fileId>

import { createGraphClient } from './build/microsoft-graph-utils.js';

async function testReadTextFile() {
  if (process.argv.length < 4) {
    console.error('Usage: node test-read-text.js <accessToken> <fileId>');
    process.exit(1);
  }

  const accessToken = process.argv[2];
  const fileId = process.argv[3];
  
  try {
    console.log('Initializing Microsoft Graph client...');
    const graphClient = createGraphClient({
      clientId: 'dummy', // Not used when providing token directly
      accessToken: accessToken
    });
    
    console.log(`Getting file information for ID: ${fileId}`);
    const fileInfo = await graphClient.getFileById(fileId);
    console.log('File information:', fileInfo);
    
    console.log('Reading file content as text...');
    const content = await graphClient.readTextFile(fileId);
    
    console.log('\nFile content:');
    console.log('==============');
    console.log(content);
    console.log('==============');
    
    console.log('\nOperation completed successfully.');
  } catch (error) {
    console.error('ERROR:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testReadTextFile();