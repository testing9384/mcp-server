// Comprehensive MCP server test
import http from 'http';

function makeRequest(data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('Making request with options:', options);
    console.log('Request body:', postData);

    const req = http.request(options, (res) => {
      console.log(`Status Code: ${res.statusCode}`);
      console.log('Response Headers:', res.headers);

      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        console.log('Response Body:', responseBody);
        try {
          const parsed = JSON.parse(responseBody);
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
        }
      });
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function testMCPServer() {
  try {
    console.log('=== Testing MCP Server ===\n');

    // Test 1: Initialize request
    console.log('1. Testing initialize request...');
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0"
        }
      }
    };

    const initResponse = await makeRequest(initRequest);
    console.log('Initialize response status:', initResponse.statusCode);
    
    if (initResponse.statusCode !== 200) {
      console.error('❌ Initialize failed with status:', initResponse.statusCode);
      return;
    }

    // Extract session ID from response headers
    const sessionId = initResponse.headers['mcp-session-id'];
    console.log('Session ID:', sessionId);

    if (!sessionId) {
      console.error('❌ No session ID received');
      return;
    }

    console.log('✅ Initialize successful!\n');

    // Test 2: List tools
    console.log('2. Testing tools/list request...');
    const toolsRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    };

    // Make request with session ID
    const toolsResponse = await makeRequestWithSession(toolsRequest, sessionId);
    console.log('Tools list response status:', toolsResponse.statusCode);
    
    if (toolsResponse.statusCode === 200) {
      console.log('✅ Tools list successful!');
      if (toolsResponse.body && toolsResponse.body.result && toolsResponse.body.result.tools) {
        console.log(`Found ${toolsResponse.body.result.tools.length} tools`);
      }
    } else {
      console.log('❌ Tools list failed');
    }

    // Test 3: Call a simple tool
    console.log('\n3. Testing tool call - list_allowed_directories...');
    const toolCallRequest = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_allowed_directories",
        arguments: {}
      }
    };

    const toolCallResponse = await makeRequestWithSession(toolCallRequest, sessionId);
    console.log('Tool call response status:', toolCallResponse.statusCode);
    
    if (toolCallResponse.statusCode === 200) {
      console.log('✅ Tool call successful!');
    } else {
      console.log('❌ Tool call failed');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

function makeRequestWithSession(data, sessionId) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(postData),
        'mcp-session-id': sessionId
      }
    };

    console.log('Making request with session ID:', sessionId);

    const req = http.request(options, (res) => {
      console.log(`Status Code: ${res.statusCode}`);

      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        console.log('Response Body:', responseBody);
        try {
          const parsed = JSON.parse(responseBody);
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
        }
      });
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

testMCPServer();