import { FileText, Calendar, Tag, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Document {
  id: string;
  title: string;
  content: string;
  source_type: string;
  connector_id: string;
  created_at: string;
  metadata: unknown;
}

interface DocumentViewerDialogProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentViewerDialog({
  document,
  open,
  onOpenChange,
}: DocumentViewerDialogProps) {
  if (!document) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {document.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Metadata */}
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Tag className="w-4 h-4" />
              <Badge variant="outline">{document.source_type}</Badge>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="w-4 h-4" />
              <span className="font-mono text-xs">{document.connector_id}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(document.created_at)}</span>
            </div>
          </div>

          {/* Content */}
          <div className="border border-border rounded-lg">
            <ScrollArea className="h-[400px] p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {document.content}
              </pre>
            </ScrollArea>
          </div>

          {/* Metadata (if any) */}
          {document.metadata && typeof document.metadata === 'object' && Object.keys(document.metadata as object).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Metadata</h4>
              <div className="bg-secondary/50 rounded-lg p-3">
                <pre className="text-xs text-muted-foreground overflow-auto">
                  {JSON.stringify(document.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
