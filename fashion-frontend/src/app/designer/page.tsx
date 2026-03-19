'use client';
import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, Upload, X, RefreshCw, Download, Save, ImageOff, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import PaywallBanner from '@/components/PaywallBanner';
import { aiApi, paymentApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

interface Design {
  id: string;
  imageUrl: string;
  description: string;
  fabrics: { name: string; reason: string }[];
  colorPalette: { hex: string; name: string }[];
  prompt: string;
}

const examplePrompts = [
  'Elegant kitenge wrap dress with gold accents for a Tanzanian wedding',
  'Modern streetwear set with ankara print hoodies and joggers',
  'Formal ankara blazer suit for business meetings',
  'Traditional kanzu redesigned with contemporary clean lines',
];

export default function DesignerPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState('');
  const [inspirationPreview, setInspirationPreview] = useState<string | null>(null);
  const [inspirationFile, setInspirationFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [currentDesign, setCurrentDesign] = useState<Design | null>(null);
  const [savedDesigns, setSavedDesigns] = useState<Design[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useState(() => {
    if (!authLoading && !user) { router.replace('/auth/login'); return; }
    paymentApi.mySubscription().then(res => {
      setIsSubscribed(res.data.isActive);
    }).catch(() => setIsSubscribed(false));
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInspirationFile(file);
    const reader = new FileReader();
    reader.onload = ev => setInspirationPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || prompt.length < 10) {
      toast.error('Please enter a more detailed prompt (at least 10 characters)');
      return;
    }
    setGenerating(true);
    try {
      const formData = new FormData();
      formData.append('prompt', prompt);
      if (inspirationFile) formData.append('inspiration', inspirationFile);

      const res = await aiApi.generateDesign(formData);
      setCurrentDesign(res.data.design);
      toast.success('Design generated!');
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 402) { setIsSubscribed(false); return; }
      toast.error(err.response?.data?.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!currentDesign?.imageUrl) return;
    const link = document.createElement('a');
    link.href = currentDesign.imageUrl;
    link.download = `fashion-cotz-design-${Date.now()}.png`;
    link.target = '_blank';
    link.click();
  };

  if (!authLoading && isSubscribed === false) {
    return (
      <div className="min-h-screen bg-white dark:bg-dark-950">
        <Navbar />
        <div className="pt-16">
          <PaywallBanner />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="font-display text-4xl font-bold text-gray-900 dark:text-white flex items-center gap-3 mb-2">
            <Wand2 size={32} className="text-gold-500" />
            AI Fashion Designer
          </h1>
          <p className="text-gray-500 dark:text-gray-400">Describe your dream design and let AI create it for you</p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input panel */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
            {/* Prompt */}
            <div className="card p-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Describe your design
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. A flowing kitenge maxi dress with gold embroidery details, perfect for a formal Tanzanian wedding..."
                rows={5}
                className="input-field resize-none"
                maxLength={500}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{prompt.length}/500</span>
                <span className="text-xs text-gray-400">Be specific for best results</span>
              </div>

              {/* Example prompts */}
              <div className="mt-4">
                <p className="text-xs text-gray-500 dark:text-gray-500 mb-2 font-medium">Try an example:</p>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map(ex => (
                    <button
                      key={ex}
                      onClick={() => setPrompt(ex)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-400 hover:bg-gold-500/10 hover:text-gold-500 transition-colors text-left"
                    >
                      {ex.slice(0, 40)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Inspiration image */}
            <div className="card p-6">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Inspiration image <span className="font-normal text-gray-400">(optional)</span>
              </label>

              {inspirationPreview ? (
                <div className="relative rounded-xl overflow-hidden aspect-video">
                  <img src={inspirationPreview} alt="Inspiration" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setInspirationPreview(null); setInspirationFile(null); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video border-2 border-dashed border-gray-200 dark:border-dark-700 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-gold-500 hover:bg-gold-500/5 transition-colors group"
                >
                  <Upload size={24} className="text-gray-400 group-hover:text-gold-500" />
                  <span className="text-sm text-gray-400 group-hover:text-gold-500">Upload inspiration image</span>
                  <span className="text-xs text-gray-300 dark:text-gray-600">PNG, JPG, WebP up to 10MB</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </div>

            <Button
              onClick={handleGenerate}
              loading={generating}
              className="w-full !py-4 text-base"
            >
              <Sparkles size={20} />
              {generating ? 'Generating design...' : 'Generate Design'}
            </Button>
          </motion.div>

          {/* Output panel */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <AnimatePresence mode="wait">
              {generating ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="card p-12 flex flex-col items-center justify-center text-center h-full min-h-[500px]"
                >
                  <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center mb-4 animate-pulse-gold">
                    <Wand2 size={28} className="text-dark-950" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Creating your design...</h3>
                  <p className="text-sm text-gray-400">This may take 20–40 seconds</p>
                </motion.div>
              ) : currentDesign ? (
                <motion.div
                  key="design"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  {/* Design image */}
                  <div className="card overflow-hidden">
                    <div className="relative aspect-square">
                      <img
                        src={currentDesign.imageUrl}
                        alt={currentDesign.prompt}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4 flex gap-2">
                      <Button onClick={handleGenerate} variant="outline" className="flex-1 !py-2.5">
                        <RefreshCw size={16} /> Regenerate
                      </Button>
                      <Button onClick={handleDownload} variant="ghost" className="!px-3">
                        <Download size={18} />
                      </Button>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="card p-5">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2 text-sm">Design Description</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{currentDesign.description}</p>
                  </div>

                  {/* Color palette */}
                  {currentDesign.colorPalette.length > 0 && (
                    <div className="card p-5">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Color Palette</h4>
                      <div className="flex gap-2 flex-wrap">
                        {currentDesign.colorPalette.map(color => (
                          <div key={color.hex} className="flex flex-col items-center gap-1">
                            <div
                              className="w-10 h-10 rounded-lg shadow-sm border border-white/10"
                              style={{ backgroundColor: color.hex }}
                              title={color.name}
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400">{color.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fabrics */}
                  {currentDesign.fabrics.length > 0 && (
                    <div className="card p-5">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Recommended Fabrics</h4>
                      <div className="space-y-2">
                        {currentDesign.fabrics.map(f => (
                          <div key={f.name} className="flex gap-3 text-sm">
                            <span className="font-medium text-gray-900 dark:text-white min-w-[80px]">{f.name}</span>
                            <span className="text-gray-500 dark:text-gray-400">{f.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="card h-full min-h-[500px] flex flex-col items-center justify-center text-center p-12"
                >
                  <ImageOff size={48} className="text-gray-300 dark:text-gray-700 mb-4" />
                  <h3 className="font-semibold text-gray-500 dark:text-gray-400 mb-1">No design yet</h3>
                  <p className="text-sm text-gray-400 dark:text-gray-600">Enter a prompt and hit Generate to create your first design</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
