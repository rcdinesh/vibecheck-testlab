import { useState } from "react";
import VoiceControls from "@/components/VoiceControls";
import VoiceStatus from "@/components/VoiceStatus";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic2, Sparkles } from "lucide-react";

const Index = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentText, setCurrentText] = useState("");

  const handleStartRecording = () => {
    setIsRecording(true);
    console.log("Starting recording...");
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    console.log("Stopping recording...");
  };

  const handlePlay = () => {
    setIsPlaying(true);
    console.log("Playing voice:", currentText);
    // Simulate playback duration
    setTimeout(() => {
      setIsPlaying(false);
    }, 3000);
  };

  const handleStop = () => {
    setIsPlaying(false);
    console.log("Stopping playback...");
  };

  const handleTextChange = (text: string) => {
    setCurrentText(text);
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="relative">
              <Mic2 className="w-8 h-8 text-voice-primary" />
              <Sparkles className="w-4 h-4 text-voice-accent absolute -top-1 -right-1" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-voice bg-clip-text text-transparent">
              Microsoft Vibecoice
            </h1>
          </div>
          <p className="text-xl text-muted-foreground mb-4">
            Advanced Voice Synthesis Testing Platform
          </p>
          <Badge variant="outline" className="bg-voice-primary/10 border-voice-primary/20">
            Testing Environment
          </Badge>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Voice Controls - Takes 2 columns */}
          <div className="lg:col-span-2">
            <VoiceControls
              onTextChange={handleTextChange}
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
              onPlay={handlePlay}
              onStop={handleStop}
            />
          </div>

          {/* Status Panel - Takes 1 column */}
          <div className="space-y-6">
            <VoiceStatus
              isConnected={true}
              isRecording={isRecording}
              isPlaying={isPlaying}
              quality="excellent"
            />

            {/* Quick Stats */}
            <Card className="p-6 bg-gradient-card border-border/50">
              <h3 className="text-lg font-semibold mb-4 text-foreground">Session Info</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Characters</span>
                  <span className="text-sm font-medium">{currentText.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Voice Model</span>
                  <Badge variant="outline" className="text-xs">Vibecoice-v1</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Latency</span>
                  <span className="text-sm font-medium text-voice-success">42ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Quality</span>
                  <span className="text-sm font-medium text-voice-primary">High</span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Microsoft Vibecoice Testing Interface • Version 1.0.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;