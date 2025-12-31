import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceSampleUrl, language = 'en' } = await req.json();

    if (!text) {
      throw new Error('Text is required');
    }

    const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN');
    if (!REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN is not configured. Please add it in Settings.');
    }

    console.log(`[Voice Clone TTS] Generating speech for: "${text.substring(0, 50)}..."`);
    console.log(`[Voice Clone TTS] Voice sample URL: ${voiceSampleUrl || 'default'}`);

    // Use Coqui XTTS-v2 model via Replicate - open source voice cloning
    // This model can clone any voice from a short audio sample
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // XTTS-v2 model - high quality voice cloning
        version: 'aff74eb6f5d973e54de08ee6c4c2f5e3efdb4ed3c5d32f788c5e95a0d13e8b5a',
        input: {
          text: text,
          speaker: voiceSampleUrl || 'https://replicate.delivery/pbxt/Jt79w0xsT64R1JsiJ0LQRL8UcWspg5J4RFrU6YwEKpOT1ukS/male.wav',
          language: language,
          cleanup_voice: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Voice Clone TTS] Replicate API error:', response.status, errorText);
      throw new Error(`Replicate API error: ${response.status}`);
    }

    const prediction = await response.json();
    console.log('[Voice Clone TTS] Prediction created:', prediction.id);

    // Poll for completion (Replicate is async)
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max wait

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        },
      });
      
      result = await statusResponse.json();
      attempts++;
      
      if (attempts % 5 === 0) {
        console.log(`[Voice Clone TTS] Status: ${result.status} (attempt ${attempts})`);
      }
    }

    if (result.status === 'failed') {
      console.error('[Voice Clone TTS] Generation failed:', result.error);
      throw new Error(result.error || 'Voice generation failed');
    }

    if (result.status !== 'succeeded') {
      throw new Error('Voice generation timed out');
    }

    // Get the audio URL from the result
    const audioUrl = result.output;
    console.log('[Voice Clone TTS] Audio generated:', audioUrl);

    // Fetch the audio and return it
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error('Failed to fetch generated audio');
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`[Voice Clone TTS] Audio size: ${audioBuffer.byteLength} bytes`);

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/wav',
      },
    });

  } catch (error) {
    console.error('[Voice Clone TTS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
