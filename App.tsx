
import React, { useState } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { SDGSection } from './components/SDGSection';
import { MediaCenter } from './components/MediaCenter';
import { LiveAssistant } from './components/LiveAssistant';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'chat' | 'media' | 'voice'>('chat');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-xl">
              🌱
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">GraminHealth <span className="text-emerald-600">AI</span></h1>
          </div>
          
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full">
            {[
              { id: 'chat', label: 'Chat', icon: '💬' },
              { id: 'media', label: 'Media Lab', icon: '🖼️' },
              { id: 'voice', label: 'Live Voice', icon: '🎙️' }
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setActiveView(btn.id as any)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
                  activeView === btn.id 
                    ? 'bg-white text-emerald-700 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{btn.icon}</span>
                {btn.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
             <a href="#about" className="text-xs font-bold text-slate-400 hover:text-emerald-600 uppercase tracking-widest">About</a>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Main Interface */}
        <section className="py-12 px-6">
          <div className="max-w-7xl mx-auto">
            {activeView === 'chat' && (
              <div className="grid lg:grid-cols-12 gap-12 items-start">
                <div className="lg:col-span-5 space-y-6">
                  <span className="inline-block px-4 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase tracking-widest">
                    Intelligent Assistant
                  </span>
                  <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
                    Reliable Health Guidance <br/><span className="text-emerald-600">for Every Home.</span>
                  </h2>
                  <p className="text-slate-600 leading-relaxed">
                    Our AI Chat supports multiple modes including <b>Thinking</b> for complex medical logic 
                    and <b>Maps</b> to find your nearest healthcare center.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                      <div className="text-2xl mb-2">🧠</div>
                      <h4 className="font-bold text-slate-800 text-sm">Thinking Mode</h4>
                      <p className="text-[11px] text-slate-500">Deep reasoning for complex cases.</p>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                      <div className="text-2xl mb-2">📍</div>
                      <h4 className="font-bold text-slate-800 text-sm">Maps Grounded</h4>
                      <p className="text-[11px] text-slate-500">Find real clinics near you.</p>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-7">
                  <ChatInterface />
                </div>
              </div>
            )}

            {activeView === 'media' && (
              <div className="space-y-12">
                <div className="text-center max-w-2xl mx-auto">
                  <h2 className="text-3xl font-bold text-slate-900 mb-4">Media Laboratory</h2>
                  <p className="text-slate-600">Analyze health-related photos, audio files, or PDF reports using advanced AI. You can also edit existing medical illustrations for better community understanding.</p>
                </div>
                <MediaCenter />
              </div>
            )}

            {activeView === 'voice' && (
              <div className="space-y-12">
                <div className="text-center max-w-2xl mx-auto">
                  <h2 className="text-3xl font-bold text-slate-900 mb-4">Live Audio Interface</h2>
                  <p className="text-slate-600">Experience zero-latency voice interaction. Speak to the AI just like a human assistant.</p>
                </div>
                <LiveAssistant />
              </div>
            )}
          </div>
        </section>

        <div id="impact">
          <SDGSection />
        </div>

        {/* Responsible AI & Ethics Section */}
        <section id="responsible" className="bg-slate-100 py-20 px-6">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-12">Built with Integrity</h2>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { title: "Fairness", desc: "Equitable information access for rural populations.", icon: "🤝" },
                { title: "Transparency", desc: "Clear identification of AI capabilities and limits.", icon: "🔍" },
                { title: "Privacy", desc: "No health records are ever stored on our servers.", icon: "🛡️" },
                { title: "Reliability", desc: "Grounded in medical knowledge and real locations.", icon: "💎" },
              ].map((item, i) => (
                <div key={i} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg transition-all">
                  <div className="text-4xl mb-4">{item.icon}</div>
                  <h4 className="font-bold text-slate-900 mb-2">{item.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-xl">
                🌱
              </div>
              <h1 className="text-xl font-bold text-slate-900">GraminHealth AI</h1>
            </div>
            <p className="text-xs text-slate-400">© 2024 GraminHealth AI. A Project for Global Well-being.</p>
          </div>
          <div className="flex gap-4">
             <button className="bg-slate-900 text-white px-6 py-2 rounded-full text-xs font-bold hover:bg-slate-800 transition-colors">Emergency Contacts</button>
             <button className="border border-slate-200 px-6 py-2 rounded-full text-xs font-bold hover:bg-slate-50 transition-colors">Privacy Policy</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
