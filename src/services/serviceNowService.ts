import { supabase } from "@/integrations/supabase/client";
import { KnowledgeArticle, Incident, ConversationContext } from "@/types/chat";

export class ServiceNowService {
  async getArticleCount(): Promise<number> {
    const { data, error } = await supabase.functions.invoke('servicenow-api', {
      body: { action: 'getArticleCount' }
    });
    
    if (error) throw new Error(error.message);
    console.log('Article count response:', data);
    // ServiceNow stats API returns count as string in result.stats.count
    return parseInt(data?.result?.stats?.count || '0', 10);
  }

  async getIncidentCount(): Promise<number> {
    const { data, error } = await supabase.functions.invoke('servicenow-api', {
      body: { action: 'getIncidentCount' }
    });
    
    if (error) throw new Error(error.message);
    console.log('Incident count response:', data);
    return parseInt(data?.result?.stats?.count || '0', 10);
  }

  async getCatalogItemCount(): Promise<number> {
    const { data, error } = await supabase.functions.invoke('servicenow-api', {
      body: { action: 'getCatalogItemCount' }
    });
    
    if (error) throw new Error(error.message);
    console.log('Catalog item count response:', data);
    return parseInt(data?.result?.stats?.count || '0', 10);
  }

  async getArticleByNumber(number: string): Promise<KnowledgeArticle | null> {
    const { data, error } = await supabase.functions.invoke('servicenow-api', {
      body: { action: 'getArticle', params: { number } }
    });
    
    if (error) throw new Error(error.message);
    
    const result = data?.result?.[0];
    if (!result) return null;
    
    return {
      sysId: result.sys_id,
      number: result.number,
      shortDescription: result.short_description,
      text: result.text,
      category: result.category?.display_value || result.kb_category?.display_value || 'General',
    };
  }

  async searchArticles(query: string): Promise<KnowledgeArticle[]> {
    const { data, error } = await supabase.functions.invoke('servicenow-api', {
      body: { action: 'searchArticles', params: { query } }
    });
    
    if (error) throw new Error(error.message);
    
    return (data?.result || []).map((item: Record<string, unknown>) => ({
      sysId: item.sys_id as string,
      number: item.number as string,
      shortDescription: item.short_description as string,
      text: '',
      category: (item.category as Record<string, string>)?.display_value || 'General',
    }));
  }

  async getIncidentByNumber(number: string): Promise<Incident | null> {
    const { data, error } = await supabase.functions.invoke('servicenow-api', {
      body: { action: 'getIncident', params: { number } }
    });
    
    if (error) throw new Error(error.message);
    
    const result = data?.result?.[0];
    if (!result) return null;
    
    return {
      sysId: result.sys_id,
      number: result.number,
      shortDescription: result.short_description,
      description: result.description,
      state: this.mapState(result.state),
      priority: this.mapPriority(result.priority),
      assignmentGroup: result.assignment_group?.display_value || 'Unassigned',
      openedAt: result.opened_at,
    };
  }

  async createIncident(data: {
    shortDescription: string;
    description: string;
    urgency: string;
    impact: string;
    category?: string;
  }): Promise<string> {
    const urgencyMap: Record<string, string> = { low: '3', medium: '2', high: '1' };
    const impactMap: Record<string, string> = { low: '3', medium: '2', high: '1' };
    
    const { data: result, error } = await supabase.functions.invoke('servicenow-api', {
      body: {
        action: 'createIncident',
        params: {
          short_description: data.shortDescription,
          description: data.description,
          urgency: urgencyMap[data.urgency] || '2',
          impact: impactMap[data.impact] || '2',
          category: data.category,
        }
      }
    });
    
    if (error) throw new Error(error.message);
    return result?.result?.number || 'INC0000000';
  }

  async getCatalogItems(): Promise<Array<{ name: string; description: string; category: string }>> {
    const { data, error } = await supabase.functions.invoke('servicenow-api', {
      body: { action: 'getCatalogItems' }
    });
    
    if (error) throw new Error(error.message);
    
    return (data?.result || []).map((item: Record<string, unknown>) => ({
      name: item.name as string,
      description: item.short_description as string,
      category: (item.category as Record<string, string>)?.display_value || 'General',
    }));
  }

  private mapState(state: string): string {
    const stateMap: Record<string, string> = {
      '1': 'New',
      '2': 'In Progress',
      '3': 'On Hold',
      '6': 'Resolved',
      '7': 'Closed',
      '8': 'Canceled',
    };
    return stateMap[state] || 'Unknown';
  }

  private mapPriority(priority: string): string {
    const priorityMap: Record<string, string> = {
      '1': 'Critical',
      '2': 'High',
      '3': 'Medium',
      '4': 'Low',
      '5': 'Planning',
    };
    return priorityMap[priority] || 'Unknown';
  }
}

export const serviceNow = new ServiceNowService();
