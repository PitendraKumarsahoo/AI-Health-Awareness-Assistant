import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { healthAI } from '../geminiService';

export const LiveAssistant: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcription, setTranscription] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Manual encode/decode implementation as per instructions
  const encode = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const cleanup = async () => {
    setIsActive(false);
    setIsConnecting(false);

    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (e) {}
      sessionPromiseRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextsRef.current) {
      await audioContextsRef.current.input.close();
      await audioContextsRef.current.output.close();
      audioContextsRef.current = null;
    }

    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  };

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const toggleSession = async () => {
    if (isActive || isConnecting) {
      await cleanup();
      return;
    }

    setIsConnecting(true);
    setErrorMsg(null);
    setTranscription('');

    try {
      // Check for API key as per instructions for Veo/Live models
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await (window as any).aistudio.openSelectKey();
        // Proceeding after triggering openSelectKey to handle race condition
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      // Ensure contexts are running
      await inputCtx.resume();
      await outputCtx.resume();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);

            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };

              // CRITICAL: Solely rely on sessionPromise resolves
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              }).catch(() => {
                cleanup();
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: any) => {
            // Handle Transcription
            if (message.serverContent?.outputTranscription) {
              setTranscription(prev => prev + message.serverContent.outputTranscription.text);
            }

            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle Interruptions
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => {
                try { s.stop(); } catch (e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: any) => {
            console.error("Live Session Error:", e);
            const aiError = healthAI.handleError(e);
            setErrorMsg(aiError.message);
            cleanup();
            if (aiError.type === 'key') {
              (window as any).aistudio.openSelectKey();
            }
          },
          onclose: (e: any) => {
            console.debug("Live Session Closed", e);
            cleanup();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
          systemInstruction: "You are a multilingual AI Health Awareness Assistant. Supported languages: English, Hindi, Odia. Detect the user's language and respond in it. Start with a greeting like Namaste or Namaskar. Clearly state: I am an AI health assistant, not a doctor. Use simple words. No jargon. No markdown formatting. Always include a section on when to see a doctor if symptoms are mentioned."
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err) {
      console.error("Failed to start voice session:", err);
      const aiError = healthAI.handleError(err);
      setErrorMsg(aiError.message);
      cleanup();
    }
  };

  return (
    <div className="bg-emerald-900 rounded-3xl p-8 text-center text-white border border-emerald-800 shadow-2xl max-w-xl mx-auto relative overflow-hidden">
      {/* Decorative pulse background when active */}
      {isActive && (
        <div className="absolute inset-0 bg-emerald-800/20 animate-pulse pointer-events-none" />
      )}

      <div className={`w-24 h-24 bg-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-xl transition-all duration-500 ${isActive ? 'scale-110 shadow-emerald-400/30' : 'shadow-emerald-900/40'}`}>
        {isActive ? '🟢' : '🎙️'}
      </div>
      
      <h3 className="text-3xl font-extrabold mb-4 tracking-tight">Voice Assistant</h3>
      <p className="text-emerald-200 mb-8 text-sm font-medium leading-relaxed">
        Speak naturally in English, Hindi, or Odia.<br/>
        Get instant spoken health awareness and preventive tips.
      </p>

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-950/60 border border-red-500/50 rounded-2xl text-xs text-red-100 animate-in fade-in slide-in-from-top-2">
          <p className="font-bold mb-1 uppercase tracking-widest text-[10px]">Technical Alert</p>
          <p>{errorMsg}</p>
          <button 
            onClick={() => setErrorMsg(null)}
            className="mt-2 text-[10px] font-black uppercase tracking-tighter hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="h-24 flex items-center justify-center mb-10">
        {isActive ? (
          <div className="flex gap-2 h-16 items-center">
            {[...Array(7)].map((_, i) => (
              <div 
                key={i} 
                className="w-2.5 bg-emerald-400 rounded-full animate-bounce" 
                style={{ 
                  height: `${30 + Math.random() * 70}%`, 
                  animationDuration: `${0.6 + Math.random()}s`,
                  animationDelay: `${i * 0.05}s` 
                }}
              ></div>
            ))}
          </div>
        ) : isConnecting ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Establishing Secure Link</p>
          </div>
        ) : (
          <div className="text-emerald-500/50 font-black uppercase tracking-[0.3em] text-[10px]">System Ready</div>
        )}
      </div>

      <button
        onClick={toggleSession}
        disabled={isConnecting}
        className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl active:scale-95 disabled:opacity-50 ${
          isActive 
            ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30' 
            : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/30'
        }`}
      >
        {isActive ? 'End Conversation' : isConnecting ? 'Connecting...' : 'Start Talking Now'}
      </button>

      {transcription && (
        <div className="mt-8 p-5 bg-emerald-950/80 rounded-2xl text-sm italic text-emerald-300 border border-emerald-800/50 animate-in fade-in zoom-in">
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-2 not-italic">Live Transcript</p>
          "{transcription}"
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-emerald-800/50">
        <p className="text-[10px] text-emerald-400 font-medium">
          Note: This is an AI session. Your voice data is processed live for responses and not saved locally.
        </p>
      </div>
    </div>
  );
};
