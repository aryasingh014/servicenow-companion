import { useState, useRef } from "react";
import { Eye, EyeOff, Loader2, Upload, File, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Connector, ConnectorField } from "@/types/connector";
import { toast } from "@/hooks/use-toast";

interface ConnectorConfigDialogProps {
  connector: Connector | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (connectorId: string, config: Record<string, string>) => void;
  existingConfig?: Record<string, string>;
}

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  content?: string;
  indexed?: boolean;
}

// Read file content as text
async function readFileContent(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    
    // Handle different file types
    if (file.type.includes('text') || 
        file.name.endsWith('.txt') || 
        file.name.endsWith('.md') ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.json')) {
      reader.readAsText(file);
    } else {
      // For binary files, just read as text (may not work perfectly)
      reader.readAsText(file);
    }
  });
}

// Index documents to RAG service
async function indexDocuments(
  connectorId: string,
  documents: Array<{ title: string; content: string; sourceId?: string }>
): Promise<{ success: boolean; results?: unknown[] }> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-service`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          action: 'index',
          connectorId,
          sourceType: 'file',
          documents,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Indexing failed: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Document indexing error:', error);
    return { success: false };
  }
}

export const ConnectorConfigDialog = ({
  connector,
  open,
  onOpenChange,
  onSave,
  existingConfig,
}: ConnectorConfigDialogProps) => {
  const [config, setConfig] = useState<Record<string, string>>(existingConfig || {});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [indexingProgress, setIndexingProgress] = useState(0);
  const [isIndexing, setIsIndexing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rawFilesRef = useRef<globalThis.File[]>([]);

  if (!connector) return null;

  const isFileConnector = connector.id === 'file';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: UploadedFile[] = [];
    const rawFiles = Array.from(files);
    
    for (const file of rawFiles) {
      try {
        const content = await readFileContent(file);
        newFiles.push({
          name: file.name,
          size: file.size,
          type: file.type || 'unknown',
          content,
          indexed: false,
        });
      } catch (error) {
        console.error(`Failed to read ${file.name}:`, error);
        newFiles.push({
          name: file.name,
          size: file.size,
          type: file.type || 'unknown',
          content: undefined,
          indexed: false,
        });
      }
    }

    rawFilesRef.current = [...rawFilesRef.current, ...rawFiles];
    setUploadedFiles(prev => [...prev, ...newFiles]);
    
    // Store file names in config
    const fileNames = [...uploadedFiles, ...newFiles].map(f => f.name).join(', ');
    setConfig(prev => ({ ...prev, files: fileNames }));
  };

  const removeFile = (index: number) => {
    rawFilesRef.current = rawFilesRef.current.filter((_, i) => i !== index);
    setUploadedFiles(prev => {
      const updated = prev.filter((_, i) => i !== index);
      const fileNames = updated.map(f => f.name).join(', ');
      setConfig(c => ({ ...c, files: fileNames }));
      return updated;
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSave = async () => {
    // For file connector, check if files are uploaded
    if (isFileConnector && uploadedFiles.length === 0) {
      toast({
        title: "No files uploaded",
        description: "Please upload at least one file to connect.",
        variant: "destructive",
      });
      return;
    }

    // Validate required fields for other connectors
    const missingFields = connector.configFields
      ?.filter((field) => field.required && !config[field.name])
      .map((field) => field.label);

    if (missingFields && missingFields.length > 0) {
      toast({
        title: "Missing required fields",
        description: `Please fill in: ${missingFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      // For file connector, index the documents
      if (isFileConnector && uploadedFiles.length > 0) {
        setIsIndexing(true);
        setIndexingProgress(0);

        const documentsToIndex = uploadedFiles
          .filter(f => f.content && f.content.length > 0)
          .map(f => ({
            title: f.name,
            content: f.content!,
            sourceId: f.name,
          }));

        if (documentsToIndex.length > 0) {
          toast({
            title: "Indexing documents...",
            description: `Processing ${documentsToIndex.length} files for AI search`,
          });

          // Simulate progress while indexing
          const progressInterval = setInterval(() => {
            setIndexingProgress(prev => Math.min(prev + 10, 90));
          }, 500);

          const result = await indexDocuments(connector.id, documentsToIndex);

          clearInterval(progressInterval);
          setIndexingProgress(100);

          if (result.success) {
            toast({
              title: "Documents indexed! 🎉",
              description: `${documentsToIndex.length} files are now searchable by NOVA`,
            });

            // Mark files as indexed
            setUploadedFiles(prev => 
              prev.map(f => ({ ...f, indexed: true }))
            );
          } else {
            toast({
              title: "Indexing partially complete",
              description: "Some documents may not be searchable. Try re-uploading.",
              variant: "destructive",
            });
          }
        }

        setIsIndexing(false);
      }

      await onSave(connector.id, config);
      onOpenChange(false);
      setConfig({});
      setUploadedFiles([]);
      rawFilesRef.current = [];
      setIndexingProgress(0);
    } catch (error) {
      console.error("Error saving connector config:", error);
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
      setIsIndexing(false);
    }
  };

  const togglePasswordVisibility = (fieldName: string) => {
    setShowPasswords((prev) => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  const renderField = (field: ConnectorField) => {
    const value = config[field.name] || "";

    switch (field.type) {
      case "select":
        return (
          <Select
            value={value}
            onValueChange={(val) => setConfig({ ...config, [field.name]: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "password":
        return (
          <div className="relative">
            <Input
              type={showPasswords[field.name] ? "text" : "password"}
              value={value}
              onChange={(e) =>
                setConfig({ ...config, [field.name]: e.target.value })
              }
              placeholder={field.placeholder}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => togglePasswordVisibility(field.name)}
            >
              {showPasswords[field.name] ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        );
      default:
        return (
          <Input
            type={field.type}
            value={value}
            onChange={(e) =>
              setConfig({ ...config, [field.name]: e.target.value })
            }
            placeholder={field.placeholder}
          />
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{connector.icon}</span>
            {connector.isConnected ? "Configure" : "Connect"} {connector.name}
          </DialogTitle>
          <DialogDescription>{connector.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload UI for File Connector */}
          {isFileConnector ? (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-1">
                  Click to upload or drag files here
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, DOC, TXT, CSV, MD, JSON supported
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.txt,.csv,.json,.md,.xlsx,.xls"
                />
              </div>

              {/* Indexing Progress */}
              {isIndexing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Indexing for AI search...</span>
                    <span className="text-primary">{indexingProgress}%</span>
                  </div>
                  <Progress value={indexingProgress} className="h-2" />
                </div>
              )}

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <Label>Uploaded Files ({uploadedFiles.length})</Label>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 border border-border"
                      >
                        {file.indexed ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <File className="w-4 h-4 text-primary flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                            {file.content && ` • ${file.content.length.toLocaleString()} chars`}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="p-1 hover:bg-destructive/20 rounded transition-colors"
                          disabled={isSaving}
                        >
                          <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : connector.configFields && connector.configFields.length > 0 ? (
            connector.configFields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {renderField(field)}
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-4">
              No configuration required. Click save to connect.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isIndexing}>
            {isSaving || isIndexing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isIndexing ? "Indexing..." : "Saving..."}
              </>
            ) : connector.isConnected ? (
              "Save Changes"
            ) : (
              "Connect & Index"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};