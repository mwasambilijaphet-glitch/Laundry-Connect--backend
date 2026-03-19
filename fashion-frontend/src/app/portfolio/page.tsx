'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Upload, Heart, Sparkles, Plus, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { designerApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  image_url: string;
  style_tags: string[];
  likes: number;
  designer_name: string;
  designer_avatar?: string;
  ai_feedback?: string;
}

export default function PortfolioPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);
  const [uploadForm, setUploadForm] = useState({ title: '', description: '', styleTags: '' });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadItems = async (p = 1) => {
    setLoading(true);
    try {
      const res = await designerApi.getPortfolio(p);
      setItems(prev => p === 1 ? res.data.items : [...prev, ...res.data.items]);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(1); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    const reader = new FileReader();
    reader.onload = ev => setUploadPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!uploadForm.title || !uploadFile) {
      toast.error('Title and image are required'); return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('title', uploadForm.title);
      formData.append('description', uploadForm.description);
      formData.append('styleTags', JSON.stringify(uploadForm.styleTags.split(',').map(t => t.trim()).filter(Boolean)));
      formData.append('image', uploadFile);
      await designerApi.upload(formData);
      toast.success('Design uploaded! AI feedback will appear shortly.');
      setShowUpload(false);
      setUploadForm({ title: '', description: '', styleTags: '' });
      setUploadFile(null);
      setUploadPreview(null);
      loadItems(1);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleLike = async (id: string) => {
    try {
      const res = await designerApi.likeItem(id);
      setItems(prev => prev.map(item => item.id === id ? { ...item, likes: res.data.likes } : item));
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl font-bold text-gray-900 dark:text-white mb-1">Designer Portfolio</h1>
            <p className="text-gray-500 dark:text-gray-400">{total} designs from the Fashion.co.tz community</p>
          </div>
          {user && (
            <Button onClick={() => setShowUpload(!showUpload)}>
              <Plus size={18} /> Upload design
            </Button>
          )}
        </div>

        {/* Upload form */}
        {showUpload && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="card p-6 mb-8 overflow-hidden"
          >
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Upload Your Design</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <Input
                  label="Design title"
                  value={uploadForm.title}
                  onChange={e => setUploadForm({ ...uploadForm, title: e.target.value })}
                  placeholder="e.g. Kitenge Evening Gown"
                />
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                  <textarea
                    value={uploadForm.description}
                    onChange={e => setUploadForm({ ...uploadForm, description: e.target.value })}
                    placeholder="Describe your design inspiration..."
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>
                <div className="mt-4">
                  <Input
                    label="Style tags (comma separated)"
                    value={uploadForm.styleTags}
                    onChange={e => setUploadForm({ ...uploadForm, styleTags: e.target.value })}
                    placeholder="kitenge, evening, elegant"
                    icon={<Tag size={14} />}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Design image</label>
                {uploadPreview ? (
                  <div className="relative aspect-square rounded-xl overflow-hidden">
                    <img src={uploadPreview} alt="Preview" className="w-full h-full object-cover" />
                    <button onClick={() => { setUploadPreview(null); setUploadFile(null); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center text-xs">✕</button>
                  </div>
                ) : (
                  <label className="aspect-square border-2 border-dashed border-gray-200 dark:border-dark-700 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gold-500 transition-colors block">
                    <Upload size={24} className="text-gray-400" />
                    <span className="text-sm text-gray-400">Click to upload image</span>
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  </label>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={handleUpload} loading={uploading}>
                <Upload size={16} /> Upload & get AI feedback
              </Button>
              <Button variant="ghost" onClick={() => setShowUpload(false)}>Cancel</Button>
            </div>
          </motion.div>
        )}

        {/* Grid */}
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size={40} />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.4) }}
                className="card overflow-hidden group cursor-pointer"
                onClick={() => setSelectedItem(item)}
              >
                <div className="relative aspect-square overflow-hidden">
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <button
                    onClick={e => { e.stopPropagation(); handleLike(item.id); }}
                    className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs hover:bg-black/60 transition-colors"
                  >
                    <Heart size={12} fill="white" /> {item.likes}
                  </button>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1 line-clamp-1">{item.title}</h3>
                  <div className="flex items-center gap-2">
                    {item.designer_avatar ? (
                      <img src={item.designer_avatar} className="w-5 h-5 rounded-full" alt={item.designer_name} />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gold-gradient flex items-center justify-center text-dark-950 text-xs font-bold">{item.designer_name[0]}</div>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400">{item.designer_name}</span>
                  </div>
                  {item.style_tags?.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-2">
                      {item.style_tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-dark-800 text-gray-500 dark:text-gray-400">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Load more */}
        {items.length < total && (
          <div className="flex justify-center mt-8">
            <Button variant="outline" onClick={() => { const next = page + 1; setPage(next); loadItems(next); }} loading={loading}>
              Load more designs
            </Button>
          </div>
        )}

        {/* Modal */}
        {selectedItem && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-dark-900 rounded-2xl overflow-hidden max-w-3xl w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="grid md:grid-cols-2">
                <img src={selectedItem.image_url} alt={selectedItem.title} className="w-full aspect-square object-cover" />
                <div className="p-6">
                  <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">{selectedItem.title}</h2>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-gold-gradient flex items-center justify-center text-dark-950 text-xs font-bold">{selectedItem.designer_name[0]}</div>
                    <span className="text-sm text-gray-500">{selectedItem.designer_name}</span>
                  </div>
                  {selectedItem.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">{selectedItem.description}</p>
                  )}
                  {selectedItem.ai_feedback && (
                    <div className="bg-gold-500/10 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2 text-gold-500 text-xs font-semibold mb-2">
                        <Sparkles size={12} /> AI Feedback
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{selectedItem.ai_feedback}</p>
                    </div>
                  )}
                  <button
                    onClick={() => handleLike(selectedItem.id)}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 transition-colors"
                  >
                    <Heart size={16} /> {selectedItem.likes} likes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
