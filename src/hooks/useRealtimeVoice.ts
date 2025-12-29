import { useState, useRef, useCallback, useEffect } from "react";
import { RealtimeChat, RealtimeEvent } from "@/utils/RealtimeAudio";
import { useToast } from "@/hooks/use-toast";

interface UseRealtimeVoiceProps {
  voice?: string;
  onTranscript?: (text: string, role: "user" | "assistant") => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

interface UseRealtimeVoiceReturn {
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  startConversation: () => Promise<void>;
  endConversation: () => void;
  sendTextMessage: (text: string) => void;
  transcript: string;
}

export const useRealtimeVoice = ({
  voice = "alloy",
  onTranscript,
  onSpeakingChange,
}: UseRealtimeVoiceProps = {}): UseRealtimeVoiceReturn => {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  
  const chatRef = useRef<RealtimeChat | null>(null);
  const currentTranscriptRef = useRef<string>("");

  const handleMessage = useCallback((event: RealtimeEvent) => {
    console.log("Realtime event:", event.type, event);

    switch (event.type) {
      case "session.created":
        console.log("Session created");
        break;

      case "response.audio.delta":
        setIsSpeaking(true);
        onSpeakingChange?.(true);
        break;

      case "response.audio.done":
        setIsSpeaking(false);
        onSpeakingChange?.(false);
        break;

      case "response.audio_transcript.delta":
        if (typeof event.delta === "string") {
          currentTranscriptRef.current += event.delta;
          setTranscript(currentTranscriptRef.current);
        }
        break;

      case "response.audio_transcript.done":
        if (typeof event.transcript === "string") {
          onTranscript?.(event.transcript, "assistant");
          currentTranscriptRef.current = "";
          setTranscript("");
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (typeof event.transcript === "string") {
          onTranscript?.(event.transcript, "user");
        }
        break;

      case "input_audio_buffer.speech_started":
        console.log("User started speaking");
        break;

      case "input_audio_buffer.speech_stopped":
        console.log("User stopped speaking");
        break;

      case "error":
        console.error("Realtime error:", event);
        toast({
          variant: "destructive",
          title: "Voice Error",
          description: typeof event.error === "object" && event.error !== null 
            ? (event.error as { message?: string }).message || "An error occurred"
            : "An error occurred",
        });
        break;
    }
  }, [onTranscript, onSpeakingChange, toast]);

  const startConversation = useCallback(async () => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      chatRef.current = new RealtimeChat(handleMessage, voice);
      await chatRef.current.init();
      
      setIsConnected(true);
      toast({
        title: "Voice Connected",
        description: "Real-time voice conversation is now active",
      });
    } catch (error) {
      console.error("Failed to start conversation:", error);
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect to voice service",
      });
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected, voice, handleMessage, toast]);

  const endConversation = useCallback(() => {
    chatRef.current?.disconnect();
    chatRef.current = null;
    setIsConnected(false);
    setIsSpeaking(false);
    setTranscript("");
    currentTranscriptRef.current = "";
    onSpeakingChange?.(false);
  }, [onSpeakingChange]);

  const sendTextMessage = useCallback((text: string) => {
    if (!chatRef.current?.isConnected()) {
      console.error("Not connected to realtime chat");
      return;
    }
    chatRef.current.sendMessage(text);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      chatRef.current?.disconnect();
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    isSpeaking,
    startConversation,
    endConversation,
    sendTextMessage,
    transcript,
  };
};
