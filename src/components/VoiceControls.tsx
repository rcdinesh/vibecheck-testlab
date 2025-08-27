import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Play, Square, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [text, setText] = useState("Welcome to Microsoft Vibecoice testing. Enter your text here to test voice synthesis capabilities.");

  const handleRecordToggle = () => {
    if (isRecording) {
      setIsRecording(false);
      onStopRecording?.();
    } else {
      setIsRecording(true);
      onStartRecording?.();
    }
  };

  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsPlaying(false);
      onStop?.();
    } else {
      setIsPlaying(true);
      onPlay?.();
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    onTextChange?.(value);
  };

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
        <div className="flex items-center gap-4">
          <Button
            variant={isPlaying ? "secondary" : "default"}
            size="lg"
            onClick={handlePlayToggle}
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
                Play
              </>
            )}
          </Button>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Volume2 className="w-4 h-4" />
            <span className="text-sm">Ready to synthesize</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default VoiceControls;