import { useState, useCallback, useRef, useEffect } from "react";

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

interface UseVoiceRecognitionReturn {
  isSessionActive: boolean;
  transcript: string;
  startSession: () => void;
  endSession: () => void;
  isSupported: boolean;
  pauseListening: () => void;
  resumeListening: () => void;
}

export const useVoiceRecognition = (): UseVoiceRecognitionReturn => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const sessionActiveRef = useRef(false); // Track session state for callbacks
  const isPausedRef = useRef(false); // Track if listening is paused (e.g., while TTS is speaking)

  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognitionAPI();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript(finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        // Only restart if session is still active and error is recoverable
        if (sessionActiveRef.current && event.error !== "not-allowed" && event.error !== "aborted") {
          setTimeout(() => {
            if (sessionActiveRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                console.log("Could not restart recognition after error");
              }
            }
          }, 100);
        }
      };

      recognitionRef.current.onend = () => {
        // Auto-restart if session is still active and not paused (continuous mode)
        if (sessionActiveRef.current && !isPausedRef.current && recognitionRef.current) {
          setTimeout(() => {
            if (sessionActiveRef.current && !isPausedRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                console.log("Could not restart recognition");
              }
            }
          }, 100);
        }
      };
    }

    return () => {
      sessionActiveRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startSession = useCallback(() => {
    if (recognitionRef.current && !isSessionActive) {
      setTranscript("");
      sessionActiveRef.current = true;
      isPausedRef.current = false;
      setIsSessionActive(true);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Failed to start recognition:", e);
      }
    }
  }, [isSessionActive]);

  const endSession = useCallback(() => {
    sessionActiveRef.current = false;
    isPausedRef.current = false;
    setIsSessionActive(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  // Pause listening (used when TTS is speaking to avoid echo)
  const pauseListening = useCallback(() => {
    isPausedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log("Could not pause recognition");
      }
    }
  }, []);

  // Resume listening after TTS finishes
  const resumeListening = useCallback(() => {
    isPausedRef.current = false;
    if (sessionActiveRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.log("Could not resume recognition");
      }
    }
  }, []);

  return {
    isSessionActive,
    transcript,
    startSession,
    endSession,
    isSupported,
    pauseListening,
    resumeListening,
  };
};
