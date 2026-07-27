import React from 'react';
import { Settings, Wrench, ServerCrash } from 'lucide-react';

const MaintenanceScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl overflow-hidden border border-slate-200 text-center p-8 space-y-6 relative">
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500" />
        
        <div className="flex justify-center mb-4 relative">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center relative">
            <ServerCrash className="w-10 h-10 text-blue-600 z-10" />
            <Settings className="w-6 h-6 text-blue-300 absolute -bottom-1 -right-1 animate-spin" style={{ animationDuration: '4s' }} />
            <Wrench className="w-6 h-6 text-blue-400 absolute -top-1 -left-1 transform -rotate-45" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Digitalized DPR is Offline
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto">
            We are currently deploying changes and undergoing scheduled maintenance to improve your experience. 
            Please check back soon.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 mt-6">
          <p className="text-sm font-medium text-slate-700">
            Need urgent assistance?
          </p>
          <p className="text-sm text-slate-500 mt-1">
            For support, please refer to this email:
          </p>
          <a 
            href="mailto:rohit.sharma6@adani.com" 
            className="inline-block mt-2 font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            rohit.sharma6@adani.com
          </a>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceScreen;
