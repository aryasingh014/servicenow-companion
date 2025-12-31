import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Volume2, Play, Settings2 } from "lucide-react";

interface VoiceSettings {
  voiceName: string;
  language: string;
  pitch: number;
  rate: number;
  selectedVoiceURI: string | null;
}

interface VoiceCloneSettingsProps {
  voiceSettings: VoiceSettings;
  availableVoices: SpeechSynthesisVoice[];
  onVoiceChange: (voiceURI: string, name: string) => void;
  onPitchChange: (pitch: number) => void;
  onRateChange: (rate: number) => void;
  onTestVoice: () => void;
  isSpeaking: boolean;
}

export const VoiceCloneSettings = ({
  voiceSettings,
  availableVoices,
  onVoiceChange,
  onPitchChange,
  onRateChange,
  onTestVoice,
  isSpeaking,
}: VoiceCloneSettingsProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get English voices first, then others
  const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
  const otherVoices = availableVoices.filter(v => !v.lang.startsWith('en'));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="w-5 h-5" />
          Voice Settings
        </CardTitle>
        <CardDescription>
          Configure the assistant's voice for natural speech output
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Voice Selection */}
        <div className="space-y-2">
          <Label>Voice</Label>
          <Select
            value={voiceSettings.selectedVoiceURI || ''}
            onValueChange={(value) => {
              const voice = availableVoices.find(v => v.voiceURI === value);
              if (voice) {
                onVoiceChange(voice.voiceURI, voice.name);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a voice">
                {voiceSettings.voiceName || 'Select a voice'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {englishVoices.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    English Voices
                  </div>
                  {englishVoices.map((voice) => (
                    <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                      <div className="flex items-center gap-2">
                        <span>{voice.name}</span>
                        <span className="text-xs text-muted-foreground">({voice.lang})</span>
                        {(voice.name.includes('Natural') || voice.name.includes('Premium') || voice.name.includes('Enhanced')) && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Premium</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}
              {otherVoices.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                    Other Languages
                  </div>
                  {otherVoices.map((voice) => (
                    <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                      <div className="flex items-center gap-2">
                        <span>{voice.name}</span>
                        <span className="text-xs text-muted-foreground">({voice.lang})</span>
                      </div>
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Available voices depend on your browser and operating system
          </p>
        </div>

        {/* Test Voice Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={onTestVoice}
          disabled={isSpeaking}
        >
          <Play className="w-4 h-4 mr-2" />
          {isSpeaking ? 'Speaking...' : 'Test Voice'}
        </Button>

        {/* Advanced Settings Toggle */}
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <Settings2 className="w-4 h-4 mr-2" />
          {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
        </Button>

        {showAdvanced && (
          <div className="space-y-6 pt-2 border-t">
            {/* Pitch Control */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Pitch</Label>
                <span className="text-sm text-muted-foreground">{voiceSettings.pitch.toFixed(1)}</span>
              </div>
              <Slider
                value={[voiceSettings.pitch]}
                onValueChange={([value]) => onPitchChange(value)}
                min={0.5}
                max={2}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground">
                Adjust the voice pitch (0.5 = low, 2 = high)
              </p>
            </div>

            {/* Rate Control */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Speed</Label>
                <span className="text-sm text-muted-foreground">{voiceSettings.rate.toFixed(1)}x</span>
              </div>
              <Slider
                value={[voiceSettings.rate]}
                onValueChange={([value]) => onRateChange(value)}
                min={0.5}
                max={2}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground">
                Adjust the speaking speed (0.5 = slow, 2 = fast)
              </p>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-sm">💡 Tips for Best Experience</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Chrome and Edge offer the most natural-sounding voices</li>
            <li>• Look for voices marked "Natural" or "Premium" for best quality</li>
            <li>• macOS users have access to high-quality Siri voices</li>
            <li>• Voice availability varies by browser and operating system</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
