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

    const { text, voice = 'en-US-AriaNeural', rate = 1.0, pitch = 1.0, volume = 1.0, emotion = 'neutral', speaker_id } = await req.json() as TTSRequest;

    console.log('Azure TTS request:', { text: text.substring(0, 100), voice, rate, pitch, volume, emotion, speaker_id });

    // Map VibeVoice emotions to Azure Speech emotions
    const azureEmotions: Record<string, string> = {
      'natural': 'neutral',
      'expressive': 'excited',
      'calm': 'calm',
      'energetic': 'excited',
      'professional': 'serious'
    };

    const azureEmotion = azureEmotions[emotion] || 'neutral';

    // Create SSML with VibeVoice-style processing
    const processedText = speaker_id && speaker_id !== 'default' 
      ? `Speaking as ${speaker_id}: ${text}` 
      : text;

    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
        <voice name="${voice}">
          <mstts:express-as style="${azureEmotion}">
            <prosody rate="${rate > 1.2 ? '+20%' : rate < 0.8 ? '-20%' : '0%'}" 
                     pitch="${pitch > 1.1 ? '+10%' : pitch < 0.9 ? '-10%' : '0%'}" 
                     volume="${volume * 100}%">
              ${processedText}
            </prosody>
          </mstts:express-as>
        </voice>
      </speak>`;

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

    const audioBuffer = await ttsResponse.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    console.log('Azure TTS synthesis completed successfully');

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