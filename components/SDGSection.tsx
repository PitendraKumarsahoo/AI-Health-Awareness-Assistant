
import React from 'react';
import { SDG_GOALS } from '../constants';

export const SDGSection: React.FC = () => {
  return (
    <section className="py-12 px-6 max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Sustainable Development Goals</h2>
        <p className="text-slate-600 max-w-2xl mx-auto">
          GraminHealth AI directly contributes to the United Nations SDGs by bridging the healthcare awareness gap in underserved areas.
        </p>
      </div>
      
      <div className="grid md:grid-cols-3 gap-6">
        {SDG_GOALS.map((goal) => (
          <div key={goal.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 ${goal.color}`}>
              {goal.icon}
            </div>
            <h3 className="font-bold text-lg mb-2 text-slate-900">{goal.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {goal.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};
