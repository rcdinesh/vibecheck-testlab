import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Square, Download } from "lucide-react";

interface AudioPlayerProps {
  audioUrl: string;
  audioData: string;
  onDownload: () => void;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
}

const AudioPlayer = ({
  audioUrl,
  audioData,
  onDownload,
  isPlaying,
  onPlay,
  onPause,
  onStop,
}: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onStop);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onStop);
    };
  }, [onStop]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      onPause();
    } else {
      audio.play();
      onPlay();
    }
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    onStop();
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 bg-background/50 rounded-lg border border-border/50 space-y-3">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Audio Ready</span>
        <span className="text-xs text-muted-foreground">
          {duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : 'Loading...'}
        </span>
      </div>

      <div className="space-y-2">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={handleSeek}
          className="w-full"
          disabled={!duration}
        />
        
        <div className="flex items-center gap-2">
          <Button
            onClick={handlePlayPause}
            size="sm"
            variant="outline"
            className="border-voice-primary/20 hover:bg-voice-primary/10"
            disabled={!audioUrl}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 mr-1" />
            ) : (
              <Play className="w-4 h-4 mr-1" />
            )}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          
          <Button
            onClick={handleStop}
            size="sm"
            variant="outline"
            className="border-voice-primary/20 hover:bg-voice-primary/10"
            disabled={!duration}
          >
            <Square className="w-4 h-4 mr-1" />
            Stop
          </Button>
          
          <Button
            onClick={onDownload}
            size="sm"
            variant="outline"
            className="border-voice-primary/20 hover:bg-voice-primary/10 ml-auto"
          >
            <Download className="w-4 h-4 mr-1" />
            Download MP3
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;