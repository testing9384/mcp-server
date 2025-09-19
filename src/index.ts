import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  setAllowedDirectories,
  getAllowedDirectories,
  validatePath,
  getFileStats,
  readFileContent,
  writeFileContent,
  applyFileEdits,
  tailFile,
  headFile,
  searchFilesWithValidation,
  formatSize
} from './filesystem-utils.js';
import {
  MicrosoftGraphClient,
  createGraphClient,
  isValidAccessToken,
  GraphAuthConfig,
  GraphFileResult
} from './microsoft-graph-utils.js';

// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.json');

// If MEMORY_FILE_PATH is just a filename, put it in the same directory as the script
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
  ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
    ? process.env.MEMORY_FILE_PATH
    : path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.MEMORY_FILE_PATH)
  : defaultMemoryPath;

// Helper function to parse allowed directories from environment variable
function parseAllowedDirectories(envVar: string | undefined): string[] {
  if (!envVar) {
    return [];
  }

  // Try to parse as JSON array first
  try {
    const parsed = JSON.parse(envVar);
    if (Array.isArray(parsed)) {
      return parsed.map((dir: any) => {
        const dirStr = String(dir);
        // Resolve relative paths to absolute paths
        return path.isAbsolute(dirStr) ? dirStr : path.resolve(dirStr);
      });
    }
  } catch {
    // If JSON parsing fails, treat as comma-separated string
  }

  // Parse as comma-separated string
  return envVar
    .split(',')
    .map(dir => dir.trim())
    .filter(dir => dir.length > 0)
    .map(dir => {
      // Resolve relative paths to absolute paths
      return path.isAbsolute(dir) ? dir : path.resolve(dir);
    });
}


// Helper to create a new MCP server instance with all resources/tools
function getServer() {
  const server = new Server({
    name: "open-context",
    version: "1.0.0",
  }, {
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "create_entities",
          description: "Create multiple new entities in the knowledge graph",
          inputSchema: {
            type: "object",
            properties: {
              entities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "The name of the entity" },
                    entityType: { type: "string", description: "The type of the entity" },
                    observations: {
                      type: "array",
                      items: { type: "string" },
                      description: "An array of observation contents associated with the entity"
                    },
                  },
                  required: ["name", "entityType", "observations"],
                },
              },
            },
            required: ["entities"],
          },
        },
        {
          name: "create_relations",
          description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
          inputSchema: {
            type: "object",
            properties: {
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string", description: "The name of the entity where the relation starts" },
                    to: { type: "string", description: "The name of the entity where the relation ends" },
                    relationType: { type: "string", description: "The type of the relation" },
                    weight: { type: "number", description: "A number between 1 and 5 inclusive that represents how strongly two nodes are related", minimum: 1, maximum: 5 },
                  },
                  required: ["from", "to", "relationType", "weight"],
                },
              },
            },
            required: ["relations"],
          },
        },
        {
          name: "add_observations",
          description: "Add new observations to existing entities in the knowledge graph",
          inputSchema: {
            type: "object",
            properties: {
              observations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entityName: { type: "string", description: "The name of the entity to add the observations to" },
                    contents: {
                      type: "array",
                      items: { type: "string" },
                      description: "An array of observation contents to add"
                    },
                  },
                  required: ["entityName", "contents"],
                },
              },
            },
            required: ["observations"],
          },
        },
        {
          name: "delete_entities",
          description: "Delete multiple entities and their associated relations from the knowledge graph",
          inputSchema: {
            type: "object",
            properties: {
              entityNames: {
                type: "array",
                items: { type: "string" },
                description: "An array of entity names to delete"
              },
            },
            required: ["entityNames"],
          },
        },
        {
          name: "delete_observations",
          description: "Delete specific observations from entities in the knowledge graph",
          inputSchema: {
            type: "object",
            properties: {
              deletions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    entityName: { type: "string", description: "The name of the entity containing the observations" },
                    observations: {
                      type: "array",
                      items: { type: "string" },
                      description: "An array of observations to delete"
                    },
                  },
                  required: ["entityName", "observations"],
                },
              },
            },
            required: ["deletions"],
          },
        },
        {
          name: "delete_relations",
          description: "Delete multiple relations from the knowledge graph",
          inputSchema: {
            type: "object",
            properties: {
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string", description: "The name of the entity where the relation starts" },
                    to: { type: "string", description: "The name of the entity where the relation ends" },
                    relationType: { type: "string", description: "The type of the relation" },
                    weight: { type: "number", description: "A number between 1 and 5 inclusive that represents how strongly two nodes are related", minimum: 1, maximum: 5 },
                  },
                  required: ["from", "to", "relationType", "weight"],
                },
                description: "An array of relations to delete"
              },
            },
            required: ["relations"],
          },
        },
        {
          name: "read_graph",
          description: "Read the entire knowledge graph",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "search_nodes",
          description: "Search for nodes in the knowledge graph based on a query",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query to match against entity names, types, and observation content" },
            },
            required: ["query"],
          },
        },
        {
          name: "open_nodes",
          description: "Open specific nodes in the knowledge graph by their names",
          inputSchema: {
            type: "object",
            properties: {
              names: {
                type: "array",
                items: { type: "string" },
                description: "An array of entity names to retrieve",
              },
            },
            required: ["names"],
          },
        },
        // Filesystem tools
        {
          name: "list_allowed_directories",
          description: "Returns the list of directories that this server is allowed to access. Subdirectories within these allowed directories are also accessible. Use this to understand which directories and their nested paths are available before trying to access files.",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        {
          name: "list_directory",
          description: "Get a detailed listing of all files and directories in a specified path. Results clearly distinguish between files and directories with [FILE] and [DIR] prefixes. This tool is essential for understanding directory structure and finding specific files within a directory. Only works within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" }
            },
            required: ["path"],
          },
        },
        {
          name: "list_directory_with_sizes",
          description: "Get a detailed listing of all files and directories in a specified path, including sizes. Results clearly distinguish between files and directories with [FILE] and [DIR] prefixes. This tool is useful for understanding directory structure and finding specific files within a directory. Only works within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
              sortBy: {
                type: "string",
                enum: ["name", "size"],
                default: "name",
                description: "Sort entries by name or size"
              }
            },
            required: ["path"],
          },
        },
        {
          name: "get_file_info",
          description: "Retrieve detailed metadata about a file or directory. Returns comprehensive information including size, creation time, last modified time, permissions, and type. This tool is perfect for understanding file characteristics without reading the actual content. Only works within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" }
            },
            required: ["path"],
          },
        },
        {
          name: "read_text_file",
          description: "Read the complete contents of a file from the file system as text. Handles various text encodings and provides detailed error messages if the file cannot be read. Use this tool when you need to examine the contents of a single file. Use the 'head' parameter to read only the first N lines of a file, or the 'tail' parameter to read only the last N lines of a file. Operates on the file as text regardless of extension. Only works within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
              head: {
                type: "number",
                description: "If provided, returns only the first N lines of the file"
              },
              tail: {
                type: "number",
                description: "If provided, returns only the last N lines of the file"
              }
            },
            required: ["path"],
          },
        },
        {
          name: "read_multiple_files",
          description: "Read the contents of multiple files simultaneously. This is more efficient than reading files one by one when you need to analyze or compare multiple files. Each file's content is returned with its path as a reference. Failed reads for individual files won't stop the entire operation. Only works within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              paths: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["paths"],
          },
        },
        {
          name: "write_file",
          description: "Create a new file or completely overwrite an existing file with new content. Use with caution as it will overwrite existing files without warning. Handles text content with proper encoding. Only works within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" }
            },
            required: ["path", "content"],
          },
        },
        {
          name: "edit_file",
          description: "Make line-based edits to a text file. Each edit replaces exact line sequences with new content. Returns a git-style diff showing the changes made. Only works within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
              edits: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    oldText: {
                      type: "string",
                      description: "Text to search for - must match exactly"
                    },
                    newText: {
                      type: "string",
                      description: "Text to replace with"
                    }
                  },
                  required: ["oldText", "newText"],
                  additionalProperties: false
                }
              },
              dryRun: {
                type: "boolean",
                default: false,
                description: "Preview changes using git-style diff format"
              }
            },
            required: ["path", "edits"],
          },
        },
        {
          name: "create_directory",
          description: "Create a new directory or ensure a directory exists. Can create multiple nested directories in one operation. If the directory already exists, this operation will succeed silently. Perfect for setting up directory structures for projects or ensuring required paths exist. Only works within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" }
            },
            required: ["path"],
          },
        },
        {
          name: "move_file",
          description: "Move or rename files and directories. Can move files between directories and rename them in a single operation. If the destination exists, the operation will fail. Works across different directories and can be used for simple renaming within the same directory. Both source and destination must be within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              source: { type: "string" },
              destination: { type: "string" }
            },
            required: ["source", "destination"],
          },
        },
        {
          name: "search_files",
          description: "Recursively search for files and directories matching a pattern. Searches through all subdirectories from the starting path. The search is case-insensitive and matches partial names. Returns full paths to all matching items. Great for finding files when you don't know their exact location. Only searches within allowed directories.",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string" },
              pattern: { type: "string" },
              excludePatterns: {
                type: "array",
                items: { type: "string" },
                default: []
              }
            },
            required: ["path", "pattern"],
          },
        },
        // Microsoft Graph tools
        {
          name: "graph_search_files",
          description: "Search for files in Microsoft OneDrive using Microsoft Graph API. Requires an access token to be provided.",
          inputSchema: {
            type: "object",
            properties: {
              accessToken: { type: "string", description: "Microsoft Graph access token with Files.Read permission" },
              query: { type: "string", description: "Search query to find files" },
              top: { type: "number", description: "Maximum number of results to return (default: 25, max: 999)", minimum: 1, maximum: 999 },
              skip: { type: "number", description: "Number of results to skip for pagination", minimum: 0 },
              select: {
                type: "array",
                items: { type: "string" },
                description: "Specific properties to retrieve (e.g., ['name', 'size', 'lastModifiedDateTime'])"
              }
            },
            required: ["accessToken", "query"],
          },
        },
        {
          name: "graph_get_file",
          description: "Get details of a specific file from Microsoft OneDrive by its ID.",
          inputSchema: {
            type: "object",
            properties: {
              accessToken: { type: "string", description: "Microsoft Graph access token with Files.Read permission" },
              fileId: { type: "string", description: "The ID of the file to retrieve" }
            },
            required: ["accessToken", "fileId"],
          },
        },
        {
          name: "graph_list_folder",
          description: "List contents of a folder in Microsoft OneDrive. Use 'root' as folderId for the root folder.",
          inputSchema: {
            type: "object",
            properties: {
              accessToken: { type: "string", description: "Microsoft Graph access token with Files.Read permission" },
              folderId: { type: "string", description: "The ID of the folder to list (use 'root' for root folder)", default: "root" },
              top: { type: "number", description: "Maximum number of results to return", minimum: 1 },
              skip: { type: "number", description: "Number of results to skip for pagination", minimum: 0 },
              orderBy: { type: "string", description: "Property to sort by (e.g., 'name', 'lastModifiedDateTime')" }
            },
            required: ["accessToken"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // Memory/Knowledge graph tool handling
    if (name === "read_graph") {
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2) }] };
    }
    if (!args) {
      throw new Error(`No arguments provided for tool: ${name}`);
    }
    switch (name) {
      case "create_entities":
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createEntities(args.entities as Entity[]), null, 2) }] };
      case "create_relations":
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createRelations(args.relations as Relation[]), null, 2) }] };
      case "add_observations":
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.addObservations(args.observations as { entityName: string; contents: string[] }[]), null, 2) }] };
      case "delete_entities":
        await knowledgeGraphManager.deleteEntities(args.entityNames as string[]);
        return { content: [{ type: "text", text: "Entities deleted successfully" }] };
      case "delete_observations":
        await knowledgeGraphManager.deleteObservations(args.deletions as { entityName: string; observations: string[] }[]);
        return { content: [{ type: "text", text: "Observations deleted successfully" }] };
      case "delete_relations":
        await knowledgeGraphManager.deleteRelations(args.relations as Relation[]);
        return { content: [{ type: "text", text: "Relations deleted successfully" }] };
      case "search_nodes":
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchNodes(args.query as string), null, 2) }] };
      case "open_nodes":
        return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.openNodes(args.names as string[]), null, 2) }] };
      // Filesystem tool handling
      case "list_allowed_directories":
        return { content: [{ type: "text", text: JSON.stringify(getAllowedDirectories(), null, 2) }] };
      case "list_directory": {
        const validatedPath = await validatePath(args.path as string);
        const entries = await fs.readdir(validatedPath, { withFileTypes: true });
        const result = entries.map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file'
        }));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "list_directory_with_sizes": {
        const validatedPath = await validatePath(args.path as string);
        const sortBy = (args.sortBy as string) || "name";
        const entries = await fs.readdir(validatedPath, { withFileTypes: true });
        const entriesWithSizes = await Promise.all(entries.map(async (entry) => {
          const fullPath = path.join(validatedPath, entry.name);
          let size = 0;
          try {
            if (entry.isFile()) {
              const stats = await fs.stat(fullPath);
              size = stats.size;
            }
          } catch {
            // Ignore errors for size calculation
          }
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: entry.isFile() ? formatSize(size) : undefined,
            sizeBytes: size
          };
        }));
        // Sort entries
        if (sortBy === "size") {
          entriesWithSizes.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            if (a.type === 'directory') return a.name.localeCompare(b.name);
            // For files, sort by actual size
            return b.sizeBytes - a.sizeBytes;
          });
        } else {
          entriesWithSizes.sort((a, b) => a.name.localeCompare(b.name));
        }
        // Remove sizeBytes from the response
        const cleanedEntries = entriesWithSizes.map(({ sizeBytes, ...entry }) => entry);
        return { content: [{ type: "text", text: JSON.stringify(cleanedEntries, null, 2) }] };
      }
      case "get_file_info": {
        const validatedPath = await validatePath(args.path as string);
        const info = await getFileStats(validatedPath);
        return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
      }
      case "read_text_file": {
        const validatedPath = await validatePath(args.path as string);
        let content: string;
        if (args.head && typeof args.head === 'number') {
          content = await headFile(validatedPath, args.head);
        } else if (args.tail && typeof args.tail === 'number') {
          content = await tailFile(validatedPath, args.tail);
        } else {
          content = await readFileContent(validatedPath);
        }
        return { content: [{ type: "text", text: content }] };
      }
      case "read_multiple_files": {
        const paths = args.paths as string[];
        const results: Array<{ path: string; content?: string; error?: string }> = [];
        for (const filePath of paths) {
          try {
            const validatedPath = await validatePath(filePath);
            const content = await readFileContent(validatedPath);
            results.push({ path: filePath, content });
          } catch (error) {
            results.push({
              path: filePath,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }
      case "write_file": {
        const validatedPath = await validatePath(args.path as string);
        await writeFileContent(validatedPath, args.content as string);
        return { content: [{ type: "text", text: `Successfully wrote file: ${args.path}` }] };
      }
      case "edit_file": {
        const validatedPath = await validatePath(args.path as string);
        const edits = args.edits as Array<{ oldText: string; newText: string }>;
        const dryRun = args.dryRun as boolean || false;
        const diff = await applyFileEdits(validatedPath, edits, dryRun);
        return { content: [{ type: "text", text: diff }] };
      }
      case "create_directory": {
        const validatedPath = await validatePath(args.path as string);
        await fs.mkdir(validatedPath, { recursive: true });
        return { content: [{ type: "text", text: `Successfully created directory: ${args.path}` }] };
      }
      case "move_file": {
        const validatedSource = await validatePath(args.source as string);
        const validatedDestination = await validatePath(args.destination as string);
        await fs.rename(validatedSource, validatedDestination);
        return { content: [{ type: "text", text: `Successfully moved ${args.source} to ${args.destination}` }] };
      }
      case "search_files": {
        const validatedPath = await validatePath(args.path as string);
        const pattern = args.pattern as string;
        const excludePatterns = (args.excludePatterns as string[]) || [];
        const results = await searchFilesWithValidation(
          validatedPath,
          pattern,
          getAllowedDirectories(),
          { excludePatterns }
        );
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }
      // Microsoft Graph tool handling
      case "graph_search_files": {
        const accessToken = args.accessToken as string;
        const query = args.query as string;
        const top = args.top as number | undefined;
        const skip = args.skip as number | undefined;
        const select = args.select as string[] | undefined;

        if (!isValidAccessToken(accessToken)) {
          throw new Error("Invalid access token provided");
        }

        try {
          const graphClient = createGraphClient({ 
            clientId: "dummy", // clientId not used when providing access token directly
            accessToken 
          });
          
          const results = await graphClient.searchFiles(query, {
            top: top || 25,
            skip,
            select
          });

          return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
        } catch (error) {
          throw new Error(`Microsoft Graph search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      case "graph_get_file": {
        const accessToken = args.accessToken as string;
        const fileId = args.fileId as string;

        if (!isValidAccessToken(accessToken)) {
          throw new Error("Invalid access token provided");
        }

        try {
          const graphClient = createGraphClient({ 
            clientId: "dummy", 
            accessToken 
          });
          
          const file = await graphClient.getFileById(fileId);
          
          if (!file) {
            return { content: [{ type: "text", text: "File not found" }] };
          }

          return { content: [{ type: "text", text: JSON.stringify(file, null, 2) }] };
        } catch (error) {
          throw new Error(`Microsoft Graph file retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      case "graph_list_folder": {
        const accessToken = args.accessToken as string;
        const folderId = (args.folderId as string) || "root";
        const top = args.top as number | undefined;
        const skip = args.skip as number | undefined;
        const orderBy = args.orderBy as string | undefined;

        if (!isValidAccessToken(accessToken)) {
          throw new Error("Invalid access token provided");
        }

        try {
          const graphClient = createGraphClient({ 
            clientId: "dummy", 
            accessToken 
          });
          
          const contents = await graphClient.listFolderContents(folderId, {
            top,
            skip,
            orderBy
          });

          return { content: [{ type: "text", text: JSON.stringify(contents, null, 2) }] };
        } catch (error) {
          throw new Error(`Microsoft Graph folder listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id'],
  allowedHeaders: ['Content-Type', 'mcp-session-id'],
}));

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// POST handler for client-to-server communication
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports[newSessionId] = transport;
      },
      // Uncomment below for local DNS rebinding protection
      // enableDnsRebindingProtection: true,
      // allowedHosts: ['127.0.0.1'],
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    const server = getServer();
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }
  await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// GET for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);
// DELETE for session termination
app.delete('/mcp', handleSessionRequest);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, (error?: any) => {
  if (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
  console.log(`MCP Streamable HTTP Server listening on port ${PORT}`);
});

// We are storing our memory using entities, relations, and observations in a graph structure
interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
  weight: number;
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager {
  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(MEMORY_FILE_PATH, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      return lines.reduce((graph: KnowledgeGraph, line) => {
        const item = JSON.parse(line);
        if (item.type === "entity") graph.entities.push(item as Entity);
        if (item.type === "relation") graph.relations.push(item as Relation);
        return graph;
      }, { entities: [], relations: [] });
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    // Ensure the directory exists before writing the file
    const memoryDir = path.dirname(MEMORY_FILE_PATH);
    await fs.mkdir(memoryDir, { recursive: true });
    
    const lines = [
      ...graph.entities.map(e => JSON.stringify({ type: "entity", ...e })),
      ...graph.relations.map(r => JSON.stringify({ type: "relation", ...r })),
    ];
    await fs.writeFile(MEMORY_FILE_PATH, lines.join("\n"));
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations = relations.filter(r => !graph.relations.some(existingRelation => 
      existingRelation.from === r.from && 
      existingRelation.to === r.to && 
      existingRelation.relationType === r.relationType &&
      existingRelation.weight === r.weight
    ));
    graph.relations.push(...newRelations);
    await this.saveGraph(graph);
    return newRelations;
  }

  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(content => !entity.observations.includes(content));
      entity.observations.push(...newObservations);
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(o => !d.observations.includes(o));
      }
    });
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.relations = graph.relations.filter(r => !relations.some(delRelation => 
      r.from === delRelation.from && 
      r.to === delRelation.to && 
      r.relationType === delRelation.relationType &&
      r.weight === delRelation.weight
    ));
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  // Very basic search function
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      e.observations.some(o => o.toLowerCase().includes(query.toLowerCase()))
    );
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    const filteredGraph: KnowledgeGraph = {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  
    return filteredGraph;
  }
}

const knowledgeGraphManager = new KnowledgeGraphManager();

// Initialize filesystem allowed directories
// Default directories include current working directory and script directory
const defaultAllowedDirs = [
  process.cwd(), // Current working directory
  path.dirname(fileURLToPath(import.meta.url)), // Directory containing this script
];

// Parse user-specified directories from environment variable
const userAllowedDirs = parseAllowedDirectories(process.env.ALLOWED_DIRECTORIES);

// Combine default and user-specified directories, removing duplicates
const allowedDirs = [...new Set([...defaultAllowedDirs, ...userAllowedDirs])];

console.log('Allowed directories:', allowedDirs);
setAllowedDirectories(allowedDirs);
