
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, FAQItem } from '../types';
import { healthAI, AIError } from '../geminiService';
import { FAQS } from '../constants';

const playChatSound = (type: 'send' | 'receive') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (type === 'send') {
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    } else {
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.debug("Audio feedback skipped:", e);
  }
};

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'initial',
      role: 'assistant',
      content: 'Namaste! I am your Health Awareness Assistant. I am an AI assistant, not a doctor. I can help you understand symptoms and give health tips. How can I help you today?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAutoSpeech, setIsAutoSpeech] = useState(false);
  const [mode, setMode] = useState<'standard' | 'fast' | 'thinking' | 'maps' | 'search'>('standard');
  const [groundingUrls, setGroundingUrls] = useState<{title: string, uri: string}[]>([]);
  const [lastError, setLastError] = useState<AIError | null>(null);

  // Feedback States
  const [feedbackRating, setFeedbackRating] = useState<'up' | 'down' | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);
  const [feedbackMsgId, setFeedbackMsgId] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    try {
      chatRef.current = healthAI.createChat(mode);
      setLastError(null);
    } catch (e) {
      setLastError(healthAI.handleError(e));
    }
  }, [mode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, lastError, feedbackRating]);

  const handleSend = async (text: string = input) => {
    if (!text.trim()) return;

    playChatSound('send');
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    setGroundingUrls([]);
    setLastError(null);

    // Reset feedback for new query
    setFeedbackRating(null);
    setFeedbackComment('');
    setIsFeedbackSubmitted(false);
    setFeedbackMsgId(null);

    const botMessageId = (Date.now() + 1).toString();
    let fullResponse = "";
    let soundPlayed = false;

    try {
      const response = await chatRef.current.sendMessageStream({ message: text });
      for await (const chunk of response) {
        setIsTyping(false);
        fullResponse += chunk.text || "";
        
        if (!soundPlayed) {
          playChatSound('receive');
          soundPlayed = true;
        }

        const grounding = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (grounding) {
          const urls = grounding.map((c: any) => ({
            title: c.maps?.title || c.web?.title || "Reference",
            uri: c.maps?.uri || c.web?.uri
          })).filter((u: any) => u.uri);
          setGroundingUrls(urls);
        }

        setMessages(prev => {
          const otherMessages = prev.filter(m => m.id !== botMessageId);
          return [...otherMessages, {
            id: botMessageId,
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date()
          }];
        });
      }

      // Automatically generate speech if the feature is enabled
      if (isAutoSpeech && fullResponse) {
        healthAI.generateSpeech(fullResponse);
      }

      // Enable feedback for this specific message
      setFeedbackMsgId(botMessageId);

    } catch (error: any) {
      setIsTyping(false);
      const aiError = healthAI.handleError(error);
      setLastError(aiError);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], "recording.webm", { type: 'audio/webm' });
        
        setIsTyping(true);
        try {
          const transcribedText = await healthAI.transcribeAudio(audioFile);
          if (transcribedText.trim()) {
            handleSend(transcribedText);
          } else {
            setLastError({
              type: 'unknown',
              message: "I couldn't hear any clear audio. Please try again.",
              isRetryable: true
            });
            setIsTyping(false);
          }
        } catch (err) {
          setLastError(healthAI.handleError(err));
          setIsTyping(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic Error:", err);
      setLastError({
        type: 'network',
        message: "Could not access the microphone. Please check your permissions.",
        isRetryable: false
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFaqClick = (faq: FAQItem) => {
    handleSend(faq.question);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleListen = (text: string) => {
    healthAI.generateSpeech(text);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const submitFeedback = () => {
    setIsFeedbackSubmitted(true);
    // In a real app, you would send feedbackRating and feedbackComment to a backend here.
    console.log("Feedback Submitted:", { rating: feedbackRating, comment: feedbackComment, msgId: feedbackMsgId });
  };

  const EmptyStateIllustration = () => (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4 animate-in fade-in zoom-in duration-700">
      <div className="relative">
        <div className="w-28 h-28 bg-emerald-50 rounded-full flex flex-col items-center justify-center animate-bounce duration-[3000ms] shadow-inner border border-emerald-100">
          <span className="text-4xl">🏡</span>
          <span className="text-2xl mt-[-8px]">🌿</span>
        </div>
        <div className="absolute -top-2 -right-2 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md animate-pulse">
          <span className="text-2xl">☀️</span>
        </div>
        <div className="absolute bottom-0 -left-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
          <span className="text-xl">🍏</span>
        </div>
      </div>
      <div className="max-w-xs space-y-2">
        <h3 className="text-xl font-extrabold text-slate-800">Sustainable Health Helper</h3>
        <p className="text-sm text-slate-500 leading-relaxed font-medium">I'm here to support our community's health and well-being. Ask me about symptoms, preventive care, or local medical centers.</p>
      </div>
    </div>
  );

  const getUserAvatar = (id: string) => {
    const avatars = ['👨', '👩', '🧑', '👨🏽', '👩🏾'];
    const index = parseInt(id.slice(-1)) % avatars.length;
    return isNaN(index) ? '👤' : avatars[index];
  };

  return (
    <div className="flex flex-col h-[750px] w-full max-w-2xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
      {/* PERSISTENT PROMINENT DISCLAIMER */}
      <div className="bg-red-600 px-4 py-3 flex items-center gap-4 border-b border-red-700 shadow-sm relative z-10">
        <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white text-lg">
          ⚠️
        </div>
        <div className="flex-1">
          <p className="text-[12px] font-bold text-white leading-tight uppercase tracking-wide">
            Medical Disclaimer: Not a Human Doctor.
          </p>
          <p className="text-[10px] text-red-50 leading-tight">
            For emergencies (chest pain, shortness of breath), seek <b>immediate medical attention</b> at the nearest hospital.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="bg-emerald-600 p-5 text-white flex items-center justify-between shadow-md relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-2xl shadow-inner">
            🌱
          </div>
          <div>
            <h2 className="font-extrabold text-xl leading-none tracking-tight">Health Assistant</h2>
            <div className="flex gap-1.5 mt-2">
              {['standard', 'fast', 'thinking', 'maps', 'search'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m as any)}
                  className={`text-[8px] px-2 py-1 rounded-md uppercase font-black tracking-tighter transition-all border ${
                    mode === m ? 'bg-white text-emerald-700 border-white' : 'bg-emerald-700 text-emerald-100 border-emerald-500 hover:bg-emerald-500 shadow-sm'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Auto-read Toggle */}
        <button
          onClick={() => setIsAutoSpeech(!isAutoSpeech)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            isAutoSpeech ? 'bg-white text-emerald-600 shadow-lg' : 'bg-emerald-700 text-emerald-200 hover:bg-emerald-500'
          }`}
          title={isAutoSpeech ? "Disable Auto-read" : "Enable Auto-read"}
        >
          <span className="text-lg">{isAutoSpeech ? '🔊' : '🔇'}</span>
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50 scroll-smooth"
      >
        {messages.length === 1 && <EmptyStateIllustration />}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm flex-shrink-0 ${
                msg.role === 'user' ? 'bg-emerald-100' : 'bg-white border border-slate-200'
              }`}>
                {msg.role === 'user' ? getUserAvatar(msg.id) : '🌱'}
              </div>
              <div className="space-y-1">
                <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed relative group ${
                  msg.role === 'user' 
                    ? 'bg-emerald-600 text-white rounded-tr-none' 
                    : 'bg-white text-slate-900 border border-slate-200 rounded-tl-none font-medium'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  
                  {/* Floating Actions on Hover */}
                  <div className={`absolute -top-2 flex gap-1 transition-opacity opacity-0 group-hover:opacity-100 ${
                    msg.role === 'user' ? 'right-0' : 'left-0'
                  }`}>
                    <button 
                      onClick={() => copyToClipboard(msg.content)}
                      className="p-1.5 bg-white text-slate-500 rounded-full shadow-md border border-slate-100 hover:bg-slate-50 hover:text-emerald-600 transition-all"
                      title="Copy"
                    >
                      📋
                    </button>
                    <button 
                      onClick={() => handleListen(msg.content)}
                      className="p-1.5 bg-white text-slate-500 rounded-full shadow-md border border-slate-100 hover:bg-slate-50 hover:text-emerald-600 transition-all"
                      title="Read Aloud"
                    >
                      🔊
                    </button>
                  </div>
                </div>
                <div className={`flex items-center gap-3 text-[10px] text-slate-400 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <span>{formatTime(msg.timestamp)}</span>
                  {msg.role === 'assistant' && (
                    <button 
                      onClick={() => handleListen(msg.content)}
                      className="flex items-center gap-1 text-emerald-600 font-bold hover:text-emerald-700 transition-colors uppercase tracking-widest"
                    >
                      <span>🔊</span> Read Aloud
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start items-start gap-3">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-sm shadow-sm">
                🌱
              </div>
              <span className="text-[7px] font-black text-emerald-600 uppercase tracking-widest animate-pulse">Thinking</span>
            </div>
            <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none flex gap-1.5 items-center shadow-sm">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce duration-700"></div>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce duration-700 delay-150"></div>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce duration-700 delay-300"></div>
              <span className="text-[10px] text-slate-400 font-bold ml-1 uppercase tracking-tighter">typing...</span>
            </div>
          </div>
        )}

        {lastError && (
          <div className="flex justify-center">
            <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-center max-w-sm">
              <p className="text-xs text-red-800 mb-2 font-medium">{lastError.message}</p>
              {lastError.isRetryable && (
                <button 
                  onClick={() => handleSend(messages[messages.length - 1].content)}
                  className="text-[10px] font-bold text-red-700 uppercase underline decoration-2 underline-offset-2"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}

        {groundingUrls.length > 0 && (
          <div className="flex flex-col gap-2 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
            <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">References & Locations:</p>
            <div className="flex flex-wrap gap-2">
              {groundingUrls.map((u, i) => (
                <a key={i} href={u.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 bg-white px-3 py-1.5 rounded-full border border-blue-200 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                  {u.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Response Feedback Section */}
      {feedbackMsgId && messages[messages.length - 1]?.id === feedbackMsgId && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 animate-in slide-in-from-bottom-2 duration-300">
          {!isFeedbackSubmitted ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Was this helpful?</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setFeedbackRating('up')}
                    className={`p-2 rounded-xl transition-all border ${feedbackRating === 'up' ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-300'}`}
                  >
                    👍
                  </button>
                  <button 
                    onClick={() => setFeedbackRating('down')}
                    className={`p-2 rounded-xl transition-all border ${feedbackRating === 'down' ? 'bg-red-100 border-red-500 text-red-700' : 'bg-white border-slate-200 text-slate-400 hover:border-red-300'}`}
                  >
                    👎
                  </button>
                </div>
              </div>
              
              {feedbackRating && (
                <div className="space-y-2 animate-in fade-in duration-300">
                  <p className="text-[10px] font-medium text-slate-500">
                    {feedbackRating === 'up' ? "Glad to hear! Anything specific you liked?" : "Sorry about that. How can we improve?"}
                  </p>
                  <textarea
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    placeholder="Provide a brief explanation..."
                    className="w-full h-16 p-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                  <button 
                    onClick={submitFeedback}
                    className="w-full py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 transition-colors"
                  >
                    Submit Feedback
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-2 animate-in zoom-in duration-300">
              <p className="text-[11px] font-bold text-emerald-700">Thank you for your feedback! 🌱</p>
            </div>
          )}
        </div>
      )}

      {/* Suggested FAQs */}
      {messages.length === 1 && (
        <div className="p-4 bg-white border-t border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest px-2">Common Questions</p>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {FAQS.map((faq, i) => (
              <button
                key={i}
                onClick={() => handleFaqClick(faq)}
                className="whitespace-nowrap px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100 hover:bg-emerald-100 transition-colors shadow-sm"
              >
                {faq.question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Section */}
      <div className="p-4 bg-white border-t border-slate-100 relative z-10">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-2"
        >
          <div className="flex-1 relative flex items-center bg-slate-100 rounded-2xl overflow-hidden">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? "Listening..." : "Ask about symptoms..."}
              disabled={isRecording}
              className="w-full bg-transparent border-none px-5 py-3.5 text-sm focus:ring-0 outline-none text-slate-900 placeholder:text-slate-400 font-medium"
            />
            
            {/* Mic Button Inside Input */}
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2 mr-2 rounded-full transition-all flex items-center justify-center ${
                isRecording 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'text-slate-400 hover:text-emerald-600 hover:bg-slate-200'
              }`}
              title={isRecording ? "Stop Recording" : "Speak to AI"}
            >
              <span className="text-lg">{isRecording ? '⏹️' : '🎙️'}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={!input.trim() || isTyping || isRecording}
            className="bg-emerald-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 transition-all active:scale-95 flex-shrink-0"
          >
            <span className="text-xl">➔</span>
          </button>
        </form>
      </div>
    </div>
  );
};
