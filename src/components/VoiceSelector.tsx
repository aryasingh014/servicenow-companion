import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Mic, Plus, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  isCustom?: boolean;
}

// Default ElevenLabs voices
export const DEFAULT_VOICES: VoiceOption[] = [
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', description: 'Natural male voice - Jarvis style' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Natural female voice' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', description: 'Professional male voice' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', description: 'Friendly female voice' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'British male voice' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', description: 'Young male voice' },
];

interface VoiceSelectorProps {
  selectedVoice: VoiceOption;
  onVoiceChange: (voice: VoiceOption) => void;
  customVoices: VoiceOption[];
  onAddCustomVoice: (voice: VoiceOption) => void;
}

export const VoiceSelector = ({
  selectedVoice,
  onVoiceChange,
  customVoices,
  onAddCustomVoice,
}: VoiceSelectorProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customVoiceId, setCustomVoiceId] = useState("");
  const [customVoiceName, setCustomVoiceName] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();

  const allVoices = [...DEFAULT_VOICES, ...customVoices];

  const handleAddCustomVoice = async () => {
    if (!customVoiceId.trim() || !customVoiceName.trim()) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please provide both a voice ID and name.",
      });
      return;
    }

    // Check if voice ID already exists
    if (allVoices.some(v => v.id === customVoiceId)) {
      toast({
        variant: "destructive",
        title: "Duplicate voice",
        description: "This voice ID is already added.",
      });
      return;
    }

    setIsVerifying(true);

    // Create the custom voice entry
    const newVoice: VoiceOption = {
      id: customVoiceId.trim(),
      name: customVoiceName.trim(),
      description: "Custom cloned voice",
      isCustom: true,
    };

    // Save to localStorage and state
    onAddCustomVoice(newVoice);

    toast({
      title: "Voice added",
      description: `${customVoiceName} has been added to your voices.`,
    });

    setIsVerifying(false);
    setIsDialogOpen(false);
    setCustomVoiceId("");
    setCustomVoiceName("");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <User className="w-4 h-4" />
            <span className="text-sm">{selectedVoice.name}</span>
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-56">
          <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
            ElevenLabs Voices
          </div>
          {DEFAULT_VOICES.map((voice) => (
            <DropdownMenuItem
              key={voice.id}
              onClick={() => onVoiceChange(voice)}
              className={selectedVoice.id === voice.id ? "bg-primary/10" : ""}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{voice.name}</span>
                <span className="text-xs text-muted-foreground">{voice.description}</span>
              </div>
            </DropdownMenuItem>
          ))}

          {customVoices.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
                Your Cloned Voices
              </div>
              {customVoices.map((voice) => (
                <DropdownMenuItem
                  key={voice.id}
                  onClick={() => onVoiceChange(voice)}
                  className={selectedVoice.id === voice.id ? "bg-primary/10" : ""}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{voice.name}</span>
                    <span className="text-xs text-muted-foreground">{voice.description}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add custom voice
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Voice</DialogTitle>
            <DialogDescription>
              Add your own cloned voice from ElevenLabs. You can find your voice ID in the ElevenLabs dashboard under Voice Lab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="voice-name">Voice Name</Label>
              <Input
                id="voice-name"
                placeholder="e.g., My Voice"
                value={customVoiceName}
                onChange={(e) => setCustomVoiceName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice-id">ElevenLabs Voice ID</Label>
              <Input
                id="voice-id"
                placeholder="e.g., pNInz6obpgDQGcFmaJgB"
                value={customVoiceId}
                onChange={(e) => setCustomVoiceId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Find this in your ElevenLabs Voice Lab → Voice Settings → Voice ID
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCustomVoice} disabled={isVerifying}>
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Add Voice"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
