import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  // Handle CORS preflight requests
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

    console.log('Azure TTS request:', { text: text.substring(0, 100), voice, rate, pitch, volume, emotion, speaker_id });

    // Fix plain <break> tags by adding default time attribute
    const fixedText = text.replace(/<break\s*\/?>/gi, '<break time="3s"/>');

    // Map VibeVoice emotions to Azure Speech emotions
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

    // Create SSML with proper namespace and formatting
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
        <voice name="${voice}">
          <mstts:express-as style="${azureEmotion}">
            <prosody rate="${rateStr}" pitch="${pitchStr}" volume="${Math.round(volume * 100)}%">
              ${fixedText}
            </prosody>
          </mstts:express-as>
        </voice>
      </speak>`.trim();

    console.log('Generated SSML:', ssml);

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

    // Synthesize speech
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
      const errorText = await ttsResponse.text();
      console.error('Azure TTS error:', errorText);
      throw new Error(`Azure TTS failed: ${ttsResponse.status}`);
    }

    // Stream the response body to avoid memory issues with large audio files
    const reader = ttsResponse.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
      }
    }

    // Combine all chunks into a single Uint8Array
    const audioBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      audioBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Convert to base64 using built-in encoder for better performance
    // Use Deno's standard base64 encoding
    const base64Audio = btoa(
      audioBuffer.reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    console.log('Azure TTS synthesis completed successfully, audio size:', totalLength);

    return new Response(JSON.stringify({ 
      audio: base64Audio,
      format: 'mp3'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in azure-tts function:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});