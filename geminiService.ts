
import { GoogleGenAI, Chat, GenerateContentResponse, Type, Modality, LiveServerMessage } from "@google/genai";
import { SYSTEM_PROMPT } from "./constants";

export interface AIError {
  type: 'network' | 'safety' | 'quota' | 'key' | 'unauthorized' | 'unknown';
  message: string;
  isRetryable: boolean;
}

export class HealthAIService {
  private getAI() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  handleError(error: any): AIError {
    console.error("AI Service Error:", error);
    const errorMessage = (error?.message || "").toLowerCase();
    const status = error?.status || 0;

    // API Key / Project Errors
    if (errorMessage.includes("api key") || errorMessage.includes("unauthorized") || status === 401) {
      return {
        type: 'unauthorized',
        message: "Access denied. Please check your project settings or re-select your API key in the project settings.",
        isRetryable: false
      };
    }

    if (errorMessage.includes("entity was not found") || errorMessage.includes("not found") || status === 404) {
      return {
        type: 'key',
        message: "The requested model or project could not be found. You might need to select a valid project key from the menu.",
        isRetryable: false
      };
    }

    // Safety and Policy
    if (errorMessage.includes("safety") || errorMessage.includes("blocked") || status === 400) {
      return {
        type: 'safety',
        message: "This query was filtered for safety. I cannot discuss certain sensitive topics or provide specific medical treatments. For health crises, please visit an emergency room immediately.",
        isRetryable: false
      };
    }

    // Quota and Billing
    if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("exhausted") || errorMessage.includes("limit")) {
      return {
        type: 'quota',
        message: "We've reached the limit of free messages for now. Please wait a minute before trying again, or ensure your project has a valid billing account linked if you require higher limits.",
        isRetryable: true
      };
    }

    // Network
    if (errorMessage.includes("fetch") || errorMessage.includes("network") || !window.navigator.onLine || errorMessage.includes("timeout")) {
      return {
        type: 'network',
        message: "Connection failed. Please check your internet connection and try again.",
        isRetryable: true
      };
    }

    // Default
    return {
      type: 'unknown',
      message: "Something went wrong while communicating with the AI. Please try rephrasing your request.",
      isRetryable: true
    };
  }

  createChat(mode: 'standard' | 'fast' | 'thinking' | 'maps' | 'search' = 'standard') {
    const ai = this.getAI();
    const config: any = {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
    };

    // Use gemini-3-flash-preview as the primary "free-friendly" model for most tasks
    let model = 'gemini-3-flash-preview';

    if (mode === 'fast') {
      model = 'gemini-flash-lite-latest';
    } else if (mode === 'thinking') {
      model = 'gemini-3-pro-preview';
      config.thinkingConfig = { thinkingBudget: 32768 };
    } else if (mode === 'maps') {
      model = 'gemini-2.5-flash';
      config.tools = [{ googleMaps: {} }];
    } else if (mode === 'search') {
      model = 'gemini-3-flash-preview';
      config.tools = [{ googleSearch: {} }];
    }

    return ai.chats.create({
      model,
      config,
    });
  }

  async generateSpeech(text: string): Promise<void> {
    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
        config: {
          responseModalalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const bytes = this.decodeBase64(base64Audio);
        const audioBuffer = await this.decodeAudioData(bytes, audioCtx, 24000, 1);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.start();
      }
    } catch (error) {
      console.error("TTS Error:", error);
    }
  }

  private decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
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
  }

  async analyzeMedia(file: File, prompt: string): Promise<string> {
    try {
      const ai = this.getAI();
      const base64 = await this.fileToBase64(file);
      const mimeType = file.type;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', // Flash is faster and more cost-effective for analysis
        contents: [{
          parts: [
            { inlineData: { data: base64, mimeType } },
            { text: prompt }
          ]
        }],
        config: { systemInstruction: SYSTEM_PROMPT }
      });
      return response.text || "I processed the media but couldn't generate a text analysis.";
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async editImage(base64: string, mimeType: string, prompt: string): Promise<string> {
    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: base64, mimeType } },
            { text: prompt }
          ]
        }
      });

      for (const part of response.candidates?.[0]?.content.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error("Failed to edit the image.");
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async transcribeAudio(file: File): Promise<string> {
    try {
      const ai = this.getAI();
      const base64 = await this.fileToBase64(file);
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64, mimeType: file.type } },
            { text: "Transcribe this audio file accurately. If it is in Hindi, Odia or English, transcribe it in its respective script. Do not add any conversational filler, just the transcribed text." }
          ]
        }]
      });
      return response.text || "";
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private fileToBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  }
}

export const healthAI = new HealthAIService();
