import { useState, useRef } from "react";
import { Eye, EyeOff, Loader2, Upload, File, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!connector) return null;

  const isFileConnector = connector.id === 'file';

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: UploadedFile[] = Array.from(files).map(file => ({
      name: file.name,
      size: file.size,
      type: file.type || 'unknown',
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
    
    // Store file names in config
    const fileNames = [...uploadedFiles, ...newFiles].map(f => f.name).join(', ');
    setConfig(prev => ({ ...prev, files: fileNames }));
  };

  const removeFile = (index: number) => {
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
      await onSave(connector.id, config);
      onOpenChange(false);
      setConfig({});
      setUploadedFiles([]);
    } catch (error) {
      console.error("Error saving connector config:", error);
    } finally {
      setIsSaving(false);
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
                  PDF, DOC, TXT, CSV, and more
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
                        <File className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="p-1 hover:bg-destructive/20 rounded transition-colors"
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : connector.isConnected ? (
              "Save Changes"
            ) : (
              "Connect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
