interface VoiceSettings {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  speaker_id?: string;
  emotion?: 'natural' | 'expressive' | 'calm' | 'energetic' | 'professional';
  db_normalize?: boolean;
  speech_tok_compress_ratio?: number;
}

interface TTSProvider {
  speak(text: string, settings?: VoiceSettings): Promise<void>;
  stop(): void;
  getVoices(): Promise<any[]>;
  isSupported(): boolean;
}

class AzureSpeechTTS implements TTSProvider {
  private currentAudio: HTMLAudioElement | null = null;
  private supabaseUrl = 'https://dhunaihggondbpiiqqmx.supabase.co';

  async speak(text: string, settings: VoiceSettings = {}): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        this.stop(); // Stop any ongoing speech

        const response = await fetch(`${this.supabaseUrl}/functions/v1/azure-tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voice: settings.voice || 'en-US-AvaMultilingualNeural',
            rate: settings.rate ?? 1.0,
            pitch: settings.pitch ?? 1.0,
            volume: settings.volume ?? 1.0,
            emotion: settings.emotion || 'natural',
            speaker_id: settings.speaker_id
          })
        });

        if (!response.ok) {
          throw new Error(`Azure TTS request failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        // Convert base64 to blob and play
        const audioBlob = this.base64ToBlob(data.audio, 'audio/mp3');
        const audioUrl = URL.createObjectURL(audioBlob);
        
        this.currentAudio = new Audio(audioUrl);
        this.currentAudio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        this.currentAudio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          reject(new Error('Audio playback failed'));
        };

        await this.currentAudio.play();
      } catch (error) {
        reject(error);
      }
    });
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }

  async getVoices(): Promise<any[]> {
    // Return Microsoft Azure neural voices with Ava Multilingual as primary option
    return [
      { name: 'en-US-AvaMultilingualNeural', lang: 'en-US', displayName: 'Ava Multilingual (Female, US)' },
      { name: 'en-US-AriaNeural', lang: 'en-US', displayName: 'Aria (Female, US)' },
      { name: 'en-US-JennyNeural', lang: 'en-US', displayName: 'Jenny (Female, US)' },
      { name: 'en-US-GuyNeural', lang: 'en-US', displayName: 'Guy (Male, US)' },
      { name: 'en-US-DavisNeural', lang: 'en-US', displayName: 'Davis (Male, US)' },
      { name: 'en-US-AmberNeural', lang: 'en-US', displayName: 'Amber (Female, US)' },
      { name: 'en-US-AnaNeural', lang: 'en-US', displayName: 'Ana (Female, US)' },
      { name: 'en-US-BrandonNeural', lang: 'en-US', displayName: 'Brandon (Male, US)' },
      { name: 'en-US-ChristopherNeural', lang: 'en-US', displayName: 'Christopher (Male, US)' },
      { name: 'en-US-CoraNeural', lang: 'en-US', displayName: 'Cora (Female, US)' },
      { name: 'en-US-ElizabethNeural', lang: 'en-US', displayName: 'Elizabeth (Female, US)' },
      { name: 'en-US-EricNeural', lang: 'en-US', displayName: 'Eric (Male, US)' },
      { name: 'en-US-JacobNeural', lang: 'en-US', displayName: 'Jacob (Male, US)' },
      { name: 'en-US-JaneNeural', lang: 'en-US', displayName: 'Jane (Female, US)' },
      { name: 'en-US-JasonNeural', lang: 'en-US', displayName: 'Jason (Male, US)' },
      { name: 'en-US-MichelleNeural', lang: 'en-US', displayName: 'Michelle (Female, US)' },
      { name: 'en-US-MonicaNeural', lang: 'en-US', displayName: 'Monica (Female, US)' },
      { name: 'en-US-NancyNeural', lang: 'en-US', displayName: 'Nancy (Female, US)' },
      { name: 'en-US-RogerNeural', lang: 'en-US', displayName: 'Roger (Male, US)' },
      { name: 'en-US-SaraNeural', lang: 'en-US', displayName: 'Sara (Female, US)' },
      { name: 'en-US-TonyNeural', lang: 'en-US', displayName: 'Tony (Male, US)' }
    ];
  }

  isSupported(): boolean {
    return true; // Azure TTS works in all modern browsers
  }
}

export class VibeVoiceTTS {
  private provider: TTSProvider;
  private isPlaying = false;
  private onPlayingChange?: (playing: boolean) => void;
  private systemPrompt = "Transform the text provided by various speakers into speech output, utilizing the distinct voice of each respective speaker.\n";
  private speechTokCompressRatio = 3200;
  private dbNormalize = true;

  constructor(onPlayingChange?: (playing: boolean) => void) {
    this.provider = new AzureSpeechTTS();
    this.onPlayingChange = onPlayingChange;
  }

  async speak(text: string, settings?: VoiceSettings): Promise<void> {
    try {
      this.setPlaying(true);
      
      // Apply VibeVoice-style processing
      const processedText = this.processText(text, settings);
      const enhancedSettings = this.enhanceSettings(settings);
      
      await this.provider.speak(processedText, enhancedSettings);
      
      console.log('VibeVoice synthesis completed:', {
        originalText: text,
        processedText,
        settings: enhancedSettings,
        systemPrompt: this.systemPrompt
      });
    } catch (error) {
      console.error('VibeVoice synthesis error:', error);
      throw error;
    } finally {
      this.setPlaying(false);
    }
  }

  private processText(text: string, settings?: VoiceSettings): string {
    // Apply VibeVoice-style text processing with system prompt
    const speakerId = settings?.speaker_id || 'default';
    const emotion = settings?.emotion || 'natural';
    
    // Simulate VibeVoice's speaker-aware text transformation
    const processedText = `[Speaker: ${speakerId}] [Emotion: ${emotion}] ${text}`;
    
    return processedText;
  }

  private enhanceSettings(settings?: VoiceSettings): VoiceSettings {
    const enhanced = { ...settings };
    
    // Apply VibeVoice-style parameter enhancement
    if (enhanced.db_normalize !== false) {
      // Apply decibel normalization principles
      enhanced.volume = Math.min(1.0, (enhanced.volume || 1.0) * 0.95);
    }
    
    // Apply compression ratio influence on speech parameters
    const compressionFactor = (enhanced.speech_tok_compress_ratio || this.speechTokCompressRatio) / 3200;
    enhanced.rate = (enhanced.rate || 1.0) * Math.max(0.8, Math.min(1.2, compressionFactor));
    
    return enhanced;
  }

  stop(): void {
    this.provider.stop();
    this.setPlaying(false);
  }

  async getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
    return this.provider.getVoices();
  }

  isSupported(): boolean {
    return this.provider.isSupported();
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  private setPlaying(playing: boolean): void {
    this.isPlaying = playing;
    this.onPlayingChange?.(playing);
  }
}

// VibeVoice-inspired presets based on Microsoft's processor implementation
export const VIBEVOICE_PRESETS = {
  natural: { 
    rate: 1.0, 
    pitch: 1.0, 
    volume: 1.0, 
    emotion: 'natural' as const,
    db_normalize: true,
    speech_tok_compress_ratio: 3200,
    speaker_id: 'neutral'
  },
  expressive: { 
    rate: 0.9, 
    pitch: 1.1, 
    volume: 1.0, 
    emotion: 'expressive' as const,
    db_normalize: true,
    speech_tok_compress_ratio: 2800,
    speaker_id: 'expressive'
  },
  calm: { 
    rate: 0.8, 
    pitch: 0.9, 
    volume: 0.9, 
    emotion: 'calm' as const,
    db_normalize: true,
    speech_tok_compress_ratio: 3600,
    speaker_id: 'calm'
  },
  energetic: { 
    rate: 1.2, 
    pitch: 1.1, 
    volume: 1.0, 
    emotion: 'energetic' as const,
    db_normalize: true,
    speech_tok_compress_ratio: 2400,
    speaker_id: 'energetic'
  },
  professional: { 
    rate: 0.95, 
    pitch: 1.0, 
    volume: 0.95, 
    emotion: 'professional' as const,
    db_normalize: true,
    speech_tok_compress_ratio: 3200,
    speaker_id: 'professional'
  },
} as const;

export type VibeVoicePreset = keyof typeof VIBEVOICE_PRESETS;