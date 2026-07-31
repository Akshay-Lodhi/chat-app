import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2 } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

interface CreatePollModalProps {
  chatId: string;
  onClose: () => void;
}

export default function CreatePollModal({ chatId, onClose }: CreatePollModalProps) {
  const { sendMessage } = useChatStore();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([{ id: '1', text: '' }, { id: '2', text: '' }]);
  const [multipleAnswers, setMultipleAnswers] = useState(false);

  const handleAddOption = () => {
    if (options.length >= 12) return; // limit to 12 options
    setOptions([...options, { id: Math.random().toString(36).substr(2, 9), text: '' }]);
  };

  const handleRemoveOption = (id: string) => {
    if (options.length <= 2) return; // minimum 2 options
    setOptions(options.filter(o => o.id !== id));
  };

  const handleOptionChange = (id: string, text: string) => {
    setOptions(options.map(o => o.id === id ? { ...o, text } : o));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    const validOptions = options.filter(o => o.text.trim());
    if (validOptions.length < 2) return;

    const pollMetadata = {
      poll: {
        question: question.trim(),
        options: validOptions.map(o => ({ id: o.id, text: o.text.trim(), votes: [] })),
        multipleAnswers
      }
    };

    sendMessage(chatId, 'Poll', 'POLL', null, null, pollMetadata);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 bg-surface-header border-b border-surface-border">
          <h2 className="text-lg font-semibold text-text-primary">Create Poll</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-text-secondary transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-[#00a884] font-medium px-2">Question</label>
            <input 
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question"
              className="w-full bg-surface border border-surface-border rounded-lg p-3 text-text-primary focus:outline-none focus:border-[#00a884] transition-colors"
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm text-[#00a884] font-medium px-2">Options</label>
            {options.map((option, index) => (
              <div key={option.id} className="flex items-center space-x-2 group">
                <input 
                  type="text"
                  value={option.text}
                  onChange={(e) => handleOptionChange(option.id, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="flex-1 bg-surface border border-surface-border rounded-lg p-3 text-text-primary focus:outline-none focus:border-[#00a884] transition-colors"
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => handleRemoveOption(option.id)} className="p-2 text-text-secondary hover:text-red-400 transition-colors">
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            ))}

            {options.length < 12 && (
              <button 
                type="button" 
                onClick={handleAddOption}
                className="flex items-center space-x-2 text-text-secondary hover:text-text-primary px-2 py-1 transition-colors mt-2"
              >
                <Plus size={20} />
                <span>Add Option</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 pb-2 px-2 border-t border-surface-border mt-4">
            <span className="text-text-primary">Allow multiple answers</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={multipleAnswers} onChange={(e) => setMultipleAnswers(e.target.checked)} />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00a884]"></div>
            </label>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={!question.trim() || options.filter(o => o.text.trim()).length < 2}
              className="bg-[#00a884] hover:bg-[#008f70] text-white rounded-full px-6 py-2.5 font-medium shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send Poll
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
