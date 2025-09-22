#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define path to memory.json
const memoryJsonPath = path.join(__dirname, 'build', 'memory.json');

async function loadGraph() {
  try {
    const data = await fs.readFile(memoryJsonPath, "utf-8");
    const lines = data.split("\n").filter(line => line.trim() !== "");
    return lines.reduce((graph, line) => {
      const item = JSON.parse(line);
      if (item.type === "entity") graph.entities.push(item);
      if (item.type === "relation") graph.relations.push(item);
      return graph;
    }, { entities: [], relations: [] });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === "ENOENT") {
      return { entities: [], relations: [] };
    }
    throw error;
  }
}

async function testReadImplementation() {
  try {
    // Read using the implementation from KnowledgeGraphManager
    const graph = await loadGraph();
    console.log('Read graph using loadGraph implementation:');
    console.log(JSON.stringify(graph, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testReadImplementation();