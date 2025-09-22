# Microsoft Graph Integration

This MCP server now includes Microsoft Graph API integration for accessing OneDrive files. This allows you to search, list, and retrieve files from Microsoft OneDrive/SharePoint through the Graph API.

## Setup

### Prerequisites

1. **Azure App Registration**: You need an Azure app registration with the following permissions:
   - `Files.Read` (to read files)
   - `Files.ReadWrite` (if you need write access)
   - `User.Read` (basic user profile)

2. **Access Token**: You'll need a valid Microsoft Graph access token with the appropriate permissions.

### Getting an Access Token

#### Option 1: Using Azure CLI (Recommended for development)
```bash
# Install Azure CLI if not already installed
# Then login and get a token
az login
az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv
```

#### Option 2: Using PowerShell with MSAL
```powershell
# Install the MSAL PowerShell module
Install-Module MSAL.PS -Force

# Get token (replace with your client ID and tenant ID)
$token = Get-MsalToken -ClientId "your-client-id" -TenantId "your-tenant-id" -Scopes "https://graph.microsoft.com/Files.Read"
$token.AccessToken
```

#### Option 3: Using your app registration
If you have a properly configured app registration, you can use various authentication flows depending on your scenario.

## Available Tools

### 1. `graph_search_files`
Search for files in OneDrive using a query string.

**Parameters:**
- `accessToken` (required): Microsoft Graph access token
- `query` (required): Search query string
- `top` (optional): Maximum number of results (1-999, default: 25)
- `skip` (optional): Number of results to skip for pagination
- `select` (optional): Array of specific properties to retrieve

**Example:**
```json
{
  "name": "graph_search_files",
  "arguments": {
    "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIs...",
    "query": "presentation",
    "top": 10
  }
}
```

### 2. `graph_get_file`
Get details of a specific file by its ID.

**Parameters:**
- `accessToken` (required): Microsoft Graph access token
- `fileId` (required): The ID of the file to retrieve

**Example:**
```json
{
  "name": "graph_get_file",
  "arguments": {
    "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIs...",
    "fileId": "01BYE5RZ56Y2GOVW7725BZO354PWSELRRZ"
  }
}
```

### 3. `graph_list_folder`
List contents of a folder in OneDrive.

**Parameters:**
- `accessToken` (required): Microsoft Graph access token
- `folderId` (optional): The ID of the folder to list (default: "root")
- `top` (optional): Maximum number of results to return
- `skip` (optional): Number of results to skip for pagination
- `orderBy` (optional): Property to sort by (e.g., "name", "lastModifiedDateTime")

**Example:**
```json
{
  "name": "graph_list_folder",
  "arguments": {
    "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIs...",
    "folderId": "root",
    "top": 20,
    "orderBy": "lastModifiedDateTime"
  }
}
```

### 4. `graph_read_text_file`
Read a text file's content from OneDrive.

**Parameters:**
- `accessToken` (required): Microsoft Graph access token
- `fileId` (required): The ID of the file to read
- `encoding` (optional): Text encoding to use (default: "utf8")

**Example:**
```json
{
  "name": "graph_read_text_file",
  "arguments": {
    "accessToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIs...",
    "fileId": "01BYE5RZ56Y2GOVW7725BZO354PWSELRRZ"
  }
}
```

## Response Format

All tools return file information in the following format:

```json
{
  "id": "file-id",
  "name": "filename.ext",
  "url": "https://onedrive.live.com/...",
  "lastModified": "2023-12-01T10:30:00Z",
  "size": 1024,
  "mimeType": "application/pdf"
}
```

## Security Notes

1. **Access Tokens**: Never log or expose access tokens. They provide access to user data.
2. **Token Expiration**: Access tokens typically expire after 1 hour. You'll need to refresh them or obtain new ones.
3. **Permissions**: Only request the minimum permissions needed for your use case.
4. **Environment Variables**: Consider storing sensitive configuration in environment variables rather than hard-coding them.

## Error Handling

The tools will return descriptive error messages for common issues:
- Invalid access tokens
- Network connectivity issues
- Missing permissions
- File not found errors
- API rate limiting

## Rate Limits

Microsoft Graph API has rate limits. For most scenarios, you're allowed:
- 10,000 requests per 10 minutes per application
- Specific limits may vary by endpoint and tenant configuration

If you hit rate limits, the tools will return appropriate error messages, and you should implement retry logic with exponential backoff.