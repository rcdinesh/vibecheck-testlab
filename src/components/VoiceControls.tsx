// Voice Controls Component
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, MicOff, Play, Square, Volume2, Settings, Download, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { VibeVoiceTTS, VIBEVOICE_PRESETS, VibeVoicePreset } from "@/utils/textToSpeech";
import { AudioMixer, MusicConfig } from "@/utils/AudioMixer";
import { useToast } from "@/components/ui/use-toast";
import AudioPlayer from "./AudioPlayer";
import kidcastIntro from "@/assets/kidcast-intro.wav";
import kidcastOutro from "@/assets/kidcast-outro.wav";

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
  const [mixedAudioBlob, setMixedAudioBlob] = useState<Blob | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<VibeVoicePreset>("natural");
  const [vibeVoice] = useState(() => new VibeVoiceTTS((playing) => setIsPlaying(playing)));
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  
  // Music integration state
  const [musicConfig, setMusicConfig] = useState<MusicConfig>({
    enabled: true,
    introDuration: 22,
    fadeDuration: 7,
    fadeType: 'linear',
    musicVolume: 0.6,
    speechVolume: 0.8,
    outroEnabled: true,
    outroFadeInDuration: 10,
    outroDuration: 15
  });
  const [audioMixer] = useState(() => {
    const mixer = new AudioMixer({
      onMusicEnd: () => console.log('Music ended'),
      onSpeechStart: () => console.log('Speech started'),
      onMixComplete: () => setIsPlaying(false)
    });
    console.log('AudioMixer instance created:', mixer);
    console.log('loadIntroOutroFiles available:', typeof mixer.loadIntroOutroFiles);
    return mixer;
  });
  
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
      
      // Load intro/outro files if music is enabled
      if (musicConfig.enabled && audioMixer.isSupported()) {
        await audioMixer.loadIntroOutroFiles(kidcastIntro, kidcastOutro);
      }
      
      const settings = {
        ...VIBEVOICE_PRESETS[selectedPreset],
        voice: selectedVoice || undefined,
      };
      const audioData = await vibeVoice.synthesizeOnly(text, settings);
      setLastAudioData(audioData);
      
      // Create mixed or speech-only audio
      if (musicConfig.enabled && audioMixer.isSupported()) {
        try {
          // Use AudioMixer to create mixed audio with intro and outro
          const { mixedUrl, cleanup } = await audioMixer.mixWithSpeech(audioData, musicConfig);
          setAudioUrl(mixedUrl);
          
          // Convert URL back to blob for download
          const response = await fetch(mixedUrl);
          const mixedBlob = await response.blob();
          setMixedAudioBlob(mixedBlob);
        } catch (error) {
          console.error('Failed to create mixed audio:', error);
          // Fallback to speech-only
          const speechBlob = base64ToBlob(audioData);
          setMixedAudioBlob(speechBlob);
          const speechUrl = URL.createObjectURL(speechBlob);
          setAudioUrl(speechUrl);
        }
      } else {
        // Create speech-only URL
        const speechBlob = base64ToBlob(audioData);
        setMixedAudioBlob(speechBlob);
        const speechUrl = URL.createObjectURL(speechBlob);
        setAudioUrl(speechUrl);
      }
      
      toast({
        title: musicConfig.enabled ? "Mixed Audio Ready" : "Speech Complete",
        description: musicConfig.enabled ? "Music intro + speech ready to play." : "Text-to-speech synthesis finished.",
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

  const handleAudioPlay = () => {
    setIsPlaying(true);
    onPlay?.();
  };

  const handleAudioPause = () => {
    setIsPlaying(false);
  };

  const handleAudioStop = () => {
    setIsPlaying(false);
    onStop?.();
  };

  const handleDownload = () => {
    const audioToDownload = mixedAudioBlob || (lastAudioData ? base64ToBlob(lastAudioData) : null);
    
    if (!audioToDownload) {
      toast({
        title: "No audio to download",
        description: "Please generate speech first.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create download link
      const url = URL.createObjectURL(audioToDownload);
      const a = document.createElement('a');
      a.href = url;
      const ext = audioToDownload.type.includes('wav') ? 'wav' : 'mp3';
      const filename = musicConfig.enabled ? `kidcast-episode-${Date.now()}.${ext}` : `azure-tts-${Date.now()}.mp3`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: musicConfig.enabled ? "Mixed episode with music intro downloading." : "MP3 file is being downloaded.",
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

  const base64ToBlob = (base64: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: 'audio/mp3' });
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
        
        {/* Music Controls */}
        <div className="space-y-4 p-4 bg-gradient-to-r from-voice-primary/5 to-voice-secondary/5 rounded-lg border border-voice-primary/20">
          <div className="flex items-center gap-3">
            <Music className="w-5 h-5 text-voice-primary" />
            <span className="font-medium text-foreground">Music Intro</span>
            <Switch
              checked={musicConfig.enabled}
              onCheckedChange={(enabled) => setMusicConfig(prev => ({ ...prev, enabled }))}
              className="ml-auto"
            />
          </div>
          
          {musicConfig.enabled && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-20">Fade Duration:</span>
                <Slider
                  value={[musicConfig.fadeDuration]}
                  onValueChange={(value) => setMusicConfig(prev => ({ ...prev, fadeDuration: value[0] }))}
                  min={5}
                  max={10}
                  step={1}
                  className="flex-1"
                />
                <span className="text-sm font-medium text-voice-primary w-8">{musicConfig.fadeDuration}s</span>
              </div>
              
              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm text-muted-foreground w-20">Outro Music:</span>
                <Switch
                  checked={musicConfig.outroEnabled}
                  onCheckedChange={(outroEnabled) => setMusicConfig(prev => ({ ...prev, outroEnabled }))}
                />
              </div>
              
              <div className="text-xs text-muted-foreground mt-2">
                • Music intro: 22s full → {musicConfig.fadeDuration}s fade → speech only
                {musicConfig.outroEnabled && (
                  <> • Music outro: fades in last 10s of speech → plays 15s after speech ends</>
                )}
              </div>
            </div>
          )}
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
                {musicConfig.enabled ? <Music className="w-6 h-6 mr-2" /> : <Play className="w-6 h-6 mr-2" />}
                {musicConfig.enabled ? 'Create Episode' : 'Synthesize Speech'}
              </>
            )}
          </Button>
        </div>
        
        {lastAudioData && audioUrl && (
          <AudioPlayer
            audioUrl={audioUrl}
            audioData={lastAudioData}
            onDownload={handleDownload}
            isPlaying={isPlaying}
            onPlay={handleAudioPlay}
            onPause={handleAudioPause}
            onStop={handleAudioStop}
          />
        )}
        
        <div className="text-center">
          <div className="text-sm text-muted-foreground mb-2">
            Using: <span className="font-medium text-voice-primary">Ava Multilingual (Neural)</span>
            {musicConfig.enabled && (
              <> + <span className="font-medium text-voice-secondary">Kidcast Theme</span></>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {!vibeVoice.isSupported() 
              ? "Speech synthesis not supported in this browser" 
              : musicConfig.enabled 
                ? "Create podcast episodes with music intro and speech"
                : "Enter text and click to generate speech"
            }
          </div>
        </div>
      </div>
    </Card>
  );
};

export default VoiceControls;