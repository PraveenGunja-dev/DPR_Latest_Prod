import React, { useState } from 'react';
import { X, Send } from 'lucide-react';

interface DelayAlertModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: (toEmail: string, ccEmail: string) => Promise<void>;
}

export const DelayAlertModal: React.FC<DelayAlertModalProps> = ({ isOpen, onClose, onSend }) => {
    const [toEmail, setToEmail] = useState('');
    const [ccEmail, setCcEmail] = useState('');
    const [isSending, setIsSending] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!toEmail) return;
        
        setIsSending(true);
        try {
            await onSend(toEmail, ccEmail);
            onClose();
            setToEmail('');
            setCcEmail('');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-800">Send Delay Alerts</h2>
                    <button onClick={onClose} className="text-gray-500 hover:bg-gray-100 p-1.5 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            To <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            required
                            placeholder="recipient@adani.com"
                            value={toEmail}
                            onChange={(e) => setToEmail(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            CC
                        </label>
                        <input
                            type="text"
                            placeholder="cc1@adani.com, cc2@adani.com"
                            value={ccEmail}
                            onChange={(e) => setCcEmail(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSending || !toEmail}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSending ? (
                                <>Sending...</>
                            ) : (
                                <><Send className="w-4 h-4" /> Send Email</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
