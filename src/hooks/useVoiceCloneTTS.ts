import { useState, useCallback, useRef, useEffect } from "react";

interface VoiceSettings {
  voiceName: string;
  language: string;
  pitch: number;
  rate: number;
  selectedVoiceURI: string | null;
}

interface UseVoiceCloneTTSReturn {
  isSpeaking: boolean;
  isLoading: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  voiceSettings: VoiceSettings;
  setVoice: (voiceURI: string, name: string) => void;
  setLanguage: (language: string) => void;
  setPitch: (pitch: number) => void;
  setRate: (rate: number) => void;
  availableVoices: SpeechSynthesisVoice[];
  isConfigured: boolean;
  error: string | null;
}

const STORAGE_KEY = 'voice-settings-v2';

const defaultSettings: VoiceSettings = {
  voiceName: 'Default Assistant',
  language: 'en-US',
  pitch: 1.0,
  rate: 1.0,
  selectedVoiceURI: null,
};

export const useVoiceCloneTTS = (): UseVoiceCloneTTSReturn => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });
  
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Prioritize natural-sounding voices
        const sortedVoices = voices.sort((a, b) => {
          // Prefer voices with "Natural", "Premium", or "Enhanced" in the name
          const aScore = (a.name.includes('Natural') || a.name.includes('Premium') || a.name.includes('Enhanced') || a.name.includes('Google')) ? 1 : 0;
          const bScore = (b.name.includes('Natural') || b.name.includes('Premium') || b.name.includes('Enhanced') || b.name.includes('Google')) ? 1 : 0;
          return bScore - aScore;
        });
        setAvailableVoices(sortedVoices);
        
        // Auto-select a good default voice if none selected
        if (!voiceSettings.selectedVoiceURI) {
          const goodVoice = sortedVoices.find(v => 
            v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium'))
          ) || sortedVoices.find(v => v.lang.startsWith('en'));
          
          if (goodVoice) {
            setVoiceSettings(prev => ({
              ...prev,
              selectedVoiceURI: goodVoice.voiceURI,
              voiceName: goodVoice.name,
            }));
          }
        }
      }
    };

    loadVoices();
    
    // Chrome requires listening to voiceschanged event
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [voiceSettings.selectedVoiceURI]);

  // Persist settings to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(voiceSettings));
  }, [voiceSettings]);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    if (!('speechSynthesis' in window)) {
      setError('Speech synthesis not supported in this browser');
      return;
    }

    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    setError(null);
    setIsLoading(true);

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;
      
      // Find the selected voice
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.voiceURI === voiceSettings.selectedVoiceURI);
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = voiceSettings.language;
      }
      
      utterance.pitch = voiceSettings.pitch;
      utterance.rate = voiceSettings.rate;
      
      utterance.onstart = () => {
        setIsLoading(false);
        setIsSpeaking(true);
        console.log('[VoiceTTS] Started speaking');
      };
      
      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
        console.log('[VoiceTTS] Finished speaking');
      };
      
      utterance.onerror = (event) => {
        console.error('[VoiceTTS] Error:', event);
        setError(`Speech error: ${event.error}`);
        setIsLoading(false);
        setIsSpeaking(false);
        utteranceRef.current = null;
      };
      
      // Small delay to ensure voice is loaded
      await new Promise(resolve => setTimeout(resolve, 50));
      
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('[VoiceTTS] Error:', err);
      setError(err instanceof Error ? err.message : 'Speech failed');
      setIsLoading(false);
      setIsSpeaking(false);
    }
  }, [voiceSettings]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const setVoice = useCallback((voiceURI: string, name: string) => {
    setVoiceSettings(prev => ({
      ...prev,
      selectedVoiceURI: voiceURI,
      voiceName: name,
    }));
  }, []);

  const setLanguage = useCallback((language: string) => {
    setVoiceSettings(prev => ({ ...prev, language }));
  }, []);

  const setPitch = useCallback((pitch: number) => {
    setVoiceSettings(prev => ({ ...prev, pitch }));
  }, []);

  const setRate = useCallback((rate: number) => {
    setVoiceSettings(prev => ({ ...prev, rate }));
  }, []);

  return {
    isSpeaking,
    isLoading,
    speak,
    stop,
    voiceSettings,
    setVoice,
    setLanguage,
    setPitch,
    setRate,
    availableVoices,
    isConfigured: true,
    error,
  };
};
