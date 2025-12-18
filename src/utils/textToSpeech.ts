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
  speak(text: string, settings?: VoiceSettings): Promise<string>;
  synthesizeOnly(text: string, settings?: VoiceSettings): Promise<string>;
  stop(): void;
  getVoices(): Promise<any[]>;
  isSupported(): boolean;
}

class AzureSpeechTTS implements TTSProvider {
  private currentAudio: HTMLAudioElement | null = null;
  private supabaseUrl = 'https://dhunaihggondbpiiqqmx.supabase.co';
  private isPlaying = false;
  private audioQueue: HTMLAudioElement[] = [];
  private currentIndex = 0;

  // Text chunking settings
  private readonly MAX_CHUNK_LENGTH = 1000; // Characters per chunk
  private readonly REQUEST_TIMEOUT = 45000; // 45 seconds timeout
  private readonly MAX_RETRIES = 3;

  private audioData: string | null = null;

  async speak(text: string, settings: VoiceSettings = {}): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        this.stop(); // Stop any ongoing speech
        
        // Check if text needs chunking
        if (text.length <= this.MAX_CHUNK_LENGTH) {
          await this.speakSingle(text, settings);
          resolve(this.audioData || '');
        } else {
          await this.speakChunked(text, settings);
          resolve(this.audioData || '');
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async synthesizeOnly(text: string, settings: VoiceSettings = {}): Promise<string> {
    try {
      this.stop(); // Stop any ongoing speech
      
      // For any text length, send the complete text to Azure TTS
      // Azure TTS can handle longer text than our chunking limit
      await this.synthesizeChunkOnly(text, settings);
      return this.audioData || '';
    } catch (error) {
      throw error;
    }
  }

  private async synthesizeChunkOnly(text: string, settings: VoiceSettings, retryCount = 0): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

        const response = await fetch(`${this.supabaseUrl}/functions/v1/azure-tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voice: 'en-US-Ava:DragonHDLatestNeural'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Azure TTS request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        // Store the audio data but don't create audio element
        this.audioData = data.audio;
        resolve();
      } catch (error) {
        // Retry logic for failed requests
        if (retryCount < this.MAX_RETRIES && 
            (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout')))) {
          console.log(`Retrying chunk synthesis (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
          try {
            await this.synthesizeChunkOnly(text, settings, retryCount + 1);
            resolve();
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          reject(error);
        }
      }
    });
  }

  private async speakSingle(text: string, settings: VoiceSettings): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const audioElement = await this.synthesizeChunk(text, settings);
        this.currentAudio = audioElement;
        
        audioElement.onended = () => resolve();
        audioElement.onerror = () => reject(new Error('Audio playback failed'));
        
        await audioElement.play();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async speakChunked(text: string, settings: VoiceSettings): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const chunks = this.chunkText(text);
        console.log(`Processing ${chunks.length} chunks for long text`);
        
        // Pre-synthesize all chunks
        this.audioQueue = [];
        for (let i = 0; i < chunks.length; i++) {
          console.log(`Synthesizing chunk ${i + 1}/${chunks.length}`);
          const audioElement = await this.synthesizeChunk(chunks[i], settings);
          this.audioQueue.push(audioElement);
        }
        
        // Play chunks sequentially
        this.currentIndex = 0;
        await this.playNextChunk();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async playNextChunk(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.currentIndex >= this.audioQueue.length) {
        resolve();
        return;
      }

      const audioElement = this.audioQueue[this.currentIndex];
      this.currentAudio = audioElement;
      
      audioElement.onended = async () => {
        this.currentIndex++;
        if (this.currentIndex < this.audioQueue.length) {
          await this.playNextChunk();
          resolve();
        } else {
          // Cleanup
          this.audioQueue = [];
          this.currentIndex = 0;
          resolve();
        }
      };
      
      audioElement.onerror = () => {
        reject(new Error(`Audio playback failed at chunk ${this.currentIndex}`));
      };
      
      audioElement.play().catch(reject);
    });
  }

  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    
    // Split by sentences first to avoid cutting mid-sentence
    const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      // If adding this sentence would exceed chunk size, start new chunk
      if (currentChunk.length + sentence.length > this.MAX_CHUNK_LENGTH && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }
    
    // Add final chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    // If no sentence splitting worked, fall back to character splitting
    if (chunks.length === 1 && chunks[0].length > this.MAX_CHUNK_LENGTH) {
      return this.chunkByLength(text);
    }
    
    return chunks;
  }

  private chunkByLength(text: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += this.MAX_CHUNK_LENGTH) {
      chunks.push(text.slice(i, i + this.MAX_CHUNK_LENGTH));
    }
    return chunks;
  }

  private async synthesizeChunk(text: string, settings: VoiceSettings, retryCount = 0): Promise<HTMLAudioElement> {
    return new Promise(async (resolve, reject) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

        const response = await fetch(`${this.supabaseUrl}/functions/v1/azure-tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voice: 'en-US-Ava:DragonHDLatestNeural'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Azure TTS request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        // Store the audio data for download
        this.audioData = data.audio;

        // Convert base64 to blob and create audio element
        const audioBlob = this.base64ToBlob(data.audio, 'audio/mp3');
        const audioUrl = URL.createObjectURL(audioBlob);
        
        const audioElement = new Audio(audioUrl);
        
        // Setup cleanup when audio ends
        audioElement.addEventListener('ended', () => {
          URL.revokeObjectURL(audioUrl);
        });
        
        // Wait for audio to be ready
        await new Promise<void>((audioResolve, audioReject) => {
          audioElement.oncanplaythrough = () => audioResolve();
          audioElement.onerror = () => {
            URL.revokeObjectURL(audioUrl);
            audioReject(new Error('Audio loading failed'));
          };
        });
        
        resolve(audioElement);
      } catch (error) {
        // Retry logic for failed requests
        if (retryCount < this.MAX_RETRIES && 
            (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout')))) {
          console.log(`Retrying chunk synthesis (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
          try {
            const result = await this.synthesizeChunk(text, settings, retryCount + 1);
            resolve(result);
          } catch (retryError) {
            reject(retryError);
          }
        } else {
          reject(error);
        }
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
    this.isPlaying = false;
    
    // Stop current audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    
    // Clear audio queue and cleanup URLs
    this.audioQueue.forEach(audio => {
      audio.pause();
      if (audio.src) {
        URL.revokeObjectURL(audio.src);
      }
    });
    this.audioQueue = [];
    this.currentIndex = 0;
  }

  async getVoices(): Promise<any[]> {
    return [
      { name: 'en-US-Ava:DragonHDLatestNeural', lang: 'en-US', displayName: 'Ava Dragon HD (Female, US)' },
    ];
  }

  isSupported(): boolean {
    return true;
  }
}

export class VibeVoiceTTS {
  private provider: TTSProvider;
  private isPlaying = false;
  private onPlayingChange?: (playing: boolean) => void;
  private onProgress?: (current: number, total: number, text: string) => void;
  private systemPrompt = "Transform the text provided by various speakers into speech output, utilizing the distinct voice of each respective speaker.\n";
  private speechTokCompressRatio = 3200;
  private dbNormalize = true;

  constructor(
    onPlayingChange?: (playing: boolean) => void,
    onProgress?: (current: number, total: number, text: string) => void
  ) {
    this.provider = new AzureSpeechTTS();
    this.onPlayingChange = onPlayingChange;
    this.onProgress = onProgress;
  }

  async speak(text: string, settings?: VoiceSettings): Promise<string> {
    try {
      this.setPlaying(true);
      
      // Notify progress start
      this.onProgress?.(0, 1, 'Starting synthesis...');
      
      // Apply VibeVoice-style processing
      const processedText = this.processText(text, settings);
      const enhancedSettings = this.enhanceSettings(settings);
      
      const audioData = await this.provider.speak(processedText, enhancedSettings);
      
      // Notify completion
      this.onProgress?.(1, 1, 'Synthesis completed');
      
      console.log('VibeVoice synthesis completed:', {
        originalText: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        textLength: text.length,
        processedLength: processedText.length,
        settings: enhancedSettings,
        systemPrompt: this.systemPrompt
      });
      
      return audioData;
    } catch (error) {
      console.error('VibeVoice synthesis error:', error);
      this.onProgress?.(0, 1, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      this.setPlaying(false);
    }
  }

  async synthesizeOnly(text: string, settings?: VoiceSettings): Promise<string> {
    try {
      // Notify progress start
      this.onProgress?.(0, 1, 'Starting synthesis...');
      
      // Apply VibeVoice-style processing
      const processedText = this.processText(text, settings);
      const enhancedSettings = this.enhanceSettings(settings);
      
      const audioData = await this.provider.synthesizeOnly(processedText, enhancedSettings);
      
      // Notify completion
      this.onProgress?.(1, 1, 'Synthesis completed');
      
      console.log('VibeVoice synthesis-only completed:', {
        originalText: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        textLength: text.length,
        processedLength: processedText.length,
        settings: enhancedSettings
      });
      
      return audioData;
    } catch (error) {
      console.error('VibeVoice synthesis error:', error);
      this.onProgress?.(0, 1, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private processText(text: string, settings?: VoiceSettings): string {
    // Just return the plain text without any formatting
    return text;
  }

  private enhanceSettings(settings?: VoiceSettings): VoiceSettings {
    const enhanced = { ...settings };
    
    // Apply VibeVoice-style parameter enhancement
    if (enhanced.db_normalize !== false) {
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

// VibeVoice-inspired presets (unchanged)
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