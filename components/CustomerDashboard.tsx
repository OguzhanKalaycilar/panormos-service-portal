import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ServiceRequest, ServiceNote } from '../types';
import { useAuth } from '../lib/AuthContext';
import { 
  Plus, Clock, CheckCircle, Calendar, AlertCircle, X, Shield, AlertTriangle, 
  ChevronRight, History, Play, RefreshCw, Loader2, WifiOff, XCircle, Maximize2,
  Wrench, FileText, Truck, PackageCheck, Info
} from 'lucide-react';

const DATA_FETCH_TIMEOUT = 7000;

const CustomerDashboard: React.FC = () => {
  const { session, profile, loading: authLoading } = useAuth();
  const isMounted = useRef(true);
  
  // Data State
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loadingData, setLoadingData] = useState(false); 
  const [isRefreshing, setIsRefreshing] = useState(false); 
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Use ref to track requests length to avoid dependency loops in useCallback
  const requestsRef = useRef<ServiceRequest[]>([]);
  requestsRef.current = requests;

  // Modals
  const [showPolicy, setShowPolicy] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [notes, setNotes] = useState<ServiceNote[]>([]);
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);

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

    // Use ref to check data presence without creating dependency cycle
    const hasData = requestsRef.current.length > 0;
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
        // Check loading state safely via check or variable, 
        // relying on isMounted mostly here.
        if (isMounted.current && !hasData) {
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
  }, [session]);

  useEffect(() => {
    if (!authLoading && session?.user.id) {
      fetchMyRequests(); 
    }
  }, [session, authLoading]); // Removed fetchMyRequests to prevent loop

  const handleOpenDetail = (req: ServiceRequest) => {
      setSelectedRequest(req);
      fetchNotes(req.id);
      document.body.style.overflow = 'hidden';
  };

  const handleCloseDetail = () => {
      setSelectedRequest(null);
      setNotes([]);
      document.body.style.overflow = 'auto';
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
        
        {fetchError ? (
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
            <div className="glass-panel p-8 md:p-12 rounded-3xl text-center border-dashed border-zinc-800 flex flex-col items-center animate-in fade-in duration-500">
                <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 border border-zinc-800 shadow-xl relative">
                     <div className="absolute inset-0 bg-amber-500/10 rounded-full blur-xl animate-pulse"></div>
                     <Wrench className="w-10 h-10 text-amber-500 relative z-10" />
                </div>
                <h3 className="text-2xl font-serif font-bold text-zinc-100 mb-3">Teknik Servis'e Hoşgeldiniz</h3>
                <p className="text-zinc-500 max-w-md mx-auto mb-10 leading-relaxed text-sm">
                    Arızalı ekipmanlarınız için hızlıca talep oluşturabilir, onarım durumunu anlık olarak buradan takip edebilirsiniz.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-10">
                     <div className="bg-zinc-900/50 p-5 rounded-xl border border-white/5 flex flex-col items-center">
                         <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3 text-amber-500">
                             <FileText className="w-5 h-5"/> 
                         </div>
                         <div className="font-bold text-zinc-200 mb-1">1. Talep Oluştur</div>
                         <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Bilgileri Girin</div>
                     </div>
                     <div className="bg-zinc-900/50 p-5 rounded-xl border border-white/5 flex flex-col items-center">
                         <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3 text-amber-500">
                             <Truck className="w-5 h-5"/> 
                         </div>
                         <div className="font-bold text-zinc-200 mb-1">2. Gönderim</div>
                         <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Kargolayın</div>
                     </div>
                     <div className="bg-zinc-900/50 p-5 rounded-xl border border-white/5 flex flex-col items-center">
                         <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3 text-amber-500">
                             <PackageCheck className="w-5 h-5"/> 
                         </div>
                         <div className="font-bold text-zinc-200 mb-1">3. Takip Et</div>
                         <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Sonucu İzleyin</div>
                     </div>
                </div>

                <button 
                    onClick={() => window.location.hash = '#/new-request'}
                    className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-bold py-4 px-10 rounded-xl transition-all shadow-lg shadow-amber-900/20 hover:-translate-y-1 flex items-center gap-2 text-sm"
                >
                    <Plus className="w-5 h-5" /> Hemen Talep Oluştur
                </button>
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

      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={handleCloseDetail}></div>
          <div className="bg-zinc-950 border-t md:border border-white/10 w-full max-w-5xl h-[92vh] md:h-auto md:max-h-[90vh] md:rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
            {/* STICKY HEADER FOR CLOSE BUTTON */}
            <div className="sticky top-0 z-30 p-5 md:p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/90 backdrop-blur-md">
              <div className="min-w-0 pr-4 flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <h3 className="text-lg md:text-xl font-serif font-bold text-zinc-100 truncate leading-tight">
                    {selectedRequest.brand} {selectedRequest.model}
                  </h3>
                  <div className="shrink-0">
                    <StatusBadge status={selectedRequest.status} />
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Müşteri Talebi Detayı</p>
              </div>
              <button 
                onClick={handleCloseDetail} 
                className="shrink-0 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-zinc-100 border border-white/10 shadow-lg active:scale-90 transition-all ml-2"
                aria-label="Kapat"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="glass-panel rounded-2xl p-6 md:p-8 bg-zinc-900/40">
                        <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-white/5 pb-4">
                            <History className="w-3.5 h-3.5"/> Onarım Geçmişi
                        </h4>
                        <div className="space-y-6">
                            {notes.length === 0 ? (
                                <p className="text-zinc-600 text-xs italic">Henüz bir kayıt girilmedi.</p>
                            ) : (
                                notes.map((note) => (
                                    <div key={note.id} className="relative pl-6 pb-6 border-l border-zinc-800 last:border-0 last:pb-0">
                                        <div className="absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-zinc-950"></div>
                                        <div className="text-[10px] text-zinc-500 font-mono mb-2">
                                            {new Date(note.created_at).toLocaleString('tr-TR')}
                                        </div>
                                        <div className="text-sm text-zinc-300 bg-zinc-900/80 border border-white/5 p-4 rounded-xl shadow-sm">
                                            {note.note}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                    <div className="space-y-8">
                        <div className="glass-panel p-6 rounded-2xl bg-zinc-900/40 border border-white/5 shadow-inner">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Arıza Açıklaması</h4>
                            <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedRequest.description}</p>
                        </div>
                        <div>
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Medya Kanıtlar</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {selectedRequest.media_urls?.map((media, idx) => (
                                    <div 
                                        key={idx} 
                                        className="aspect-square bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 relative group cursor-pointer shadow-md"
                                        onClick={() => setLightboxMedia({url: media.url, type: media.type})}
                                    >
                                        {media.type === 'image' ? (
                                            <img src={media.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="Service evidence" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                                                <Play className="w-8 h-8 text-amber-500" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                            <Maximize2 className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="h-10 md:hidden"></div> {/* Extra space for mobile thumb scrolling */}
            </div>
          </div>
        </div>
      )}

      {/* --- PROCEDURES MODAL --- */}
      {showPolicy && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setShowPolicy(false)}></div>
             <div className="relative bg-zinc-950 border border-white/10 w-full max-w-2xl rounded-3xl shadow-2xl p-6 md:p-8 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                 <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                     <h3 className="text-xl font-serif font-bold text-zinc-100 flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                           <Shield className="w-6 h-6 text-amber-500" /> 
                        </div>
                        Servis Prosedürleri
                     </h3>
                     <button onClick={() => setShowPolicy(false)} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white">
                         <X className="w-6 h-6" />
                     </button>
                 </div>
                 
                 <div className="overflow-y-auto pr-2 custom-scrollbar space-y-6">
                      <div className="space-y-2">
                          <h4 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                             <Wrench className="w-4 h-4 text-amber-500" /> 1. Garanti Kapsamı
                          </h4>
                          <p className="text-zinc-400 text-sm leading-relaxed pl-6 border-l border-zinc-800 ml-2">
                             Ürünlerimiz üretim hatalarına karşı garantilidir. Düşme, darbe, sıvı teması, yanlış voltaj kullanımı ve yetkisiz kişilerce yapılan müdahaleler garanti kapsamı dışındadır.
                          </p>
                      </div>
                      
                      <div className="space-y-2">
                          <h4 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                             <Truck className="w-4 h-4 text-amber-500" /> 2. Kargo ve Gönderim
                          </h4>
                          <p className="text-zinc-400 text-sm leading-relaxed pl-6 border-l border-zinc-800 ml-2">
                             Cihazınızı servise göndermeden önce <span className="text-amber-500 font-bold">mutlaka temizleyip sterilize ediniz</span>. Biyolojik risk taşıyan kirli cihazlar işlem yapılmadan iade edilecektir. Kargo ücretleri göndericiye aittir.
                          </p>
                      </div>

                      <div className="space-y-2">
                          <h4 className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                             <Clock className="w-4 h-4 text-amber-500" /> 3. Süreç ve Onay
                          </h4>
                          <p className="text-zinc-400 text-sm leading-relaxed pl-6 border-l border-zinc-800 ml-2">
                             Arıza tespiti yapıldıktan sonra tarafınıza bilgi verilecek ve onayınız alınacaktır. Ortalama servis süresi, parça temin durumuna göre 3-7 iş günüdür.
                          </p>
                      </div>
                      
                      <div className="bg-amber-500/5 p-4 rounded-xl border border-amber-500/10 mt-4">
                          <p className="text-xs text-amber-500/80 flex items-start gap-2">
                             <Info className="w-4 h-4 shrink-0 mt-0.5" />
                             Servis kaydı oluşturarak yukarıdaki koşulları kabul etmiş sayılırsınız.
                          </p>
                      </div>
                 </div>

                 <div className="mt-6 pt-4 border-t border-white/5 flex justify-end">
                     <button
                        onClick={() => setShowPolicy(false)}
                        className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold transition-all border border-white/5"
                     >
                        Anlaşıldı
                     </button>
                 </div>
             </div>
        </div>
      )}

      {lightboxMedia && (
        <div 
            className="fixed inset-0 z-[100] bg-black/98 backdrop-blur-xl flex items-center justify-center p-4 md:p-10"
            onClick={() => setLightboxMedia(null)}
        >
           <button className="absolute top-6 right-6 p-4 bg-zinc-800/80 rounded-full text-white border border-white/10 shadow-2xl z-[110] active:scale-90 transition-transform">
              <X className="w-7 h-7" />
           </button>
           <div className="max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {lightboxMedia.type === 'image' ? (
                    <img 
                        src={lightboxMedia.url} 
                        alt="Zoomed evidence" 
                        className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)]" 
                    />
                ) : (
                    <video 
                        src={lightboxMedia.url} 
                        controls
                        autoPlay
                        className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" 
                    />
                )}
           </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDashboard;