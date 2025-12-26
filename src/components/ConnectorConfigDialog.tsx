import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
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

  if (!connector) return null;

  const handleSave = async () => {
    // Validate required fields
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
          {connector.configFields && connector.configFields.length > 0 ? (
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
