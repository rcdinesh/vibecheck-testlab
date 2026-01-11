import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TTSRequest {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  speaker_id?: string;
}

const MAX_TEXT_LENGTH = 2000; // Max characters per chunk for reliable synthesis

// Split text into chunks at sentence boundaries
function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // If a single sentence is too long, split by words
  return chunks.flatMap(chunk => {
    if (chunk.length <= maxLength) return [chunk];
    const words = chunk.split(/\s+/);
    const subChunks: string[] = [];
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > maxLength && current.length > 0) {
        subChunks.push(current.trim());
        current = word;
      } else {
        current += (current ? ' ' : '') + word;
      }
    }
    if (current.trim()) subChunks.push(current.trim());
    return subChunks;
  });
}

async function synthesizeChunk(
  text: string,
  voice: string,
  rateStr: string,
  pitchStr: string,
  volume: number,
  azureEmotion: string,
  accessToken: string,
  azureRegion: string
): Promise<Uint8Array> {
  // Fix plain <break> tags
  const fixedText = text.replace(/<break\s*\/?>/gi, '<break time="3s"/>');

  // Check if user is providing their own voice tags in the script
  const isCustomVoiceMode = voice === "__custom_in_script__" || !voice;
  
  let ssml: string;
  
  if (isCustomVoiceMode) {
    // Multi-voice mode: no wrapper - voice tags must be direct children of <speak>
    // Prosody cannot wrap voice tags in Azure SSML
    ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
        ${fixedText}
      </speak>`.trim();
  } else {
    // Single-voice mode: wrap in user-selected voice
    ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
        <voice name="${voice}">
          <mstts:express-as style="${azureEmotion}">
            <prosody rate="${rateStr}" pitch="${pitchStr}" volume="${Math.round(volume * 100)}%">
              ${fixedText}
            </prosody>
          </mstts:express-as>
        </voice>
      </speak>`.trim();
  }
  
  console.log('SSML mode:', isCustomVoiceMode ? 'custom-voice-in-script' : 'single-voice');

  const ttsResponse = await fetch(`https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
    },
    body: ssml
  });

  if (!ttsResponse.ok) {
    const errorText = (await ttsResponse.text()).trim();
    console.error('Azure TTS chunk error:', errorText);
    const suffix = errorText ? ` ${errorText}` : '';
    throw new Error(`Azure TTS failed: ${ttsResponse.status}${suffix}`);
  }

  const arrayBuffer = await ttsResponse.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const azureSpeechKey = Deno.env.get('AZURE_SPEECH_API_KEY');
    const azureRegion = 'eastus';
    
    if (!azureSpeechKey) {
      throw new Error('Azure Speech API key not configured');
    }

    const { text, voice = 'en-US-AvaMultilingualNeural', rate = 1.0, pitch = 1.0, volume = 1.0, emotion = 'neutral', speaker_id } = await req.json() as TTSRequest;

    console.log('Azure TTS request:', { textLength: text.length, voice, rate, pitch, volume, emotion });

    // Map emotions
    const azureEmotions: Record<string, string> = {
      'natural': 'neutral',
      'expressive': 'excited',
      'calm': 'calm',
      'energetic': 'excited',
      'professional': 'serious'
    };
    const azureEmotion = azureEmotions[emotion] || 'neutral';

    // Convert rate/pitch to Azure format
    const ratePercent = Math.round((rate - 1) * 100);
    const pitchPercent = Math.round((pitch - 1) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
    const pitchStr = pitchPercent >= 0 ? `+${pitchPercent}%` : `${pitchPercent}%`;

    // Get access token
    const tokenResponse = await fetch(`https://${azureRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': azureSpeechKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get Azure token: ${tokenResponse.status}`);
    }

    const accessToken = await tokenResponse.text();

    // Chunk the text for reliable synthesis
    const chunks = chunkText(text, MAX_TEXT_LENGTH);
    console.log(`Processing ${chunks.length} text chunks`);

    // Process each chunk
    const audioChunks: Uint8Array[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Synthesizing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
      const audioData = await synthesizeChunk(
        chunks[i],
        voice,
        rateStr,
        pitchStr,
        volume,
        azureEmotion,
        accessToken,
        azureRegion
      );
      audioChunks.push(audioData);
    }

    // Combine all audio chunks
    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedAudio = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      combinedAudio.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to base64 using Deno's standard library
    const base64Audio = base64Encode(combinedAudio);

    console.log('Azure TTS synthesis completed, total audio size:', totalLength);

    return new Response(JSON.stringify({ 
      audio: base64Audio,
      format: 'mp3'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in azure-tts function:', error);

    const message = error instanceof Error ? error.message : String(error);

    let status = 500;
    const m1 = message.match(/\bAzure TTS failed:\s*([45]\d{2})\b/);
    const m2 = message.match(/\bFailed to get Azure token:\s*([45]\d{2})\b/);
    if (m1) status = Number(m1[1]);
    else if (m2) status = Number(m2[1]);

    const code =
      status === 429
        ? /quota exceeded/i.test(message)
          ? 'quota_exceeded'
          : 'rate_limited'
        : 'tts_error';

    return new Response(JSON.stringify({ error: message, code }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
