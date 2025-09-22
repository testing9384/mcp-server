import { Client, AuthProvider } from '@microsoft/microsoft-graph-client';
import { AuthenticationResult, PublicClientApplication, Configuration } from '@azure/msal-node';

export interface GraphFileResult {
  name: string;
  url: string;
  lastModified: string;
  size?: number;
  mimeType?: string;
  id: string;
}

export interface GraphAuthConfig {
  clientId: string;
  tenantId?: string;
  accessToken?: string;
}

export class MicrosoftGraphClient {
  private client: Client | null = null;
  private config: GraphAuthConfig;

  constructor(config: GraphAuthConfig) {
    this.config = config;
    this.initializeClient();
  }

  private initializeClient(): void {
    if (this.config.accessToken) {
      // Use provided access token
      const authProvider: AuthProvider = (done) => {
        done(null, this.config.accessToken!);
      };

      this.client = Client.init({
        authProvider: authProvider
      });
    } else {
      throw new Error('Access token is required for Microsoft Graph authentication');
    }
  }

  /**
   * Search for files in the user's OneDrive
   * @param query The search query string
   * @returns Array of matching files
   */
  async searchFiles(query: string): Promise<GraphFileResult[]> {
    if (!this.client) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      // Build the API endpoint
      let apiPath = `/me/drive/root/search(q='${encodeURIComponent(query)}')`;
      

      const result = await this.client.api(apiPath).get();
      
      return result.value.map((file: any) => ({
        id: file.id,
        name: file.name,
        url: file.webUrl,
        lastModified: file.lastModifiedDateTime,
        size: file.size,
        mimeType: file.file?.mimeType,
      }));
    } catch (error) {
      throw new Error(`Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get details of a specific file by ID
   * @param fileId The ID of the file
   * @returns File details
   */
  async getFileById(fileId: string): Promise<GraphFileResult | null> {
    if (!this.client) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      const file = await this.client.api(`/me/drive/items/${fileId}`).get();
      
      return {
        id: file.id,
        name: file.name,
        url: file.webUrl,
        lastModified: file.lastModifiedDateTime,
        size: file.size,
        mimeType: file.file?.mimeType,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw new Error(`Failed to get file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List files in a specific folder
   * @param folderId The ID of the folder (use 'root' for root folder)
   * @returns Array of files and folders
   */
  async listFolderContents(folderId: string = 'root'): Promise<GraphFileResult[]> {
    if (!this.client) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      let apiPath = `/me/drive/items/${folderId}/children`;
      

      const result = await this.client.api(apiPath).get();
      
      return result.value.map((item: any) => ({
        id: item.id,
        name: item.name,
        url: item.webUrl,
        lastModified: item.lastModifiedDateTime,
        size: item.size,
        mimeType: item.file?.mimeType || (item.folder ? 'folder' : undefined),
      }));
    } catch (error) {
      throw new Error(`Failed to list folder contents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download file content
   * @param fileId The ID of the file
   * @returns File content as buffer
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      const content = await this.client.api(`/me/drive/items/${fileId}/content`).get();
      return content;
    } catch (error) {
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Read text file content from OneDrive
   * @param fileId The ID of the file to read
   * @returns File content as text
   */
  async readTextFile(fileId: string): Promise<string> {
    if (!this.client) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      // First get the file metadata to check if it's a text file
      const fileInfo = await this.getFileById(fileId);
      if (!fileInfo) {
        throw new Error('File not found');
      }

      // Verify it's a text file by MIME type if available
      if (
        fileInfo.mimeType &&
        !fileInfo.mimeType.startsWith('text/') &&
        !fileInfo.mimeType.includes('json') &&
        !fileInfo.mimeType.includes('xml') &&
        !fileInfo.mimeType.includes('javascript') &&
        !fileInfo.mimeType.includes('markdown') &&
        !fileInfo.mimeType.includes('csv')
      ) {
        console.warn(`File may not be a text file. MIME type: ${fileInfo.mimeType}`);
      }

      // Download file content as buffer
      const buffer = await this.downloadFile(fileId);

      // Convert buffer to string with specified encoding
      return buffer.toString('utf8');
    } catch (error) {
      throw new Error(`Failed to read text file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Factory function to create a Microsoft Graph client instance
 * @param config Authentication configuration
 * @returns MicrosoftGraphClient instance
 */
export function createGraphClient(config: GraphAuthConfig): MicrosoftGraphClient {
  return new MicrosoftGraphClient(config);
}

/**
 * Helper function to validate access token format
 * @param token The access token to validate
 * @returns boolean indicating if token appears valid
 */
export function isValidAccessToken(token: string): boolean {
  // Ensure token is present
  if (!token || token.trim().length === 0) {
    console.log('Token validation failed: Token is empty');
    return false;
  }
  
  // Accept any non-empty token as valid
  return true;
}