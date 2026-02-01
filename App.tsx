import React, { useState, useRef, useEffect } from 'react';
import { EditingMode, ImageState, GalleryItem } from './types';
import { FASHION_PRESETS } from './constants';
import { processImage } from './services/geminiService';

const App: React.FC = () => {
  const [imageState, setImageState] = useState<ImageState>({
    original: null,
    edited: null,
    isProcessing: false,
    error: null,
  });
  const [mode, setMode] = useState<EditingMode>(EditingMode.STANDARD);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(FASHION_PRESETS[0].id);
  const [showCamera, setShowCamera] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userName, setUserName] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [sharePreview, setSharePreview] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      try {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } catch (e) {
        console.error("Error checking API key", e);
      }
    };
    checkKey();
    const interval = setInterval(checkKey, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const initialItems: GalleryItem[] = [
      {
        id: '1',
        url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=400&q=80',
        userName: 'آمنة كرييتيف',
        date: '٢٠٢٥/٠١/١٠',
        likes: 1240
      },
      {
        id: '2',
        url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=400&q=80',
        userName: 'استوديو آمنة',
        date: '٢٠٢٥/٠١/١٢',
        likes: 856
      }
    ];
    setGallery(initialItems);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageState({
          original: event.target?.result as string,
          edited: null,
          isProcessing: false,
          error: null
        });
        setShowCamera(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setImageState(prev => ({ ...prev, error: "فشل الوصول إلى الكاميرا. يرجى التحقق من الأذونات." }));
      setShowCamera(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setImageState({
          original: dataUrl,
          edited: null,
          isProcessing: false,
          error: null
        });
        stopCamera();
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const cropToSquare = () => {
    if (!imageState.original) return;
    const img = new Image();
    img.src = imageState.original;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = Math.min(img.width, img.height);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const xOffset = (img.width - size) / 2;
        const yOffset = (img.height - size) / 2;
        ctx.drawImage(img, xOffset, yOffset, size, size, 0, 0, size, size);
        const croppedDataUrl = canvas.toDataURL('image/png');
        setImageState(prev => ({
          ...prev,
          original: croppedDataUrl,
          edited: null
        }));
      }
    };
  };

  const handleManageKey = async () => {
    try {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      setShowSettingsModal(false);
    } catch (err) {
      console.error("API Key selection error:", err);
    }
  };

  const checkAndRun = async () => {
    if (mode === EditingMode.PROFESSIONAL) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        setShowSettingsModal(true);
        return;
      }
    }
    handleProcess();
  };

  const handleProcess = async () => {
    if (!imageState.original) return;

    setImageState(prev => ({ ...prev, isProcessing: true, error: null }));

    const activePreset = FASHION_PRESETS.find(p => p.id === selectedPresetId);
    const finalPrompt = customPrompt.trim() || activePreset?.prompt || FASHION_PRESETS[0].prompt;

    try {
      const result = await processImage(imageState.original, finalPrompt, mode);
      setImageState(prev => ({ ...prev, edited: result, isProcessing: false }));
    } catch (err: any) {
      if (err.message === "AUTH_REQUIRED") {
        setShowSettingsModal(true);
        setImageState(prev => ({ ...prev, isProcessing: false, error: "يتطلب الوضع الاحترافي مفتاح API مدفوع." }));
      } else {
        setImageState(prev => ({ ...prev, error: "حدث خطأ أثناء المعالجة. يرجى المحاولة مرة أخرى.", isProcessing: false }));
        console.error(err);
      }
    }
  };

  const downloadImage = () => {
    if (!imageState.edited) return;
    const link = document.createElement('a');
    link.href = imageState.edited;
    link.download = `amna-luxury-${Date.now()}.png`;
    link.click();
  };

  const voteImage = (id: string) => {
    setGallery(prev => prev.map(item => item.id === id ? { ...item, likes: item.likes + 1 } : item));
  };

  const shareToGallery = () => {
    if (!imageState.edited) return;
    setSharePreview(imageState.edited);
    setShowUploadModal(true);
  };

  const handleShareFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSharePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const confirmUpload = () => {
    const finalImageUrl = sharePreview || imageState.edited;
    if (!finalImageUrl) return;
    const newItem: GalleryItem = {
      id: Date.now().toString(),
      url: finalImageUrl,
      userName: userName || 'مبدع آمنة',
      date: new Date().toLocaleDateString('ar-SA'),
      likes: 0
    };
    setGallery([newItem, ...gallery]);
    setShowUploadModal(false);
    setUserName('');
    setSharePreview(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 font-sans text-slate-100 selection:bg-amber-500/30 overflow-x-hidden">
      <header className="sticky top-0 z-50 glass-panel px-6 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 gold-gradient rounded-2xl flex items-center justify-center text-slate-950 font-bold text-3xl luxury-font shadow-lg shadow-amber-500/20">
            A
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter luxury-font">آمنة</h1>
            <div className="flex items-center gap-2">
               <span className="text-[10px] text-amber-500 uppercase tracking-widest font-bold">AMNA AI</span>
               <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] rounded-full border border-emerald-500/20 font-bold">محرر الصور الاحترافي | Amna Company</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 lg:gap-6">
          <nav className="hidden lg:flex items-center gap-1 bg-slate-900/80 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setMode(EditingMode.STANDARD)}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${mode === EditingMode.STANDARD ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
            >
              الوضع السريع
            </button>
            <button
              onClick={() => setMode(EditingMode.PROFESSIONAL)}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${mode === EditingMode.PROFESSIONAL ? 'gold-gradient text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
            >
              الوضع الاحترافي
            </button>
          </nav>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettingsModal(true)}
              className={`p-2.5 rounded-full transition-all active:scale-95 border ${hasApiKey ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-slate-800 text-slate-300 border-slate-700'}`}
              title="إعدادات المفتاح"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
            </button>
            <button
              onClick={startCamera}
              className="p-2.5 bg-slate-800 text-slate-300 rounded-full hover:bg-slate-700 transition-all active:scale-95 border border-slate-700"
              title="التقاط صورة"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2.5 bg-white text-slate-950 rounded-full font-bold hover:bg-slate-200 transition-all active:scale-95 flex items-center gap-2 shadow-xl shadow-white/5"
            >
              <span className="hidden sm:inline text-sm">رفع صورة</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <input type="file" id="mainFileInput" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-950">
        <aside className="w-full lg:w-[400px] glass-panel lg:border-l border-slate-800 p-8 flex flex-col gap-8 overflow-y-auto z-40">
          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 block">أنماط حملات آمنة</label>
              <div className="grid grid-cols-1 gap-3">
                {FASHION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      setCustomPrompt('');
                    }}
                    className={`group relative flex items-center gap-4 p-5 rounded-3xl border transition-all duration-300 text-right ${
                      selectedPresetId === preset.id && !customPrompt
                        ? 'border-amber-500/50 bg-amber-500/5 shadow-2xl shadow-amber-500/10'
                        : 'border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/50'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all ${selectedPresetId === preset.id ? 'bg-amber-500 text-slate-950 scale-110' : 'bg-slate-800 text-slate-400 group-hover:scale-110'}`}>
                      {preset.icon}
                    </div>
                    <div className="flex-1">
                      <p className={`font-bold text-sm ${selectedPresetId === preset.id ? 'text-amber-500' : 'text-slate-200'}`}>
                        {preset.nameAr}
                      </p>
                      <p className="text-[9px] text-slate-500 luxury-font tracking-wider mt-0.5 uppercase">{preset.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 block">تخصيص يدوي فائق الدقة</label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="صف تفاصيل الحملة الإعلانية التي تريدها... مثال: خلفية معمارية إيطالية، إضاءة درامية، تفاصيل ذهبية."
                className="w-full h-40 bg-slate-900/80 border border-slate-800 rounded-3xl p-5 text-sm focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all placeholder:text-slate-600 resize-none"
              />
            </div>
          </div>

          <div className="mt-auto space-y-4">
            {imageState.error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-2xl font-bold flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                {imageState.error}
              </div>
            )}
            <button
              onClick={checkAndRun}
              disabled={!imageState.original || imageState.isProcessing}
              className="group w-full py-5 gold-gradient text-slate-950 font-bold rounded-3xl shadow-2xl shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
            >
              {imageState.isProcessing ? (
                <>
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>جاري تصميم الحملة...</span>
                </>
              ) : (
                <>
                  <span>توليد السحر الفاخر</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </aside>

        <section className="flex-1 overflow-y-auto bg-black flex flex-col">
          <div className="flex-1 min-h-[600px] flex items-center justify-center p-8 relative">
            {showCamera && (
              <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
                <div className="relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden border-2 border-amber-500 shadow-2xl bg-slate-900">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6">
                    <button onClick={capturePhoto} className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all border-8 border-slate-200/50">
                      <div className="w-14 h-14 rounded-full border-2 border-slate-900" />
                    </button>
                    <button onClick={stopCamera} className="w-20 h-20 bg-red-500/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all text-white border-4 border-white/20">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}

            {!imageState.original ? (
              <div className="text-center space-y-10 max-w-2xl animate-in fade-in slide-in-from-bottom-12 duration-1000">
                <div className="relative w-40 h-40 mx-auto">
                   <div className="absolute inset-0 gold-gradient rounded-[48px] blur-2xl opacity-30 animate-pulse"></div>
                   <div className="relative w-full h-full gold-gradient rounded-[48px] flex items-center justify-center text-6xl shadow-2xl rotate-3">
                      📸
                   </div>
                </div>
                <div className="space-y-4">
                  <h2 className="text-7xl font-bold luxury-font tracking-tight leading-tight">
                     إبداع <br/><span className="text-amber-500 italic">بلا حدود</span>
                  </h2>
                  <p className="text-slate-400 text-xl font-light leading-relaxed">
                    حوّل صورك العادية إلى حملات أزياء عالمية بجودة 4K مع ذكاء "آمنة" الاصطناعي المتطور.
                  </p>
                </div>
                <div className="flex gap-6 justify-center">
                   <button onClick={() => fileInputRef.current?.click()} className="px-12 py-5 bg-white text-slate-950 rounded-full font-bold hover:bg-slate-200 transition-all shadow-2xl active:scale-95">ابدأ التحويل الآن</button>
                   <button onClick={startCamera} className="px-12 py-5 border border-slate-700 rounded-full font-bold hover:border-amber-500 hover:text-amber-500 transition-all active:scale-95">التقاط فوري</button>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col gap-6 max-w-7xl mx-auto">
                <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
                  <div className="flex-1 flex flex-col group">
                    <div className="flex items-center justify-between mb-3 px-4">
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">المصدر الأصلي</span>
                       <div className="flex gap-4">
                         <button 
                           onClick={cropToSquare}
                           className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-500 font-bold px-4 py-1.5 rounded-full border border-amber-500/20 hover:bg-amber-500/20 transition-all"
                         >
                           قص مربع
                         </button>
                         <button onClick={() => setImageState({ original: null, edited: null, isProcessing: false, error: null })} className="text-[10px] text-red-400 font-bold hover:underline">إلغاء</button>
                       </div>
                    </div>
                    <div className="flex-1 rounded-[48px] overflow-hidden border border-slate-800 bg-slate-900/20 group-hover:border-slate-700 transition-all">
                      <img src={imageState.original} alt="Original" className="w-full h-full object-contain" />
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-3 px-4">نتيجة آمنة الفاخرة (4K)</span>
                    <div className="flex-1 rounded-[48px] overflow-hidden border border-amber-500/30 bg-slate-900/40 shadow-2xl shadow-amber-500/10 relative group">
                      {imageState.isProcessing && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-2xl px-12 text-center">
                          <div className="w-32 h-32 relative">
                            <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full"></div>
                            <div className="absolute inset-0 border-t-4 border-amber-500 rounded-full animate-spin"></div>
                            <div className="absolute inset-4 border-4 border-amber-500/10 rounded-full"></div>
                            <div className="absolute inset-4 border-b-4 border-amber-500 rounded-full animate-spin-slow"></div>
                          </div>
                          <div className="mt-12 space-y-2">
                             <p className="text-amber-500 font-bold text-2xl luxury-font tracking-wide">Generating Masterpiece</p>
                             <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.3em]">Processing Amna Luxury Campaign</p>
                          </div>
                        </div>
                      )}
                      {imageState.edited ? (
                        <img src={imageState.edited} alt="AI Result" className="w-full h-full object-contain animate-in fade-in zoom-in-95 duration-1000" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-6 opacity-40">
                           <div className="w-24 h-24 border-2 border-dashed border-slate-700 rounded-full flex items-center justify-center text-4xl">💎</div>
                           <p className="luxury-font italic text-lg">بانتظار تحويل الصورة إلى تحفة فنية...</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {imageState.edited && !imageState.isProcessing && (
                  <div className="flex flex-wrap justify-center gap-6 py-6 animate-in slide-in-from-bottom-4 duration-500">
                    <button onClick={downloadImage} className="px-12 py-5 gold-gradient text-slate-950 font-bold rounded-full shadow-2xl flex items-center gap-4 hover:scale-105 active:scale-95 transition-all">
                      <span>حفظ الحملة بدقة 4K</span>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    </button>
                    <button onClick={shareToGallery} className="px-12 py-5 bg-slate-900 border border-slate-700 rounded-full font-bold hover:bg-slate-800 transition-all flex items-center gap-4 active:scale-95">
                      <span>نشر في معرض النخبة</span>
                      <span>✨</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <section className="bg-slate-900/20 border-t border-slate-800/40 p-16">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-12">
                <h3 className="text-5xl font-bold luxury-font">معرض النخبة</h3>
                <span className="text-amber-500/50 text-xs font-bold tracking-[0.5em] uppercase">Amna Luxury Collection</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {gallery.map((item) => (
                  <div key={item.id} className="group relative bg-slate-900 rounded-[40px] overflow-hidden border border-slate-800 hover:border-amber-500/50 transition-all duration-700 hover:-translate-y-3 shadow-2xl">
                    <img src={item.url} alt="Gallery" className="aspect-[3/4] w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60"></div>
                    <div className="absolute inset-x-0 bottom-0 p-8">
                      <div className="flex items-center justify-between">
                         <div className="space-y-1">
                           <p className="text-xs font-bold text-slate-100">{item.userName}</p>
                           <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">{item.date}</p>
                         </div>
                         <button onClick={() => voteImage(item.id)} className="flex items-center gap-2 text-xs font-bold text-amber-500 bg-amber-500/10 px-4 py-2 rounded-full border border-amber-500/20 active:scale-90 transition-all">
                           <span>💎</span> {item.likes}
                         </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </section>
      </main>

      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-500">
           <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-[56px] p-12 shadow-2xl relative">
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="absolute top-10 left-10 text-slate-500 hover:text-white transition-colors p-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="text-center mb-10">
                 <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-8 shadow-2xl shadow-amber-500/5">🔑</div>
                 <h4 className="text-3xl font-bold luxury-font mb-4">إعدادات النخبة</h4>
                 <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">يتطلب الوصول إلى نماذج Gemini 3 Pro الفائقة ربط مفتاح API مدفوع من حسابك الخاص.</p>
              </div>

              <div className="space-y-8">
                 <div className="bg-slate-950/60 border border-slate-800 rounded-[32px] p-8 space-y-6">
                    <div className="flex items-center justify-between">
                       <span className="text-sm font-bold uppercase tracking-widest text-slate-500">حالة الاتصال</span>
                       {hasApiKey ? (
                          <span className="px-4 py-1.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20 flex items-center gap-2">
                             <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> مـتـصـل
                          </span>
                       ) : (
                          <span className="px-4 py-1.5 bg-amber-500/10 text-amber-400 text-[10px] font-bold rounded-full border border-amber-500/20 flex items-center gap-2">
                             <span className="w-2 h-2 bg-amber-400 rounded-full" /> غـيـر مـتـصـل
                          </span>
                       )}
                    </div>
                    <div className="space-y-4">
                      <p className="text-xs text-slate-500 leading-relaxed italic">
                         "يتم تشفير وتخزين مفاتيح الوصول محلياً لضمان خصوصيتك وأمن بياناتك بشكل كامل."
                      </p>
                      <a 
                        href="https://ai.google.dev/gemini-api/docs/billing" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-[10px] text-amber-500 hover:text-amber-400 transition-colors uppercase tracking-[0.2em] font-bold"
                      >
                         الاطلاع على وثائق الدفع
                         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                      </a>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <button 
                      onClick={handleManageKey} 
                      className="w-full py-5 gold-gradient text-slate-950 font-bold rounded-3xl shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                       ربط مفتاح API جـديـد
                    </button>
                    <button 
                       onClick={() => setShowSettingsModal(false)}
                       className="w-full py-5 bg-slate-800 text-slate-300 font-bold rounded-3xl border border-slate-700 hover:bg-slate-750 transition-all"
                    >
                       الاستمرار في الوضع السريع
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-500">
           <div id="uploadForm" className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-[56px] p-12 shadow-2xl">
              <div className="text-center mb-10">
                 <h4 className="text-3xl font-bold luxury-font mb-3">مشاركة الإبداع</h4>
                 <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">Showcase your creation to Amna's Elite Gallery</p>
              </div>
              
              <div className="space-y-8">
                 <div className="image-preview-container aspect-[3/4] w-48 mx-auto rounded-[32px] overflow-hidden border-4 border-amber-500/20 shadow-2xl shadow-amber-500/5 bg-slate-950 relative">
                    {sharePreview ? (
                      <img src={sharePreview} alt="Selected for upload" className="w-full h-full object-cover animate-in zoom-in-95 duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-800 text-4xl">🏛️</div>
                    )}
                 </div>

                 <div className="space-y-6">
                   <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] px-2">تحديث صورة العرض</label>
                     <input 
                        type="file" 
                        id="shareFileInput"
                        onChange={handleShareFileChange}
                        accept="image/*"
                        className="w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-amber-500/10 file:text-amber-500 hover:file:bg-amber-500/20 cursor-pointer"
                     />
                   </div>

                   <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] px-2">الاسم الفني للمصمم</label>
                     <input 
                        type="text" 
                        id="userNameInput"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="مثال: آمنة ديزاينر..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-5 text-sm focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all placeholder:text-slate-700"
                     />
                   </div>
                 </div>

                 <div className="flex gap-4 pt-4">
                    <button onClick={confirmUpload} className="flex-1 py-5 gold-gradient text-slate-950 font-bold rounded-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all">نشر فوراً</button>
                    <button onClick={() => { setShowUploadModal(false); setSharePreview(null); }} className="px-8 py-5 bg-slate-800 text-slate-400 font-bold rounded-3xl hover:bg-slate-700 transition-all">تراجع</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      <footer className="py-10 px-12 border-t border-slate-900 bg-slate-950 text-center space-y-4">
        <p className="text-slate-700 text-[10px] font-bold uppercase tracking-[0.5em]">Amna Company | Experience the Future of Fashion Photography</p>
        <p className="text-slate-500 text-[9px] font-bold tracking-widest uppercase">© {new Date().getFullYear()} آمنة | جميع الحقوق محفوظة لشركة آمنة للذكاء الاصطناعي</p>
      </footer>
    </div>
  );
};

export default App;