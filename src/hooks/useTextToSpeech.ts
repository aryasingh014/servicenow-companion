import { useState, useCallback, useRef, useEffect } from "react";
import { VoiceOption, DEFAULT_VOICES } from "@/components/VoiceSelector";

interface UseTextToSpeechReturn {
  isSpeaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
  isSupported: boolean;
  isLoading: boolean;
  selectedVoice: VoiceOption;
  setSelectedVoice: (voice: VoiceOption) => void;
  customVoices: VoiceOption[];
  addCustomVoice: (voice: VoiceOption) => void;
}

const STORAGE_KEY_VOICE = 'elevenlabs-selected-voice';
const STORAGE_KEY_CUSTOM = 'elevenlabs-custom-voices';

export const useTextToSpeech = (): UseTextToSpeechReturn => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVoice, setSelectedVoiceState] = useState<VoiceOption>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VOICE);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_VOICES[0];
      }
    }
    return DEFAULT_VOICES[0];
  });
  const [customVoices, setCustomVoices] = useState<VoiceOption[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_CUSTOM);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist selected voice
  const setSelectedVoice = useCallback((voice: VoiceOption) => {
    setSelectedVoiceState(voice);
    localStorage.setItem(STORAGE_KEY_VOICE, JSON.stringify(voice));
  }, []);

  // Add custom voice
  const addCustomVoice = useCallback((voice: VoiceOption) => {
    setCustomVoices(prev => {
      const updated = [...prev, voice];
      localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(updated));
      return updated;
    });
  }, []);

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
    abortControllerRef.current = new AbortController();

    try {
      console.log(`[TTS] Speaking with voice: ${selectedVoice.name} (${selectedVoice.id})`);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            text,
            voiceId: selectedVoice.id,
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[TTS] Error response:', errorData);
        throw new Error(errorData.error || `TTS request failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      console.log(`[TTS] Received audio blob: ${audioBlob.size} bytes`);
      
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        console.log('[TTS] Audio playback started');
        setIsLoading(false);
        setIsSpeaking(true);
      };

      audio.onended = () => {
        console.log('[TTS] Audio playback ended');
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      audio.onerror = (e) => {
        console.error('[TTS] Audio playback error:', e);
        setIsLoading(false);
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('[TTS] Request was cancelled');
      } else {
        console.error('[TTS] ElevenLabs error, falling back to browser TTS:', error);
        // Fallback to browser TTS if ElevenLabs fails
        fallbackToWebSpeech(text);
      }
      setIsLoading(false);
    }
  }, [selectedVoice]);

  const fallbackToWebSpeech = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      console.log('[TTS] Using browser fallback');
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) => v.name.includes("Google") || v.name.includes("Microsoft")
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const stop = useCallback(() => {
    // Stop ElevenLabs audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    // Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop browser TTS as well (fallback)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  return {
    isSpeaking,
    speak,
    stop,
    isSupported: true,
    isLoading,
    selectedVoice,
    setSelectedVoice,
    customVoices,
    addCustomVoice,
  };
};
