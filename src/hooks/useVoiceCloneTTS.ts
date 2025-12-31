import { useState, useCallback, useRef, useEffect } from "react";

interface VoiceSettings {
  voiceSampleUrl: string | null;
  voiceName: string;
  language: string;
}

interface UseVoiceCloneTTSReturn {
  isSpeaking: boolean;
  isLoading: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  voiceSettings: VoiceSettings;
  setVoiceSample: (url: string | null, name?: string) => void;
  setLanguage: (language: string) => void;
  isConfigured: boolean;
  error: string | null;
}

const STORAGE_KEY = 'voice-clone-settings';

const defaultSettings: VoiceSettings = {
  voiceSampleUrl: null,
  voiceName: 'Default Assistant',
  language: 'en',
};

export const useVoiceCloneTTS = (): UseVoiceCloneTTSReturn => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist settings to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(voiceSettings));
  }, [voiceSettings]);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    // Stop any ongoing speech
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsLoading(true);
    setError(null);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-clone-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            text,
            voiceSampleUrl: voiceSettings.voiceSampleUrl,
            language: voiceSettings.language,
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `TTS failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsLoading(false);
        setIsSpeaking(true);
      };

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      audio.onerror = (e) => {
        console.error('[VoiceCloneTTS] Audio playback error:', e);
        setIsLoading(false);
        setIsSpeaking(false);
        setError('Audio playback failed');
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[VoiceCloneTTS] Request aborted');
        return;
      }
      
      console.error('[VoiceCloneTTS] Error:', err);
      setError(err instanceof Error ? err.message : 'TTS failed');
      setIsLoading(false);
      setIsSpeaking(false);

      // Fallback to browser TTS if voice cloning fails
      if ('speechSynthesis' in window) {
        console.log('[VoiceCloneTTS] Falling back to browser TTS');
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onstart = () => setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [voiceSettings]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const setVoiceSample = useCallback((url: string | null, name?: string) => {
    setVoiceSettings(prev => ({
      ...prev,
      voiceSampleUrl: url,
      voiceName: name || (url ? 'Custom Voice' : 'Default Assistant'),
    }));
  }, []);

  const setLanguage = useCallback((language: string) => {
    setVoiceSettings(prev => ({ ...prev, language }));
  }, []);

  return {
    isSpeaking,
    isLoading,
    speak,
    stop,
    voiceSettings,
    setVoiceSample,
    setLanguage,
    isConfigured: true, // Will work with default voice even without custom sample
    error,
  };
};
