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
    <div className="space-y-6">
      {/* Voice Input Section */}
      <Card className="p-6 bg-gradient-card border-border/50">
        <h3 className="text-lg font-semibold mb-4 text-foreground">Voice Input</h3>
        <div className="flex items-center gap-4">
          <Button
            variant={isRecording ? "destructive" : "default"}
            size="lg"
            onClick={handleRecordToggle}
            className={cn(
              "relative",
              isRecording && "animate-pulse-glow"
            )}
          >
            {isRecording ? (
              <>
                <MicOff className="w-5 h-5 mr-2" />
                Stop Recording
              </>
            ) : (
              <>
                <Mic className="w-5 h-5 mr-2" />
                Start Recording
              </>
            )}
          </Button>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={cn(
                  "w-1 h-8 bg-voice-primary rounded-full transition-all duration-100",
                  isRecording && "animate-voice-wave",
                  !isRecording && "h-2 opacity-50"
                )}
                style={{
                  animationDelay: `${i * 0.1}s`
                }}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* Text Input Section */}
      <Card className="p-6 bg-gradient-card border-border/50">
        <h3 className="text-lg font-semibold mb-4 text-foreground">Text to Speech</h3>
        <Textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Enter text to synthesize..."
          className="min-h-[120px] mb-4 bg-background border-border/50 focus:border-voice-primary transition-colors"
        />
        <div className="space-y-4">
          {/* Voice Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Voice Preset</label>
              <Select value={selectedPreset} onValueChange={(value: VibeVoicePreset) => setSelectedPreset(value)}>
                <SelectTrigger className="bg-background border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">Natural</SelectItem>
                  <SelectItem value="expressive">Expressive</SelectItem>
                  <SelectItem value="calm">Calm</SelectItem>
                  <SelectItem value="energetic">Energetic</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Voice</label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger className="bg-background border-border/50">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {availableVoices.map((voice) => (
                    <SelectItem key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Play Controls */}
          <div className="flex items-center gap-4">
            <Button
              variant={isPlaying ? "secondary" : "default"}
              size="lg"
              onClick={handlePlayToggle}
              disabled={!text.trim() || !vibeVoice.isSupported()}
              className="bg-gradient-voice hover:opacity-90 transition-opacity"
            >
              {isPlaying ? (
                <>
                  <Square className="w-5 h-5 mr-2" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Synthesize
                </>
              )}
            </Button>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Volume2 className="w-4 h-4" />
              <span className="text-sm">
                {vibeVoice.isSupported() ? 
                  `VibeVoice ${selectedPreset} mode` : 
                  "Speech synthesis not supported"
                }
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default VoiceControls;