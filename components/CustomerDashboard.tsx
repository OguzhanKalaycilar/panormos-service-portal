import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ServiceRequest, ServiceNote } from '../types';
import { useAuth } from '../lib/AuthContext';
import { Plus, Clock, CheckCircle, Calendar, AlertCircle, X, Shield, AlertTriangle, ChevronRight, History, Play, RefreshCw, Loader2, WifiOff, ShieldCheck, Database, XCircle, Maximize2 } from 'lucide-react';
import AnchorLogo from './AnchorLogo';

const DATA_FETCH_TIMEOUT = 7000;

const CustomerDashboard: React.FC = () => {
  const { session, profile, loading: authLoading } = useAuth();
  
  // Mounted Ref for safety
  const isMounted = useRef(true);

  // Data State
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  
  // UI States
  const [loadingData, setLoadingData] = useState(false); 
  const [isRefreshing, setIsRefreshing] = useState(false); 
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Modals
  const [showPolicy, setShowPolicy] = useState(false);
  
  // Detail Modal State
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [notes, setNotes] = useState<ServiceNote[]>([]);
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);

  // --- ADMIN REDIRECT GUARD ---
  useEffect(() => {
    if (profile?.role === 'admin') {
        window.location.hash = '#/admin-dashboard';
    }
  }, [profile]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchMyRequests = useCallback(async (forceSilent = false, retryCount = 0) => {
    if (!session?.user?.id) return;

    const hasData = requests.length > 0;
    const isBackground = hasData || forceSilent;

    if (retryCount === 0) {
        if (isBackground) {
            if (isMounted.current) setIsRefreshing(true);
        } else {
            if (isMounted.current) setLoadingData(true);
        }
        if (isMounted.current) setFetchError(null);
    }

    const fetchTimeout = setTimeout(() => {
        if (isMounted.current && loadingData && !hasData) {
            setFetchError("Bağlantı yavaş. Lütfen internetinizi kontrol edin.");
            setLoadingData(false);
        }
    }, DATA_FETCH_TIMEOUT);

    try {
      const { data, error } = await supabase
        .from('service_requests')
        .select('*')
        .order('created_at', { ascending: false });

      clearTimeout(fetchTimeout);

      if (error) throw error;

      if (isMounted.current) {
         setRequests(data as ServiceRequest[] || []);
         setLoadingData(false);
         setIsRefreshing(false);
      }

    } catch (error: any) {
      clearTimeout(fetchTimeout);
      if (error.name === 'AbortError') return;

      if (retryCount < 1) {
          setTimeout(() => {
              if (isMounted.current) fetchMyRequests(forceSilent, retryCount + 1);
          }, 1500);
          return;
      }
      
      if (isMounted.current) {
          setFetchError("Veriler alınırken bir sorun oluştu.");
          setLoadingData(false);
          setIsRefreshing(false);
      }
    }
  }, [session, requests.length, loadingData]);

  useEffect(() => {
    if (!authLoading && session?.user.id) {
      fetchMyRequests(); 
    }
  }, [session, authLoading, fetchMyRequests]);

  const handleOpenDetail = (req: ServiceRequest) => {
      setSelectedRequest(req);
      fetchNotes(req.id);
  };

  const handleCloseDetail = () => {
      setSelectedRequest(null);
      setNotes([]);
  };

  const fetchNotes = async (requestId: number) => {
    try {
      const { data, error } = await supabase
        .from('service_notes')
        .select('*, author:profiles(role, full_name)')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true }); 

      if (error) throw error;
      if (isMounted.current) setNotes(data as ServiceNote[] || []);
    } catch (e: any) {
        const { data, error } = await supabase
            .from('service_notes')
            .select('*')
            .eq('request_id', requestId);
        if (!error && isMounted.current) setNotes(data as ServiceNote[] || []);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    let classes = '';
    let label = '';

    switch(status) {
        case 'resolved':
            classes = 'bg-green-500/10 text-green-400 border-green-500/20';
            label = 'ÇÖZÜLDÜ';
            break;
        case 'rejected':
            classes = 'bg-red-500/10 text-red-400 border-red-500/20';
            label = 'REDDEDİLDİ';
            break;
        default:
            classes = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            label = 'BEKLİYOR';
    }

    return (
        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold border ${classes}`}>
          {label}
        </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 md:py-12 relative">
      
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 md:mb-12 gap-6">
        <div className="text-center md:text-left">
           <h2 className="text-2xl md:text-3xl font-serif font-bold text-zinc-100 mb-2 tracking-tight">Merhaba, {profile?.full_name?.split(' ')[0] || 'Müşterimiz'}</h2>
           <p className="text-zinc-500 text-sm">Cihaz durumlarını buradan takip edin.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3 w-full md:w-auto">
            <button 
                onClick={() => setShowPolicy(true)}
                className="flex-1 md:flex-none bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 font-medium py-3 px-4 rounded-xl transition-all border border-white/5 text-xs flex items-center justify-center gap-2"
            >
                <Shield className="w-4 h-4 text-amber-500" /> Prosedürler
            </button>
            <button 
                onClick={() => window.location.hash = '#/new-request'}
                className="flex-1 md:flex-none bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-amber-900/20 text-xs flex items-center justify-center gap-2"
            >
                <Plus className="w-4 h-4" /> Yeni Talep
            </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:gap-6 mb-8 md:mb-12">
        <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between h-28 md:h-32">
            <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">Toplam</span>
            <span className="text-3xl md:text-4xl font-bold text-zinc-100">{requests.length}</span>
        </div>
         <div className="glass-panel p-4 md:p-6 rounded-2xl flex flex-col justify-between h-28 md:h-32 border-amber-500/20 bg-amber-500/5">
            <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">Bekleyen</span>
            <span className="text-3xl md:text-4xl font-bold text-amber-500">{requests.filter(r => r.status === 'pending').length}</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
           <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
             Geçmiş Talepler
             {(isRefreshing || authLoading) && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
           </h3>
           <button 
             onClick={() => fetchMyRequests(false, 0)} 
             className="p-2 text-zinc-500 hover:text-amber-500 transition-colors"
           >
             <RefreshCw className="w-4 h-4" />
           </button>
        </div>
        
        {fetchError && (
           <div className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center text-center bg-red-900/5 border-red-500/10">
              <WifiOff className="w-10 h-10 text-red-500 mb-3 opacity-50" />
              <p className="text-zinc-400 text-sm mb-6">{fetchError}</p>
              <button 
                onClick={() => fetchMyRequests(false, 0)}
                className="px-6 py-2 bg-zinc-800 text-zinc-200 rounded-lg text-xs font-bold border border-white/5"
              >
                Yenile
              </button>
           </div>
        ) : loadingData ? (
            <div className="text-center py-20">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-4" />
                <p className="text-zinc-500 text-xs">Yükleniyor...</p>
            </div>
        ) : requests.length === 0 ? (
            <div className="glass-panel py-16 rounded-2xl text-center border-dashed">
                <p className="text-zinc-500 text-sm">Henüz bir talebiniz bulunmuyor.</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 gap-4">
            {requests.map(req => (
                <div 
                    key={req.id} 
                    onClick={() => handleOpenDetail(req)}
                    className="glass-panel p-5 rounded-2xl hover:bg-zinc-800/40 transition-all cursor-pointer flex items-center justify-between group active:scale-[0.98]"
                >
                   <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-3 mb-2">
                        <StatusBadge status={req.status} />
                        <span className="text-[10px] text-zinc-600 font-medium">{new Date(req.created_at).toLocaleDateString('tr-TR')}</span>
                      </div>
                      <h4 className="text-zinc-100 font-bold truncate group-hover:text-amber-500 transition-colors">{req.brand} {req.model}</h4>
                      <p className="text-zinc-500 text-xs truncate mt-1">{req.description}</p>
                   </div>
                   <div className="shrink-0 flex items-center gap-3">
                      <div className="hidden sm:block text-right">
                         <span className="block text-[10px] uppercase text-zinc-600 font-bold">Alım</span>
                         <span className="text-xs text-zinc-400 font-mono">{req.product_date}</span>
                      </div>
                      <div className="w-8 h-8 bg-zinc-900 rounded-full flex items-center justify-center border border-white/5 group-hover:border-amber-500/30 transition-all">
                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-500" />
                      </div>
                   </div>
                </div>
            ))}
            </div>
        )}
      </div>

      {/* Detail Modal with Mobile Image Fix */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={handleCloseDetail}></div>
          <div className="bg-zinc-950 border-t md:border border-white/10 w-full max-w-5xl h-full md:h-auto md:max-h-[90vh] md:rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
            <div className="p-4 md:p-6 border-b border-white/5 flex items-start justify-between bg-zinc-900/30">
              <div className="min-w-0">
                <h3 className="text-lg md:text-xl font-serif font-bold text-zinc-100 truncate mb-1">
                   {selectedRequest.brand} {selectedRequest.model}
                </h3>
                <StatusBadge status={selectedRequest.status} />
              </div>
              <button onClick={handleCloseDetail} className="p-2 bg-zinc-900 rounded-full text-zinc-400 border border-white/5">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                    {/* Timeline */}
                    <div className="glass-panel rounded-2xl p-5 md:p-6 bg-zinc-900/40">
                        <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-white/5 pb-4">
                            <History className="w-3.5 h-3.5"/> Onarım Geçmişi
                        </h4>
                        <div className="space-y-6">
                            {notes.length === 0 ? (
                                <p className="text-zinc-600 text-xs italic">Henüz bir kayıt girilmedi.</p>
                            ) : (
                                notes.map((note) => (
                                    <div key={note.id} className="relative pl-6 pb-6 border-l border-zinc-800 last:border-0 last:pb-0">
                                        <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-zinc-950"></div>
                                        <div className="text-[9px] text-zinc-500 font-mono mb-2">
                                            {new Date(note.created_at).toLocaleString('tr-TR')}
                                        </div>
                                        <div className="text-xs text-zinc-300 bg-zinc-900 border border-white/5 p-3 rounded-xl">
                                            {note.note}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                    {/* Details and Media */}
                    <div className="space-y-6">
                        <div className="glass-panel p-5 rounded-2xl bg-zinc-900/40">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Arıza Açıklaması</h4>
                            <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedRequest.description}</p>
                        </div>

                        <div>
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Medya Kanıtlar</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {selectedRequest.media_urls?.map((media, idx) => (
                                    <div 
                                        key={idx} 
                                        className="aspect-square bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 relative group cursor-pointer"
                                        onClick={() => setLightboxMedia({url: media.url, type: media.type})}
                                    >
                                        {media.type === 'image' ? (
                                            <img src={media.url} className="w-full h-full object-cover" alt="Service evidence" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Play className="w-6 h-6 text-amber-500" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Maximize2 className="w-5 h-5 text-white" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox with Object-Contain to fix "Image Loss" */}
      {lightboxMedia && (
        <div 
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setLightboxMedia(null)}
        >
           <button className="absolute top-6 right-6 p-2 bg-zinc-800 rounded-full text-white">
              <X className="w-6 h-6" />
           </button>
           <div className="max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {lightboxMedia.type === 'image' ? (
                    <img 
                        src={lightboxMedia.url} 
                        alt="Zoomed evidence" 
                        className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" 
                    />
                ) : (
                    <video 
                        src={lightboxMedia.url} 
                        controls
                        autoPlay
                        className="max-w-full max-h-[85vh] rounded-lg" 
                    />
                )}
           </div>
        </div>
      )}

      {/* Procedural Modal */}
      {showPolicy && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setShowPolicy(false)}></div>
             <div className="relative bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-xl shadow-2xl p-6 md:p-8 animate-in zoom-in-95 duration-200">
                 <h3 className="text-xl font-bold text-zinc-100 mb-6 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-amber-500" /> Servis Prosedürleri
                 </h3>
                 <div className="space-y-6 text-sm text-zinc-400 leading-relaxed overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
                     <div className="bg-amber-500/5 p-4 rounded-xl border border-amber-500/10">
                         <h4 className="text-zinc-200 font-bold mb-2">Garanti Kapsamı</h4>
                         <p>Üretim kaynaklı motor ve kart arızaları 1 yıl garantimiz altındadır. Fiziksel darbeler ve sıvı teması garanti dışıdır.</p>
                     </div>
                     <div className="bg-red-500/5 p-4 rounded-xl border border-red-500/10">
                         <h4 className="text-red-400 font-bold mb-2">Dikkat: Mürekkep Teması</h4>
                         <p>Cihaz içerisine mürekkep kaçması durumunda motorun kilitlenmesi kullanıcı hatası sayılmakta olup ücretli onarım prosedürü uygulanır.</p>
                     </div>
                 </div>
                 <button 
                    onClick={() => setShowPolicy(false)}
                    className="w-full mt-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold py-3 rounded-xl transition-all"
                 >
                     Anladım
                 </button>
             </div>
          </div>
      )}

    </div>
  );
};

export default CustomerDashboard;