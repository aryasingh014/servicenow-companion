import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, Mic, Play, Trash2, Check, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface VoiceCloneSettingsProps {
  voiceSampleUrl: string | null;
  voiceName: string;
  language: string;
  onVoiceSampleChange: (url: string | null, name?: string) => void;
  onLanguageChange: (language: string) => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ru', name: 'Russian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'cs', name: 'Czech' },
  { code: 'ar', name: 'Arabic' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hu', name: 'Hungarian' },
];

const PRESET_VOICES = [
  { name: 'Default Male', url: 'https://replicate.delivery/pbxt/Jt79w0xsT64R1JsiJ0LQRL8UcWspg5J4RFrU6YwEKpOT1ukS/male.wav' },
  { name: 'Default Female', url: 'https://replicate.delivery/pbxt/JxH0ECDP8Sx6gIAmGZ0QRpHWBHbXz4TdBDZI2t9KQNr4yPkE/female.wav' },
];

export const VoiceCloneSettings = ({
  voiceSampleUrl,
  voiceName,
  language,
  onVoiceSampleChange,
  onLanguageChange,
}: VoiceCloneSettingsProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('audio/')) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload an audio file (MP3, WAV, etc.)",
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Please upload an audio file under 10MB",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Upload to Supabase Storage
      const fileName = `voice-samples/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('voice-samples')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        // If bucket doesn't exist, use a public URL workaround
        console.warn('Storage upload failed, using data URL:', error);
        
        // Convert to base64 data URL as fallback
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          onVoiceSampleChange(dataUrl, file.name.replace(/\.[^/.]+$/, ''));
          toast({
            title: "Voice sample loaded",
            description: "Your voice will be used for responses",
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('voice-samples')
        .getPublicUrl(fileName);

      onVoiceSampleChange(publicUrlData.publicUrl, file.name.replace(/\.[^/.]+$/, ''));
      toast({
        title: "Voice sample uploaded",
        description: "Your voice will be used for responses",
      });
    } catch (err) {
      console.error('Upload error:', err);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: "Could not upload voice sample",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        
        // Convert to data URL
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          onVoiceSampleChange(dataUrl, 'Recorded Voice');
          toast({
            title: "Voice recorded",
            description: "Your voice will be used for responses",
          });
        };
        reader.readAsDataURL(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Update recording time
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 30) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Recording error:', err);
      toast({
        variant: "destructive",
        title: "Recording failed",
        description: "Could not access microphone",
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

  const playVoiceSample = () => {
    if (!voiceSampleUrl) return;
    
    setIsPlaying(true);
    const audio = new Audio(voiceSampleUrl);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => {
      setIsPlaying(false);
      toast({
        variant: "destructive",
        title: "Playback failed",
        description: "Could not play voice sample",
      });
    };
    audio.play();
  };

  const clearVoiceSample = () => {
    onVoiceSampleChange(null);
    toast({
      title: "Voice sample removed",
      description: "Using default assistant voice",
    });
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Voice Cloning
        </CardTitle>
        <CardDescription>
          Clone any voice from a short audio sample. The assistant will speak in your chosen voice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Voice */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 border border-border/50">
          <div>
            <p className="font-medium">{voiceName}</p>
            <p className="text-sm text-muted-foreground">
              {voiceSampleUrl ? 'Custom voice active' : 'Using default voice'}
            </p>
          </div>
          <div className="flex gap-2">
            {voiceSampleUrl && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={playVoiceSample}
                  disabled={isPlaying}
                >
                  {isPlaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearVoiceSample}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Upload Options */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Upload Audio File</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {isUploading ? 'Uploading...' : 'Upload Audio'}
            </Button>
            <p className="text-xs text-muted-foreground">
              MP3, WAV, or other audio formats (max 10MB)
            </p>
          </div>

          {/* Record Voice */}
          <div className="space-y-2">
            <Label>Record Your Voice</Label>
            <Button
              variant={isRecording ? "destructive" : "outline"}
              className="w-full"
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? (
                <>
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-2" />
                  Stop ({30 - recordingTime}s)
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 mr-2" />
                  Record Voice
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Record 5-30 seconds for best results
            </p>
          </div>
        </div>

        {/* Preset Voices */}
        <div className="space-y-2">
          <Label>Preset Voices</Label>
          <div className="flex gap-2">
            {PRESET_VOICES.map((voice) => (
              <Button
                key={voice.name}
                variant={voiceSampleUrl === voice.url ? "default" : "outline"}
                size="sm"
                onClick={() => onVoiceSampleChange(voice.url, voice.name)}
              >
                {voiceSampleUrl === voice.url && <Check className="w-3 h-3 mr-1" />}
                {voice.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Language Selection */}
        <div className="space-y-2">
          <Label>Language</Label>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            The language the assistant will speak in
          </p>
        </div>

        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
          <Info className="w-4 h-4 mt-0.5 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-primary">How Voice Cloning Works</p>
            <p className="text-muted-foreground mt-1">
              Upload a clear audio sample (5-30 seconds) of any voice. The AI will learn the voice characteristics and use them when speaking responses. Works best with clear speech without background noise.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
