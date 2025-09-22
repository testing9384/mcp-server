#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define path to memory.json
const memoryJsonPath = path.join(__dirname, 'build', 'memory.json');

async function testMemoryFormat() {
  try {
    // Entity to add
    const entity = {
      type: "entity",
      name: "Test Entity",
      entityType: "Test",
      observations: ["This is a test observation"]
    };

    // Relation to add
    const relation = {
      type: "relation",
      from: "Test Entity",
      to: "Test Entity",
      relationType: "self-references",
      weight: 5
    };

    // Create the JSON lines format
    const lines = [
      JSON.stringify(entity),
      JSON.stringify(relation)
    ].join('\n');

    // Write to memory.json
    await fs.writeFile(memoryJsonPath, lines);
    console.log('Successfully wrote test data to memory.json');

    // Read and validate
    const content = await fs.readFile(memoryJsonPath, 'utf-8');
    console.log('Current memory.json content:');
    console.log(content);
  } catch (error) {
    console.error('Error:', error);
  }
}

testMemoryFormat();