import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Mic, Speaker, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceStatusProps {
  isConnected?: boolean;
  isRecording?: boolean;
  isPlaying?: boolean;
  quality?: "excellent" | "good" | "fair" | "poor";
}

const VoiceStatus = ({
  isConnected = true,
  isRecording = false,
  isPlaying = false,
  quality = "excellent"
}: VoiceStatusProps) => {
  const qualityColors = {
    excellent: "bg-voice-success",
    good: "bg-voice-primary",
    fair: "bg-voice-warning",
    poor: "bg-destructive"
  };

  return (
    <Card className="p-6 bg-gradient-card border-border/50">
      <h3 className="text-lg font-semibold mb-4 text-foreground">System Status</h3>
      
      <div className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-voice-success" />
            ) : (
              <WifiOff className="w-4 h-4 text-destructive" />
            )}
            <span className="text-sm font-medium">Connection</span>
          </div>
          <Badge variant={isConnected ? "default" : "destructive"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        {/* Recording Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className={cn(
              "w-4 h-4",
              isRecording ? "text-voice-primary animate-pulse" : "text-muted-foreground"
            )} />
            <span className="text-sm font-medium">Recording</span>
          </div>
          <Badge variant={isRecording ? "default" : "secondary"}>
            {isRecording ? "Active" : "Inactive"}
          </Badge>
        </div>

        {/* Playback Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Speaker className={cn(
              "w-4 h-4",
              isPlaying ? "text-voice-primary animate-pulse" : "text-muted-foreground"
            )} />
            <span className="text-sm font-medium">Playback</span>
          </div>
          <Badge variant={isPlaying ? "default" : "secondary"}>
            {isPlaying ? "Playing" : "Idle"}
          </Badge>
        </div>

        {/* Audio Quality */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-voice-primary" />
            <span className="text-sm font-medium">Audio Quality</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", qualityColors[quality])} />
            <Badge variant="outline" className="capitalize">
              {quality}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default VoiceStatus;