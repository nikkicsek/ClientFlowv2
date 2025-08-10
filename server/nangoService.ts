import { Nango } from '@nangohq/node';

if (!process.env.NANGO_SECRET_KEY) {
  throw new Error("NANGO_SECRET_KEY environment variable must be set");
}

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY });

export interface FacebookConnection {
  connectionId: string;
  providerConfigKey: string;
  accountId: string;
  accountName: string;
}

export interface FacebookAdsData {
  campaigns: any[];
  adSets: any[];
  ads: any[];
  insights: any[];
}

export class NangoService {
  
  /**
   * Create a Facebook OAuth connection for a client
   */
  async createFacebookConnection(connectionId: string, userId: string) {
    try {
      const authUrl = nango.auth.getAuthUrl({
        providerConfigKey: 'facebook',
        connectionId: connectionId,
        userScope: ['ads_read', 'ads_management', 'read_insights'],
        metadata: { user_id: userId }
      });
      
      return { authUrl, connectionId };
    } catch (error) {
      console.error('Error creating Facebook connection:', error);
      throw new Error('Failed to create Facebook connection');
    }
  }

  /**
   * Get Facebook connection status
   */
  async getConnectionStatus(connectionId: string): Promise<boolean> {
    try {
      const connection = await nango.getConnection('facebook', connectionId);
      return !!connection;
    } catch (error) {
      console.error('Error checking connection status:', error);
      return false;
    }
  }

  /**
   * Fetch Facebook Ads data for a connection
   */
  async getFacebookAdsData(connectionId: string): Promise<FacebookAdsData> {
    try {
      // Get campaigns
      const campaignsResult = await nango.triggerAction({
        providerConfigKey: 'facebook',
        connectionId,
        actionName: 'get-campaigns'
      });
      
      // Get ad sets
      const adSetsResult = await nango.triggerAction({
        providerConfigKey: 'facebook',
        connectionId,
        actionName: 'get-adsets'
      });

      // Get synced ads data
      const adsResult = await nango.getRecords({
        providerConfigKey: 'facebook',
        connectionId,
        model: 'FacebookAd'
      });

      // Get insights data
      const insightsResult = await nango.getRecords({
        providerConfigKey: 'facebook',
        connectionId,
        model: 'FacebookInsight'
      });

      return {
        campaigns: campaignsResult?.data || [],
        adSets: adSetsResult?.data || [],
        ads: adsResult?.records || [],
        insights: insightsResult?.records || []
      };
    } catch (error) {
      console.error('Error fetching Facebook ads data:', error);
      throw new Error('Failed to fetch Facebook ads data');
    }
  }

  /**
   * Delete a Facebook connection
   */
  async deleteFacebookConnection(connectionId: string): Promise<void> {
    try {
      await nango.deleteConnection('facebook', connectionId);
    } catch (error) {
      console.error('Error deleting Facebook connection:', error);
      throw new Error('Failed to delete Facebook connection');
    }
  }

  /**
   * Get all connections for a user
   */
  async getUserConnections(userId: string): Promise<FacebookConnection[]> {
    try {
      const connectionsResult = await nango.listConnections();
      const connections = connectionsResult.connections || [];
      
      return connections
        .filter((conn: any) => conn.metadata?.user_id === userId)
        .map((conn: any) => ({
          connectionId: conn.connection_id,
          providerConfigKey: conn.provider_config_key,
          accountId: conn.account_id || '',
          accountName: conn.account_name || 'Facebook Account'
        }));
    } catch (error) {
      console.error('Error getting user connections:', error);
      return [];
    }
  }

  /**
   * Trigger manual sync for Facebook data
   */
  async triggerSync(connectionId: string, syncName: string): Promise<void> {
    try {
      await nango.triggerSync({
        providerConfigKey: 'facebook',
        connectionIds: [connectionId],
        syncName: syncName
      });
    } catch (error) {
      console.error(`Error triggering ${syncName} sync:`, error);
      throw new Error(`Failed to trigger ${syncName} sync`);
    }
  }
}

export const nangoService = new NangoService();