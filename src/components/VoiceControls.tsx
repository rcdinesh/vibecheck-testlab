import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, MicOff, Play, Square, Volume2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { VibeVoiceTTS, VIBEVOICE_PRESETS, VibeVoicePreset } from "@/utils/textToSpeech";
import { useToast } from "@/components/ui/use-toast";

interface VoiceControlsProps {
  onTextChange?: (text: string) => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onPlay?: () => void;
  onStop?: () => void;
}

const VoiceControls = ({
  onTextChange,
  onStartRecording,
  onStopRecording,
  onPlay,
  onStop,
}: VoiceControlsProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [text, setText] = useState("Welcome to Microsoft VibeVoice testing. Enter your text here to test voice synthesis capabilities.");
  const [selectedPreset, setSelectedPreset] = useState<VibeVoicePreset>("natural");
  const [vibeVoice] = useState(() => new VibeVoiceTTS((playing) => setIsPlaying(playing)));
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const { toast } = useToast();

  const handleRecordToggle = () => {
    if (isRecording) {
      setIsRecording(false);
      onStopRecording?.();
    } else {
      setIsRecording(true);
      onStartRecording?.();
    }
  };

  const handlePlayToggle = async () => {
    if (isPlaying) {
      vibeVoice.stop();
      onStop?.();
    } else {
      try {
        onPlay?.();
        const settings = {
          ...VIBEVOICE_PRESETS[selectedPreset],
          voice: selectedVoice || undefined,
        };
        await vibeVoice.speak(text, settings);
        toast({
          title: "Speech Complete",
          description: "Text-to-speech synthesis finished.",
        });
      } catch (error) {
        console.error("TTS Error:", error);
        toast({
          title: "Speech Error",
          description: "Failed to synthesize speech. Please try again.",
          variant: "destructive",
        });
        setIsPlaying(false);
      }
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    onTextChange?.(value);
  };

  useEffect(() => {
    const loadVoices = async () => {
      if (vibeVoice.isSupported()) {
        const voices = await vibeVoice.getAvailableVoices();
        setAvailableVoices(voices);
        // Set default voice to first English voice
        const englishVoice = voices.find(v => v.lang.startsWith('en-'));
        if (englishVoice) {
          setSelectedVoice(englishVoice.name);
        }
      }
    };
    loadVoices();
  }, [vibeVoice]);

  return (
    <Card className="p-8 bg-gradient-card border-border/50 max-w-2xl mx-auto">
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <Volume2 className="w-6 h-6 text-voice-primary" />
          <h2 className="text-2xl font-semibold text-foreground">Text to Speech</h2>
        </div>
        
        <Textarea
          placeholder="Enter text to synthesize..."
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          className="min-h-[150px] resize-none border-border/50 focus:border-voice-primary text-lg"
        />
        
        <Button
          onClick={handlePlayToggle}
          disabled={!text.trim()}
          size="lg"
          className="w-full bg-voice-primary hover:bg-voice-primary/90 text-white font-medium py-4 text-lg rounded-lg transition-all duration-200"
        >
          {isPlaying ? (
            <>
              <Square className="w-6 h-6 mr-2" />
              Stop Synthesis
            </>
          ) : (
            <>
              <Play className="w-6 h-6 mr-2" />
              Synthesize Speech
            </>
          )}
        </Button>
        
        <div className="text-center">
          <div className="text-sm text-muted-foreground mb-2">
            Using: <span className="font-medium text-voice-primary">Ava Multilingual (Neural)</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {!vibeVoice.isSupported() 
              ? "Speech synthesis not supported in this browser" 
              : "Enter text and click to generate speech"
            }
          </div>
        </div>
      </div>
    </Card>
  );
};

export default VoiceControls;