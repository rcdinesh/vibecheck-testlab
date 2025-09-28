interface MusicConfig {
  enabled: boolean;
  introDuration: number;     // 15 seconds
  fadeDuration: number;      // 5-10 seconds
  fadeType: 'linear' | 'exponential';
  musicVolume: number;       // 0-1
  speechVolume: number;      // 0-1
}

interface AudioMixerOptions {
  onMusicEnd?: () => void;
  onSpeechStart?: () => void;
  onMixComplete?: () => void;
}

export class AudioMixer {
  private audioContext: AudioContext | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private speechAudio: HTMLAudioElement | null = null;
  private isInitialized = false;
  private isMixing = false;
  
  constructor(private options: AudioMixerOptions = {}) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error);
      throw new Error('Web Audio API not supported');
    }
  }

  async loadMusicFile(audioUrl: string): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }

    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      this.musicBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error('Failed to load music file:', error);
      throw new Error('Failed to load music file');
    }
  }

  async mixWithSpeech(
    speechAudioData: string, 
    config: MusicConfig
  ): Promise<{ mixedUrl: string; cleanup: () => void }> {
    if (!config.enabled || !this.musicBuffer) {
      // Return speech-only if music disabled
      return this.createSpeechOnlyUrl(speechAudioData);
    }

    await this.initialize();
    
    // Create speech audio element
    const speechBlob = this.base64ToBlob(speechAudioData);
    const speechUrl = URL.createObjectURL(speechBlob);
    this.speechAudio = new Audio(speechUrl);

    return new Promise((resolve, reject) => {
      // Create offline context for mixing
      const offlineContext = new OfflineAudioContext(
        2, // stereo
        this.audioContext!.sampleRate * (config.introDuration + config.fadeDuration + 30), // estimated duration
        this.audioContext!.sampleRate
      );

      this.createMixedAudio(offlineContext, speechAudioData, config)
        .then(resolve)
        .catch(reject);
    });
  }

  private async createMixedAudio(
    offlineContext: OfflineAudioContext,
    speechAudioData: string,
    config: MusicConfig
  ): Promise<{ mixedUrl: string; cleanup: () => void }> {
    // Create music source
    const musicSource = offlineContext.createBufferSource();
    musicSource.buffer = this.musicBuffer;
    
    // Create gain nodes
    const musicGain = offlineContext.createGain();
    const masterGain = offlineContext.createGain();
    
    // Connect audio graph
    musicSource.connect(musicGain);
    musicGain.connect(masterGain);
    masterGain.connect(offlineContext.destination);
    
    // Set initial volumes
    musicGain.gain.setValueAtTime(config.musicVolume, 0);
    
    // Schedule music fade
    const fadeStartTime = config.introDuration;
    const fadeEndTime = fadeStartTime + config.fadeDuration;
    
    if (config.fadeType === 'exponential') {
      musicGain.gain.exponentialRampToValueAtTime(0.001, fadeEndTime);
    } else {
      musicGain.gain.linearRampToValueAtTime(0, fadeEndTime);
    }
    
    // Start music
    musicSource.start(0);
    
    try {
      const renderedBuffer = await offlineContext.startRendering();
      
      // Convert to blob and create URL
      const audioBlob = this.audioBufferToBlob(renderedBuffer);
      const mixedUrl = URL.createObjectURL(audioBlob);
      
      return {
        mixedUrl,
        cleanup: () => {
          URL.revokeObjectURL(mixedUrl);
        }
      };
    } catch (error) {
      console.error('Failed to render mixed audio:', error);
      throw new Error('Failed to create mixed audio');
    }
  }

  async playMixedSequence(
    speechAudioData: string,
    config: MusicConfig
  ): Promise<void> {
    if (!config.enabled || !this.musicBuffer) {
      // Play speech only
      this.playSpeechOnly(speechAudioData);
      return;
    }

    this.isMixing = true;
    await this.initialize();

    // Create and play music
    this.musicSource = this.audioContext!.createBufferSource();
    this.musicGain = this.audioContext!.createGain();
    
    this.musicSource.buffer = this.musicBuffer;
    this.musicSource.connect(this.musicGain);
    this.musicGain.connect(this.audioContext!.destination);
    
    // Set initial volume
    this.musicGain.gain.setValueAtTime(config.musicVolume, this.audioContext!.currentTime);
    
    // Start music
    this.musicSource.start();
    
    // Schedule fade and speech
    setTimeout(() => {
      this.startFadeAndSpeech(speechAudioData, config);
    }, config.introDuration * 1000);
  }

  private startFadeAndSpeech(speechAudioData: string, config: MusicConfig): void {
    if (!this.musicGain || !this.audioContext) return;
    
    const currentTime = this.audioContext.currentTime;
    const fadeEndTime = currentTime + config.fadeDuration;
    
    // Start music fade
    if (config.fadeType === 'exponential') {
      this.musicGain.gain.exponentialRampToValueAtTime(0.001, fadeEndTime);
    } else {
      this.musicGain.gain.linearRampToValueAtTime(0, fadeEndTime);
    }
    
    // Start speech during fade
    setTimeout(() => {
      this.playSpeechOnly(speechAudioData);
      this.options.onSpeechStart?.();
    }, (config.fadeDuration / 2) * 1000);
    
    // Stop music completely after fade
    setTimeout(() => {
      this.stopMusic();
      this.options.onMusicEnd?.();
    }, config.fadeDuration * 1000);
  }

  private playSpeechOnly(speechAudioData: string): void {
    const speechBlob = this.base64ToBlob(speechAudioData);
    const speechUrl = URL.createObjectURL(speechBlob);
    
    this.speechAudio = new Audio(speechUrl);
    this.speechAudio.volume = 0.8; // 80% volume for speech
    this.speechAudio.play();
    
    this.speechAudio.onended = () => {
      URL.revokeObjectURL(speechUrl);
      this.options.onMixComplete?.();
    };
  }

  private createSpeechOnlyUrl(speechAudioData: string): { mixedUrl: string; cleanup: () => void } {
    const speechBlob = this.base64ToBlob(speechAudioData);
    const speechUrl = URL.createObjectURL(speechBlob);
    
    return {
      mixedUrl: speechUrl,
      cleanup: () => URL.revokeObjectURL(speechUrl)
    };
  }

  private base64ToBlob(base64: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: 'audio/mp3' });
  }

  private audioBufferToBlob(buffer: AudioBuffer): Blob {
    const numberOfChannels = buffer.numberOfChannels;
    const length = buffer.length * numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    
    let offset = 0;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = buffer.getChannelData(channel)[i];
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  stop(): void {
    this.stopMusic();
    this.stopSpeech();
    this.isMixing = false;
  }

  private stopMusic(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.musicSource = null;
    }
  }

  private stopSpeech(): void {
    if (this.speechAudio) {
      this.speechAudio.pause();
      this.speechAudio.currentTime = 0;
      this.speechAudio = null;
    }
  }

  isSupported(): boolean {
    return !!(window.AudioContext || (window as any).webkitAudioContext);
  }
}

export type { MusicConfig, AudioMixerOptions };