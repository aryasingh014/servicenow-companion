import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Plus, Trash2, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Message } from "@/types/chat";

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

interface ConversationSidebarProps {
  currentConversationId: string | null;
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onConversationDeleted: (id: string) => void;
}

export function ConversationSidebar({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onConversationDeleted,
}: ConversationSidebarProps) {
  const { user, profile, signOut } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const fetchConversations = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching conversations:", error);
      } else {
        setConversations(
          (data || []).map((c) => ({
            ...c,
            messages: (c.messages as unknown as Message[]) || [],
          }))
        );
      }
      setLoading(false);
    };

    fetchConversations();
  }, [user]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("conversations").delete().eq("id", id);

    if (!error) {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      onConversationDeleted(id);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  if (!user) {
    return (
      <div className="w-64 bg-secondary/30 border-r border-border flex flex-col">
        <div className="p-4">
          <p className="text-sm text-muted-foreground text-center">
            Sign in to save conversations
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-secondary/30 border-r border-border flex flex-col">
      <div className="p-4">
        <Button onClick={onNewConversation} className="w-full" variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No conversations yet
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                className={cn(
                  "group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors",
                  currentConversationId === conversation.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-secondary"
                )}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conversation.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(conversation.updated_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleDelete(conversation.id, e)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="truncate">{profile?.display_name || user.email}</span>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
