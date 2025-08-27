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
  getVoices(): Promise<SpeechSynthesisVoice[]>;
  isSupported(): boolean;
}

class WebSpeechTTS implements TTSProvider {
  private utterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    this.loadVoices();
  }

  private loadVoices() {
    const loadVoicesWhenReady = () => {
      this.voices = speechSynthesis.getVoices();
      if (this.voices.length === 0) {
        setTimeout(loadVoicesWhenReady, 100);
      }
    };
    loadVoicesWhenReady();

    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoicesWhenReady;
    }
  }

  async speak(text: string, settings: VoiceSettings = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      this.stop(); // Stop any ongoing speech

      this.utterance = new SpeechSynthesisUtterance(text);
      
      // Set voice
      if (settings.voice) {
        const voice = this.voices.find(v => v.name.includes(settings.voice!));
        if (voice) {
          this.utterance.voice = voice;
        }
      }

      // Set voice parameters
      this.utterance.rate = settings.rate ?? 1.0;
      this.utterance.pitch = settings.pitch ?? 1.0;
      this.utterance.volume = settings.volume ?? 1.0;

      this.utterance.onend = () => resolve();
      this.utterance.onerror = (event) => reject(new Error(event.error));

      speechSynthesis.speak(this.utterance);
    });
  }

  stop(): void {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
  }

  async getVoices(): Promise<SpeechSynthesisVoice[]> {
    // Wait for voices to load if they haven't yet
    let retries = 10;
    while (this.voices.length === 0 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries--;
    }
    return this.voices;
  }

  isSupported(): boolean {
    return 'speechSynthesis' in window;
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
    this.provider = new WebSpeechTTS();
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