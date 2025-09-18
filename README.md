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




2. **Navigate to MCP config update file**


   For VSCode:
   
         C:\Users\saskiagilmer\AppData\Roaming\Code\User\mcp.json
   
4. **Paste this text**
      ```
   {
        "servers": {
      		"open-context": {
      			"type": "http",
      			"url": "http://localhost:3000/mcp"
             },
          }
   }
      ```

   **Configuration Options:**
   - `MEMORY_FILE_PATH`: Path to the memory.json file for knowledge graph storage
   - `ALLOWED_DIRECTORIES`: Comma-separated list of directories the server can access, or JSON array format like `["C:/path1", "C:/path2"]`
  
     
   Run these directly in the Powershell terminal. For example:
      ```
     "MEMORY_FILE_PATH": "/Users/saskiagilmer/Documents/custom_vs_code/test0/memory.json",
      ```

## Appendix
For STDIO servers, follow the same steps in VCCode but paste this text instead:
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
   For Claude Desktop, you can find the config file here (only STDIO supported):
   
         C:\Users\saskiagilmer\AppData\Roaming\Claude\claude_desktop_config.json
 **For any updates, kill all Claude Desktop processes**
   
     Do this in Task Manager so you can kill background processes too

