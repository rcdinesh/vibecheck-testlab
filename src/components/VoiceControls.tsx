// Voice Controls Component
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, MicOff, Play, Square, Volume2, Settings, Download } from "lucide-react";
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
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [text, setText] = useState("");
  const [lastAudioData, setLastAudioData] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
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

  const handleSynthesize = async () => {
    if (!text.trim()) {
      toast({
        title: "No text to speak",
        description: "Please enter some text first.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSynthesizing(true);
      const settings = {
        ...VIBEVOICE_PRESETS[selectedPreset],
        voice: selectedVoice || undefined,
      };
      const audioData = await vibeVoice.speak(text, settings);
      setLastAudioData(audioData);
      
      // Create audio URL for playback
      const byteCharacters = atob(audioData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      
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
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handlePlay = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      setIsPlaying(true);
      onPlay?.();
      
      audio.onended = () => {
        setIsPlaying(false);
        onStop?.();
      };
      
      audio.play().catch((error) => {
        console.error("Playback error:", error);
        setIsPlaying(false);
        toast({
          title: "Playback Error",
          description: "Failed to play audio.",
          variant: "destructive",
        });
      });
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    onStop?.();
  };

  const handleDownload = () => {
    if (!lastAudioData) {
      toast({
        title: "No audio to download",
        description: "Please generate speech first.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convert base64 to blob
      const byteCharacters = atob(lastAudioData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/mp3' });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `azure-tts-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: "MP3 file is being downloaded.",
      });
    } catch (error) {
      console.error("Download failed:", error);
      toast({
        title: "Download failed",
        description: "Failed to download audio file.",
        variant: "destructive",
      });
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
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Character count:</span>
            <span className="text-sm font-medium text-voice-primary">{text.length}</span>
          </div>
          <Textarea
            placeholder="Enter text to synthesize..."
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            className="min-h-[150px] resize-none border-border/50 focus:border-voice-primary text-lg"
          />
        </div>
        
        <div className="flex gap-3">
          <Button
            onClick={handleSynthesize}
            disabled={!text.trim() || isSynthesizing}
            size="lg"
            className="flex-1 bg-voice-primary hover:bg-voice-primary/90 text-white font-medium py-4 text-lg rounded-lg transition-all duration-200"
          >
            {isSynthesizing ? (
              <>
                <Square className="w-6 h-6 mr-2 animate-pulse" />
                Synthesizing...
              </>
            ) : (
              <>
                <Play className="w-6 h-6 mr-2" />
                Synthesize Speech
              </>
            )}
          </Button>
        </div>
        
        {lastAudioData && (
          <div className="p-4 bg-background/50 rounded-lg border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Audio Ready</span>
              <div className="flex gap-2">
                <Button
                  onClick={handlePlay}
                  disabled={isPlaying}
                  size="sm"
                  variant="outline"
                  className="border-voice-primary/20 hover:bg-voice-primary/10"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Play
                </Button>
                <Button
                  onClick={handleStop}
                  disabled={!isPlaying}
                  size="sm"
                  variant="outline"
                  className="border-voice-primary/20 hover:bg-voice-primary/10"
                >
                  <Square className="w-4 h-4 mr-1" />
                  Stop
                </Button>
                <Button
                  onClick={handleDownload}
                  size="sm"
                  variant="outline"
                  className="border-voice-primary/20 hover:bg-voice-primary/10"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download MP3
                </Button>
              </div>
            </div>
            {isPlaying && (
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="bg-voice-primary h-full rounded-full animate-pulse"></div>
              </div>
            )}
          </div>
        )}
        
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