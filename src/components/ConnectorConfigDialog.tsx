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
import { supabase } from "@/integrations/supabase/client";
import { connectorIcons } from "@/components/ConnectorIcons";

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

// Index documents to the backend RAG service
async function indexDocuments(
  connectorId: string,
  documents: Array<{ title: string; content: string; sourceId?: string }>
): Promise<{ success: boolean; results?: unknown[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke('rag-service', {
    body: {
      action: 'index',
      connectorId,
      sourceType: 'file',
      documents,
    },
  });

  if (error) {
    console.error('Document indexing error:', error);
    return { success: false, error: error.message };
  }

  return (data ?? { success: true }) as { success: boolean; results?: unknown[]; error?: string };
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
  const isOAuthConnector = connector.useOAuth === true;

  // Handle Google OAuth sign-in
  const handleGoogleOAuth = async () => {
    setIsSaving(true);
    try {
      // Determine scopes based on connector type
      let scopes = 'https://www.googleapis.com/auth/drive.readonly';
      let redirectConnector = 'google-drive';
      
      if (connector.id === 'email') {
        scopes = 'https://www.googleapis.com/auth/gmail.readonly';
        redirectConnector = 'email';
      } else if (connector.id === 'calendar') {
        scopes = 'https://www.googleapis.com/auth/calendar.readonly';
        redirectConnector = 'calendar';
      }
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes,
          redirectTo: `${window.location.origin}/settings?connector=${redirectConnector}`,
          // Force Google to re-show the consent screen so newly requested scopes actually apply.
          queryParams: {
            prompt: 'consent',
            access_type: 'offline',
            include_granted_scopes: 'true',
          },
        },
      });

      if (error) {
        throw error;
      }

      // The user will be redirected to Google for authentication
      // After auth, they'll be redirected back to /settings with the connector param
    } catch (error) {
      console.error('Google OAuth error:', error);
      toast({
        title: "OAuth Error",
        description: error instanceof Error ? error.message : "Failed to start Google authentication",
        variant: "destructive",
      });
      setIsSaving(false);
    }
  };

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

  const IconComponent = connectorIcons[connector.id];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {IconComponent ? (
              <IconComponent className="w-6 h-6" />
            ) : (
              <span className="text-2xl">{connector.icon}</span>
            )}
            {connector.isConnected ? "Configure" : "Connect"} {connector.name}
          </DialogTitle>
          <DialogDescription>{connector.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* OAuth Connector UI */}
          {isOAuthConnector ? (
            <div className="space-y-4">
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  {IconComponent ? (
                    <IconComponent className="w-10 h-10" />
                  ) : (
                    <span className="text-3xl">{connector.icon}</span>
                  )}
                </div>
                <h3 className="font-semibold mb-2">Connect with {connector.name}</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Click the button below to securely connect your {connector.name} account using OAuth.
                </p>
                
                {connector.oauthProvider === 'google' && (
                  <Button
                    onClick={handleGoogleOAuth}
                    disabled={isSaving}
                    className="w-full max-w-xs gap-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 shadow-sm"
                  >
                    {isSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                    )}
                    {isSaving ? "Connecting..." : "Sign in with Google"}
                  </Button>
                )}

                <p className="text-xs text-muted-foreground mt-4">
                  We'll only request read-only access to your files.
                </p>
              </div>
            </div>
          ) : isFileConnector ? (
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

        {/* Hide footer for OAuth connectors - they use the OAuth button instead */}
        {!isOAuthConnector && (
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
        )}
      </DialogContent>
    </Dialog>
  );
};