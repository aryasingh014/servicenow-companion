import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Volume2, Play, Settings2, Mic, Square, Upload, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface VoiceSettings {
  voiceName: string;
  language: string;
  pitch: number;
  rate: number;
  selectedVoiceURI: string | null;
  customVoiceUrl?: string;
}

interface VoiceCloneSettingsProps {
  voiceSettings: VoiceSettings;
  availableVoices: SpeechSynthesisVoice[];
  onVoiceChange: (voiceURI: string, name: string) => void;
  onPitchChange: (pitch: number) => void;
  onRateChange: (rate: number) => void;
  onTestVoice: () => void;
  onCustomVoiceChange?: (url: string | null) => void;
  isSpeaking: boolean;
}

export const VoiceCloneSettings = ({
  voiceSettings,
  availableVoices,
  onVoiceChange,
  onPitchChange,
  onRateChange,
  onTestVoice,
  onCustomVoiceChange,
  isSpeaking,
}: VoiceCloneSettingsProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(voiceSettings.customVoiceUrl || null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get English voices first, then others
  const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
  const otherVoices = availableVoices.filter(v => !v.lang.startsWith('en'));

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);
        onCustomVoiceChange?.(audioUrl);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        toast({
          title: "Recording saved",
          description: "Your voice sample has been recorded successfully.",
        });
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration counter
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording failed",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) {
        toast({
          title: "Invalid file",
          description: "Please upload an audio file.",
          variant: "destructive",
        });
        return;
      }

      const audioUrl = URL.createObjectURL(file);
      setRecordedAudioUrl(audioUrl);
      onCustomVoiceChange?.(audioUrl);
      
      toast({
        title: "Voice sample uploaded",
        description: `${file.name} has been loaded.`,
      });
    }
  };

  const clearRecording = () => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    onCustomVoiceChange?.(null);
    
    toast({
      title: "Voice sample removed",
      description: "Custom voice sample has been cleared.",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
        {/* Voice Recording Section */}
        <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">🎙️ Custom Voice Sample</Label>
            {recordedAudioUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearRecording}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Remove
              </Button>
            )}
          </div>
          
          <p className="text-sm text-muted-foreground">
            Record or upload your voice for a personalized experience
          </p>

          <div className="flex gap-2">
            {!isRecording ? (
              <Button
                variant="outline"
                onClick={startRecording}
                className="flex-1"
              >
                <Mic className="w-4 h-4 mr-2" />
                Start Recording
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={stopRecording}
                className="flex-1"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop ({formatDuration(recordingDuration)})
              </Button>
            )}
            
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRecording}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {recordedAudioUrl && (
            <div className="space-y-2">
              <Label className="text-sm">Preview your voice sample:</Label>
              <audio
                src={recordedAudioUrl}
                controls
                className="w-full h-10"
              />
            </div>
          )}
        </div>

        {/* Voice Selection */}
        <div className="space-y-2">
          <Label>Browser Voice</Label>
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
            Browser voice is used as fallback when custom voice is not available
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
            <li>• Record 10-30 seconds of clear speech for best results</li>
            <li>• Speak naturally in a quiet environment</li>
            <li>• Chrome and Edge offer the most natural-sounding browser voices</li>
            <li>• Look for voices marked "Natural" or "Premium" for best quality</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
