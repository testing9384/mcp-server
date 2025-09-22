import fetch from 'node-fetch';

const createEntity = async () => {
  try {
    // Initialize a session
    const initResponse = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          capabilities: {}
        }
      })
    });
    
    const initData = await initResponse.json();
    const sessionId = initResponse.headers.get('mcp-session-id');
    
    console.log('Session initialized with ID:', sessionId);
    
    // Create an entity
    const createEntityResponse = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'callTool',
        params: {
          name: 'create_entities',
          arguments: {
            entities: [
              {
                name: 'Test Entity',
                entityType: 'Test',
                observations: ['This is a test observation']
              }
            ]
          }
        }
      })
    });
    
    const createEntityData = await createEntityResponse.json();
    console.log('Entity creation response:', JSON.stringify(createEntityData, null, 2));
    
    // Read the graph to verify
    const readGraphResponse = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'callTool',
        params: {
          name: 'read_graph',
          arguments: {}
        }
      })
    });
    
    const readGraphData = await readGraphResponse.json();
    console.log('Graph data:', JSON.stringify(readGraphData, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
};

createEntity();