
import React, { useState } from 'react';
import { healthAI, AIError } from '../geminiService';

export const MediaCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'edit' | 'analyze'>('analyze');
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<AIError | null>(null);

  const wrapAiTask = async (task: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await task();
    } catch (err: any) {
      const aiError = healthAI.handleError(err);
      setError(aiError);
      if (aiError.type === 'key') {
        await (window as any).aistudio.openSelectKey();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditImage = () => wrapAiTask(async () => {
    if (!file) return;
    setResultUrl(null);
    setAnalysis(null);
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    const url = await healthAI.editImage(base64, file.type, prompt);
    setResultUrl(url);
  });

  const handleAnalyze = () => wrapAiTask(async () => {
    if (!file) return;
    setAnalysis(null);
    setResultUrl(null);
    const result = await healthAI.analyzeMedia(file, prompt || "What is in this media? Focus on health aspects.");
    setAnalysis(result);
  });

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 w-full max-w-4xl mx-auto">
      <div className="flex border-b">
        {(['edit', 'analyze'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setError(null); }}
            className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {tab === 'edit' ? '✏️ Edit Asset' : '🔍 Analyze Media'}
          </button>
        ))}
      </div>

      <div className="p-8 grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Upload File (Image/Audio/PDF)</label>
            <input 
              type="file" 
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Instructions</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={activeTab === 'edit' ? "e.g., Circle the potential area of concern" : "e.g., Describe the symptoms visible in this photo or summarize this audio report."}
              className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none text-sm text-slate-900"
            />
          </div>

          <button
            onClick={activeTab === 'edit' ? handleEditImage : handleAnalyze}
            disabled={loading || !file}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </>
            ) : (
              activeTab === 'edit' ? 'Run Image Edit' : 'Analyze Media'
            )}
          </button>
          
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-2">
              <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                <span>🛑</span> Task Failed
              </div>
              <p>{error.message}</p>
            </div>
          )}
        </div>

        <div className="bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center p-4 min-h-[400px] relative overflow-hidden">
          {resultUrl ? (
            <img src={resultUrl} alt="Result" className="max-w-full max-h-[500px] rounded-lg shadow-lg relative z-10" />
          ) : analysis ? (
            <div className="text-sm text-slate-700 prose prose-slate p-4 w-full h-full overflow-y-auto relative z-10 bg-white rounded-xl shadow-sm">
              <h4 className="font-bold mb-2">Analysis Result:</h4>
              <p className="whitespace-pre-wrap">{analysis}</p>
            </div>
          ) : (
            <div className="text-center text-slate-400">
              <div className="text-5xl mb-4 grayscale opacity-30">🖼️</div>
              <p className="text-sm font-medium">Results will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
