## To run

0. **Install dependencies**
   ```sh
   npm install @modelcontextprotocol/sdk zod@3
   npm install -D @types/node typescript
   ```

1. **Build the project**
   ```sh
   npm run build
   node build/index.js
   ```

(ignore following steps if running local client)


2. **Navigate to MCP config update file**

   
   For Claude Desktop:
   
         C:\Users\saskiagilmer\AppData\Roaming\Claude\claude_desktop_config.json

   For VSCode:
   
         C:\Users\saskiagilmer\AppData\Roaming\Code\User\mcp.json
   
4. **Paste this text**
      ```
   {
     "mcpServers": {
       "weather-memory-server": {
         "command": "node",
         "args": ["C:/Users/saskiagilmer/source/repos/mcp-server/build/index.js",
           "-y",
           "@modelcontextprotocol/server-memory"],
         "env": {
           "MEMORY_FILE_PATH": "/Users/saskiagilmer/Documents/custom/memory.json",
           "ALLOWED_DIRECTORIES": "C:/Users/saskiagilmer/Documents,C:/Users/saskiagilmer/source/repos"
         }
       }
   }
      ```

   **Configuration Options:**
   - `MEMORY_FILE_PATH`: Path to the memory.json file for knowledge graph storage
   - `ALLOWED_DIRECTORIES`: Comma-separated list of directories the server can access, or JSON array format like `["C:/path1", "C:/path2"]`
5. **For any updates, kill all Claude Desktop processes**
   
     Do this in Task Manager so you can kill background processes too
