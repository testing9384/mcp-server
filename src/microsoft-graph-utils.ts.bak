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
   * @param options Optional search parameters
   * @returns Array of matching files
   */
  async searchFiles(query: string, options?: {
    top?: number;
    skip?: number;
    select?: string[];
  }): Promise<GraphFileResult[]> {
    if (!this.client) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      // Build the API endpoint
      let apiPath = `/me/drive/root/search(q='${encodeURIComponent(query)}')`;
      
      const queryParams: string[] = [];
      
      if (options?.top) {
        queryParams.push(`$top=${options.top}`);
      }
      
      if (options?.skip) {
        queryParams.push(`$skip=${options.skip}`);
      }
      
      if (options?.select && options.select.length > 0) {
        queryParams.push(`$select=${options.select.join(',')}`);
      }
      
      if (queryParams.length > 0) {
        apiPath += `?${queryParams.join('&')}`;
      }

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
   * @param options Optional parameters
   * @returns Array of files and folders
   */
  async listFolderContents(folderId: string = 'root', options?: {
    top?: number;
    skip?: number;
    orderBy?: string;
  }): Promise<GraphFileResult[]> {
    if (!this.client) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      let apiPath = `/me/drive/items/${folderId}/children`;
      
      const queryParams: string[] = [];
      
      if (options?.top) {
        queryParams.push(`$top=${options.top}`);
      }
      
      if (options?.skip) {
        queryParams.push(`$skip=${options.skip}`);
      }
      
      if (options?.orderBy) {
        queryParams.push(`$orderby=${options.orderBy}`);
      }
      
      if (queryParams.length > 0) {
        apiPath += `?${queryParams.join('&')}`;
      }

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
  return Boolean(token && token.trim().length > 0 && !token.includes(' '));
}