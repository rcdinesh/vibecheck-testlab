interface VoiceSettings {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
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

  constructor(onPlayingChange?: (playing: boolean) => void) {
    this.provider = new WebSpeechTTS();
    this.onPlayingChange = onPlayingChange;
  }

  async speak(text: string, settings?: VoiceSettings): Promise<void> {
    try {
      this.setPlaying(true);
      await this.provider.speak(text, settings);
    } catch (error) {
      console.error('Text-to-speech error:', error);
      throw error;
    } finally {
      this.setPlaying(false);
    }
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

// Default voice presets that emulate VibeVoice capabilities
export const VIBEVOICE_PRESETS = {
  natural: { rate: 1.0, pitch: 1.0, volume: 1.0 },
  expressive: { rate: 0.9, pitch: 1.1, volume: 1.0 },
  calm: { rate: 0.8, pitch: 0.9, volume: 0.9 },
  energetic: { rate: 1.2, pitch: 1.1, volume: 1.0 },
  professional: { rate: 0.95, pitch: 1.0, volume: 0.95 },
} as const;

export type VibeVoicePreset = keyof typeof VIBEVOICE_PRESETS;