import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setAllowedDirectories, getAllowedDirectories, validatePath, getFileStats, readFileContent, writeFileContent, applyFileEdits, tailFile, headFile, searchFilesWithValidation, formatSize } from './filesystem-utils.js';
// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.json');
// If MEMORY_FILE_PATH is just a filename, put it in the same directory as the script
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
    ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
        ? process.env.MEMORY_FILE_PATH
        : path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.MEMORY_FILE_PATH)
    : defaultMemoryPath;
// Helper function to parse allowed directories from environment variable
function parseAllowedDirectories(envVar) {
    if (!envVar) {
        return [];
    }
    // Try to parse as JSON array first
    try {
        const parsed = JSON.parse(envVar);
        if (Array.isArray(parsed)) {
            return parsed.map((dir) => {
                const dirStr = String(dir);
                // Resolve relative paths to absolute paths
                return path.isAbsolute(dirStr) ? dirStr : path.resolve(dirStr);
            });
        }
    }
    catch {
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
// Create unified server instance
const server = new Server({
    name: "open-context",
    version: "1.0.0",
}, {
    capabilities: {
        resources: {},
        tools: {},
    },
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Open Context MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager {
    async loadGraph() {
        try {
            const data = await fs.readFile(MEMORY_FILE_PATH, "utf-8");
            const lines = data.split("\n").filter(line => line.trim() !== "");
            return lines.reduce((graph, line) => {
                const item = JSON.parse(line);
                if (item.type === "entity")
                    graph.entities.push(item);
                if (item.type === "relation")
                    graph.relations.push(item);
                return graph;
            }, { entities: [], relations: [] });
        }
        catch (error) {
            if (error instanceof Error && 'code' in error && error.code === "ENOENT") {
                return { entities: [], relations: [] };
            }
            throw error;
        }
    }
    async saveGraph(graph) {
        const lines = [
            ...graph.entities.map(e => JSON.stringify({ type: "entity", ...e })),
            ...graph.relations.map(r => JSON.stringify({ type: "relation", ...r })),
        ];
        await fs.writeFile(MEMORY_FILE_PATH, lines.join("\n"));
    }
    async createEntities(entities) {
        const graph = await this.loadGraph();
        const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
        graph.entities.push(...newEntities);
        await this.saveGraph(graph);
        return newEntities;
    }
    async createRelations(relations) {
        const graph = await this.loadGraph();
        const newRelations = relations.filter(r => !graph.relations.some(existingRelation => existingRelation.from === r.from &&
            existingRelation.to === r.to &&
            existingRelation.relationType === r.relationType));
        graph.relations.push(...newRelations);
        await this.saveGraph(graph);
        return newRelations;
    }
    async addObservations(observations) {
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
    async deleteEntities(entityNames) {
        const graph = await this.loadGraph();
        graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
        graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
        await this.saveGraph(graph);
    }
    async deleteObservations(deletions) {
        const graph = await this.loadGraph();
        deletions.forEach(d => {
            const entity = graph.entities.find(e => e.name === d.entityName);
            if (entity) {
                entity.observations = entity.observations.filter(o => !d.observations.includes(o));
            }
        });
        await this.saveGraph(graph);
    }
    async deleteRelations(relations) {
        const graph = await this.loadGraph();
        graph.relations = graph.relations.filter(r => !relations.some(delRelation => r.from === delRelation.from &&
            r.to === delRelation.to &&
            r.relationType === delRelation.relationType));
        await this.saveGraph(graph);
    }
    async readGraph() {
        return this.loadGraph();
    }
    // Very basic search function
    async searchNodes(query) {
        const graph = await this.loadGraph();
        // Filter entities
        const filteredEntities = graph.entities.filter(e => e.name.toLowerCase().includes(query.toLowerCase()) ||
            e.entityType.toLowerCase().includes(query.toLowerCase()) ||
            e.observations.some(o => o.toLowerCase().includes(query.toLowerCase())));
        // Create a Set of filtered entity names for quick lookup
        const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
        // Filter relations to only include those between filtered entities
        const filteredRelations = graph.relations.filter(r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to));
        const filteredGraph = {
            entities: filteredEntities,
            relations: filteredRelations,
        };
        return filteredGraph;
    }
    async openNodes(names) {
        const graph = await this.loadGraph();
        // Filter entities
        const filteredEntities = graph.entities.filter(e => names.includes(e.name));
        // Create a Set of filtered entity names for quick lookup
        const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
        // Filter relations to only include those between filtered entities
        const filteredRelations = graph.relations.filter(r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to));
        const filteredGraph = {
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
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            // Memory/Knowledge graph tools
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
                                },
                                required: ["from", "to", "relationType"],
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
                                },
                                required: ["from", "to", "relationType"],
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
            return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createEntities(args.entities), null, 2) }] };
        case "create_relations":
            return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createRelations(args.relations), null, 2) }] };
        case "add_observations":
            return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.addObservations(args.observations), null, 2) }] };
        case "delete_entities":
            await knowledgeGraphManager.deleteEntities(args.entityNames);
            return { content: [{ type: "text", text: "Entities deleted successfully" }] };
        case "delete_observations":
            await knowledgeGraphManager.deleteObservations(args.deletions);
            return { content: [{ type: "text", text: "Observations deleted successfully" }] };
        case "delete_relations":
            await knowledgeGraphManager.deleteRelations(args.relations);
            return { content: [{ type: "text", text: "Relations deleted successfully" }] };
        case "search_nodes":
            return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchNodes(args.query), null, 2) }] };
        case "open_nodes":
            return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.openNodes(args.names), null, 2) }] };
        // Filesystem tool handling
        case "list_allowed_directories":
            return { content: [{ type: "text", text: JSON.stringify(getAllowedDirectories(), null, 2) }] };
        case "list_directory":
            {
                const validatedPath = await validatePath(args.path);
                const entries = await fs.readdir(validatedPath, { withFileTypes: true });
                const result = entries.map(entry => ({
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file'
                }));
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
        case "list_directory_with_sizes":
            {
                const validatedPath = await validatePath(args.path);
                const sortBy = args.sortBy || "name";
                const entries = await fs.readdir(validatedPath, { withFileTypes: true });
                const entriesWithSizes = await Promise.all(entries.map(async (entry) => {
                    const fullPath = path.join(validatedPath, entry.name);
                    let size = 0;
                    try {
                        if (entry.isFile()) {
                            const stats = await fs.stat(fullPath);
                            size = stats.size;
                        }
                    }
                    catch {
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
                        if (a.type === 'directory')
                            return a.name.localeCompare(b.name);
                        // For files, sort by actual size
                        return b.sizeBytes - a.sizeBytes;
                    });
                }
                else {
                    entriesWithSizes.sort((a, b) => a.name.localeCompare(b.name));
                }
                // Remove sizeBytes from the response
                const cleanedEntries = entriesWithSizes.map(({ sizeBytes, ...entry }) => entry);
                return { content: [{ type: "text", text: JSON.stringify(cleanedEntries, null, 2) }] };
            }
        case "get_file_info":
            {
                const validatedPath = await validatePath(args.path);
                const info = await getFileStats(validatedPath);
                return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
            }
        case "read_text_file":
            {
                const validatedPath = await validatePath(args.path);
                let content;
                if (args.head && typeof args.head === 'number') {
                    content = await headFile(validatedPath, args.head);
                }
                else if (args.tail && typeof args.tail === 'number') {
                    content = await tailFile(validatedPath, args.tail);
                }
                else {
                    content = await readFileContent(validatedPath);
                }
                return { content: [{ type: "text", text: content }] };
            }
        case "read_multiple_files":
            {
                const paths = args.paths;
                const results = [];
                for (const filePath of paths) {
                    try {
                        const validatedPath = await validatePath(filePath);
                        const content = await readFileContent(validatedPath);
                        results.push({ path: filePath, content });
                    }
                    catch (error) {
                        results.push({
                            path: filePath,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
                return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
            }
        case "write_file":
            {
                const validatedPath = await validatePath(args.path);
                await writeFileContent(validatedPath, args.content);
                return { content: [{ type: "text", text: `Successfully wrote file: ${args.path}` }] };
            }
        case "edit_file":
            {
                const validatedPath = await validatePath(args.path);
                const edits = args.edits;
                const dryRun = args.dryRun || false;
                const diff = await applyFileEdits(validatedPath, edits, dryRun);
                return { content: [{ type: "text", text: diff }] };
            }
        case "create_directory":
            {
                const validatedPath = await validatePath(args.path);
                await fs.mkdir(validatedPath, { recursive: true });
                return { content: [{ type: "text", text: `Successfully created directory: ${args.path}` }] };
            }
        case "move_file":
            {
                const validatedSource = await validatePath(args.source);
                const validatedDestination = await validatePath(args.destination);
                await fs.rename(validatedSource, validatedDestination);
                return { content: [{ type: "text", text: `Successfully moved ${args.source} to ${args.destination}` }] };
            }
        case "search_files":
            {
                const validatedPath = await validatePath(args.path);
                const pattern = args.pattern;
                const excludePatterns = args.excludePatterns || [];
                const results = await searchFilesWithValidation(validatedPath, pattern, getAllowedDirectories(), { excludePatterns });
                return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
            }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});
