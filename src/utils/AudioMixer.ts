interface MusicConfig {
  enabled: boolean;
  introDuration: number;     // full intro play duration
  introFadeDuration: number; // intro fade out duration
  fadeType: 'linear' | 'exponential';
  musicVolume: number;       // 0-1
  speechVolume: number;      // 0-1
  outroEnabled: boolean;
  outroFadeInDuration: number; // fade in during last X seconds of speech
  outroDuration: number; // play for X seconds after speech ends
  outroFadeOutDuration: number; // fade out duration for outro
  introUrl?: string; // separate intro file
  outroUrl?: string; // separate outro file
}

interface AudioMixerOptions {
  onMusicEnd?: () => void;
  onSpeechStart?: () => void;
  onMixComplete?: () => void;
}

export class AudioMixer {
  private audioContext: AudioContext | null = null;
  private introBuffer: AudioBuffer | null = null;
  private outroBuffer: AudioBuffer | null = null;
  private introArrayBuffer: ArrayBuffer | null = null; // raw bytes for offline decode
  private outroArrayBuffer: ArrayBuffer | null = null; // raw bytes for offline decode
  private musicBuffer: AudioBuffer | null = null; // fallback for old single-file approach
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

  async loadIntroOutroFiles(introUrl: string, outroUrl: string): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }

    try {
      console.log('Loading intro/outro files:', { introUrl, outroUrl });
      
      const [introResponse, outroResponse] = await Promise.all([
        fetch(introUrl, { mode: 'cors' }),
        fetch(outroUrl, { mode: 'cors' })
      ]);
      
      if (!introResponse.ok) {
        throw new Error(`Failed to fetch intro: ${introResponse.status} ${introResponse.statusText}`);
      }
      if (!outroResponse.ok) {
        throw new Error(`Failed to fetch outro: ${outroResponse.status} ${outroResponse.statusText}`);
      }
      
      const [introArrayBuffer, outroArrayBuffer] = await Promise.all([
        introResponse.arrayBuffer(),
        outroResponse.arrayBuffer()
      ]);
      
      // Save raw arrays for later offline decoding
      this.introArrayBuffer = introArrayBuffer.slice(0);
      this.outroArrayBuffer = outroArrayBuffer.slice(0);
      
      console.log('Decoding audio buffers...');
      [this.introBuffer, this.outroBuffer] = await Promise.all([
        this.audioContext!.decodeAudioData(introArrayBuffer.slice(0)),
        this.audioContext!.decodeAudioData(outroArrayBuffer.slice(0))
      ]);
      
      console.log('Successfully loaded intro/outro:', {
        introDuration: this.introBuffer.duration,
        outroDuration: this.outroBuffer.duration
      });
    } catch (error) {
      console.error('Failed to load intro/outro files:', error);
      throw new Error(`Failed to load intro/outro files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async mixWithSpeech(
    speechAudioData: string, 
    config: MusicConfig
  ): Promise<{ mixedUrl: string; cleanup: () => void }> {
    if (!config.enabled || (!this.introBuffer && !this.musicBuffer)) {
      // Return speech-only if music disabled
      return this.createSpeechOnlyUrl(speechAudioData);
    }

    await this.initialize();
    
    // Decode speech to get accurate duration before creating OfflineAudioContext
    const speechBlob = this.base64ToBlob(speechAudioData);
    const speechArrayBuffer = await speechBlob.arrayBuffer();
    const speechBufferForDuration = await this.audioContext!.decodeAudioData(speechArrayBuffer.slice(0));
    const speechDuration = speechBufferForDuration.duration;

    // Create offline context for mixing with accurate timing
    const totalDuration = config.introDuration + config.introFadeDuration + speechDuration + (config.outroEnabled ? config.outroDuration : 0) + 0.5; // padding to avoid cutoff
    const offlineContext = new OfflineAudioContext(
      2, // stereo
      Math.ceil(totalDuration * this.audioContext!.sampleRate),
      this.audioContext!.sampleRate
    );

    return this.createMixedAudioWithOutro(offlineContext, speechAudioData, speechDuration, config);
  }

  private async createMixedAudioWithOutro(
    offlineContext: OfflineAudioContext,
    speechAudioData: string,
    speechDuration: number,
    config: MusicConfig
  ): Promise<{ mixedUrl: string; cleanup: () => void }> {
    // Create speech buffer
    const speechBlob = this.base64ToBlob(speechAudioData);
    const speechArrayBuffer = await speechBlob.arrayBuffer();
    const speechBuffer = await offlineContext.decodeAudioData(speechArrayBuffer);
    
    // Prepare intro/outro buffers inside the OfflineAudioContext
    let introBufferToUse: AudioBuffer;
    let outroBufferToUse: AudioBuffer | null = null;

    if (this.introArrayBuffer) {
      introBufferToUse = await offlineContext.decodeAudioData(this.introArrayBuffer.slice(0));
    } else if (this.introBuffer) {
      // Fallback: copy from realtime context buffer
      const src = this.introBuffer;
      const b = offlineContext.createBuffer(src.numberOfChannels, src.length, offlineContext.sampleRate);
      for (let ch = 0; ch < src.numberOfChannels; ch++) {
        b.getChannelData(ch).set(src.getChannelData(ch));
      }
      introBufferToUse = b;
    } else if (this.musicBuffer) {
      const src = this.musicBuffer;
      const b = offlineContext.createBuffer(src.numberOfChannels, src.length, offlineContext.sampleRate);
      for (let ch = 0; ch < src.numberOfChannels; ch++) {
        b.getChannelData(ch).set(src.getChannelData(ch));
      }
      introBufferToUse = b;
    } else {
      throw new Error('Intro audio buffer not loaded');
    }

    if (config.outroEnabled) {
      if (this.outroArrayBuffer) {
        outroBufferToUse = await offlineContext.decodeAudioData(this.outroArrayBuffer.slice(0));
      } else if (this.outroBuffer) {
        const src = this.outroBuffer;
        const b = offlineContext.createBuffer(src.numberOfChannels, src.length, offlineContext.sampleRate);
        for (let ch = 0; ch < src.numberOfChannels; ch++) {
          b.getChannelData(ch).set(src.getChannelData(ch));
        }
        outroBufferToUse = b;
      } else if (this.musicBuffer) {
        const src = this.musicBuffer;
        const b = offlineContext.createBuffer(src.numberOfChannels, src.length, offlineContext.sampleRate);
        for (let ch = 0; ch < src.numberOfChannels; ch++) {
          b.getChannelData(ch).set(src.getChannelData(ch));
        }
        outroBufferToUse = b;
      }
    }
    
    // Create music sources (intro and outro)
    const musicIntroSource = offlineContext.createBufferSource();
    musicIntroSource.buffer = introBufferToUse;
    musicIntroSource.loop = false; // No loop for separate intro
    
    const musicOutroSource = config.outroEnabled && outroBufferToUse ? offlineContext.createBufferSource() : null;
    if (musicOutroSource && outroBufferToUse) {
      musicOutroSource.buffer = outroBufferToUse;
      musicOutroSource.loop = false;
    }
    
    // Create speech source
    const speechSource = offlineContext.createBufferSource();
    speechSource.buffer = speechBuffer;
    
    // Create gain nodes
    const musicIntroGain = offlineContext.createGain();
    const musicOutroGain = config.outroEnabled ? offlineContext.createGain() : null;
    const speechGain = offlineContext.createGain();
    const masterGain = offlineContext.createGain();

    // Connect audio graph
    musicIntroSource.connect(musicIntroGain);
    if (musicOutroSource && musicOutroGain) {
      musicOutroSource.connect(musicOutroGain);
      musicOutroGain.connect(masterGain);
    }
    speechSource.connect(speechGain);
    musicIntroGain.connect(masterGain);
    speechGain.connect(masterGain);
    masterGain.connect(offlineContext.destination);

    // Calculate timing
    const fadeStartTime = Math.max(0, config.introDuration);
    const fadeEndTime = fadeStartTime + Math.max(0, config.introFadeDuration);
    const speechStartTime = fadeStartTime + Math.max(0, config.introFadeDuration) / 2;
    const speechEndTime = speechStartTime + Math.max(0.1, speechDuration);

    console.log('[AudioMixer] timing', { fadeStartTime, fadeEndTime, speechStartTime, speechEndTime, config });

    // Set initial volumes
    musicIntroGain.gain.setValueAtTime(config.musicVolume, 0);
    speechGain.gain.setValueAtTime(0, 0);
    if (musicOutroGain) {
      musicOutroGain.gain.setValueAtTime(0, 0);
    }

    // Intro music fade out
    musicIntroGain.gain.setValueAtTime(config.musicVolume, fadeStartTime);
    musicIntroGain.gain.linearRampToValueAtTime(0, fadeEndTime);

    // Speech fade in
    speechGain.gain.setValueAtTime(0, speechStartTime);
    speechGain.gain.linearRampToValueAtTime(config.speechVolume, speechStartTime + 1);

    // Outro music scheduling
    if (config.outroEnabled && musicOutroGain && musicOutroSource) {
      let outroFadeInStart = speechEndTime - config.outroFadeInDuration;
      const outroFadeInEnd = speechEndTime;
      const outroFullVolumeEnd = speechEndTime + (config.outroDuration - config.outroFadeOutDuration);
      const outroFadeOutEnd = speechEndTime + config.outroDuration;

      // Clamp to >= 0 for safety
      if (outroFadeInStart < 0) outroFadeInStart = 0;
      
      // Outro music fade in
      musicOutroGain.gain.setValueAtTime(0, Math.max(0, outroFadeInStart));
      musicOutroGain.gain.linearRampToValueAtTime(Math.min(1, config.musicVolume * 1.2), Math.max(outroFadeInStart, outroFadeInEnd));
      
      // Hold at full volume
      musicOutroGain.gain.setValueAtTime(Math.min(1, config.musicVolume * 1.2), outroFullVolumeEnd);
      
      // Fade out
      musicOutroGain.gain.linearRampToValueAtTime(0, outroFadeOutEnd);
      
      // Start outro music
      musicOutroSource.start(outroFadeInStart);
    }

    // Start sources
    musicIntroSource.start(0);
    speechSource.start(speechStartTime);

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
    const fadeEndTime = currentTime + config.introFadeDuration;
    
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
    }, (config.introFadeDuration / 2) * 1000);
    
    // Stop music completely after fade
    setTimeout(() => {
      this.stopMusic();
      this.options.onMusicEnd?.();
    }, config.introFadeDuration * 1000);
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
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = buffer.length * blockAlign;
    const bufferSize = 44 + dataSize;
    
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Convert audio data
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = buffer.getChannelData(channel)[i];
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
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