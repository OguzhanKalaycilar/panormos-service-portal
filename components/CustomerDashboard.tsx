import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ServiceRequest, ServiceNote } from '../types';
import { useAuth } from '../lib/AuthContext';
import { Plus, Clock, CheckCircle, Calendar, AlertCircle, X, Shield, AlertTriangle, ChevronRight, History, Play, RefreshCw, Loader2, WifiOff, ShieldCheck, Database, XCircle } from 'lucide-react';
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  
  // Modals
  const [showOnboarding, setShowOnboarding] = useState(false);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setLightboxMedia(null);
    };
    if (lightboxMedia) {
        window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxMedia]);

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
        
        if (isMounted.current) {
            setFetchError(null);
            setErrorCode(null);
        }
    }

    // Safety timeout for data fetch
    const fetchTimeout = setTimeout(() => {
        if (isMounted.current && loadingData && !hasData) {
            setFetchError("Veriler alınırken zaman aşımı oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin.");
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
      if (error.name === 'AbortError' || error.message?.includes('aborted')) return;

      console.error(`Fetch Exception (Attempt ${retryCount + 1}):`, error);

      if (retryCount < 2) {
          if (isMounted.current) {
              setTimeout(() => {
                  if (isMounted.current) fetchMyRequests(forceSilent, retryCount + 1);
              }, 2000);
          }
          return;
      }
      
      if (isMounted.current) {
          if (!hasData) {
              if (error.code === '42P17') {
                 setFetchError("Veritabanı güvenlik politikalarında hata oluştu.");
                 setErrorCode('42P17');
              } else {
                 setFetchError("Hizmet verilemiyor. Lütfen daha sonra deneyin.");
              }
          }
          setLoadingData(false);
          setIsRefreshing(false);
      }
    }
  }, [session, requests.length, loadingData]);

  useEffect(() => {
    if (!authLoading && session?.user.id) {
      fetchMyRequests(); 
      if (profile && profile.role !== 'admin' && profile.has_seen_guide === false) {
          setShowOnboarding(true);
      }
    }
  }, [session, profile, authLoading, fetchMyRequests]);

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
        // Fallback for notes if profile join fails
        const { data, error } = await supabase
            .from('service_notes')
            .select('*')
            .eq('request_id', requestId);
        if (!error && isMounted.current) setNotes(data as ServiceNote[] || []);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    let classes = '';
    let icon = null;
    let label = '';

    switch(status) {
        case 'resolved':
            classes = 'bg-green-500/10 text-green-400 border-green-500/20';
            icon = <CheckCircle className="w-3 h-3"/>;
            label = 'ÇÖZÜLDÜ';
            break;
        case 'rejected':
            classes = 'bg-red-500/10 text-red-400 border-red-500/20';
            icon = <XCircle className="w-3 h-3"/>;
            label = 'REDDEDİLDİ';
            break;
        default:
            classes = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            icon = <Clock className="w-3 h-3"/>;
            label = 'BEKLİYOR';
    }

    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${classes}`}>
          {icon}
          {label}
        </span>
    );
  };

  if (profile?.role === 'admin') return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 relative">
      
      <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-8">
        <div>
           <h2 className="text-3xl font-serif font-bold text-zinc-100 mb-2 tracking-tight">Merhaba, {profile?.full_name || 'Müşterimiz'}</h2>
           <p className="text-zinc-500 text-sm">Teknik servis taleplerinizi buradan takip edebilirsiniz.</p>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={() => setShowPolicy(true)}
                className="bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 font-medium py-3.5 px-5 rounded-xl transition-all flex items-center gap-2 border border-white/5 text-sm"
            >
                <Shield className="w-4 h-4 text-amber-500" /> Garanti Prosedürleri
            </button>
            <button 
                onClick={() => window.location.hash = '#/new-request'}
                className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-bold py-3.5 px-7 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-amber-900/20 hover:shadow-amber-900/40 hover:-translate-y-0.5"
            >
                <Plus className="w-5 h-5" /> Yeni Talep Oluştur
            </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-12">
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <AlertCircle className="w-16 h-16 text-zinc-100" />
            </div>
            <span className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Toplam Talep</span>
            <span className="text-4xl font-bold text-zinc-100">{requests.length}</span>
        </div>
         <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Clock className="w-16 h-16 text-amber-500" />
            </div>
            <span className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Bekleyen İşlem</span>
            <span className="text-4xl font-bold text-amber-500">{requests.filter(r => r.status === 'pending').length}</span>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
               <h3 className="text-xl font-bold text-zinc-100">Geçmiş Talepler</h3>
               {(isRefreshing || authLoading) && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
           </div>
           
           <button 
             onClick={() => fetchMyRequests(false, 0)} 
             disabled={loadingData || isRefreshing}
             className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
             title="Yenile"
           >
             <RefreshCw className={`w-4 h-4 ${(loadingData || isRefreshing) ? 'animate-spin' : ''}`} />
           </button>
        </div>
        
        {fetchError ? (
           <div className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center text-center bg-red-900/10 border border-red-500/20">
              <WifiOff className="w-10 h-10 text-red-500 mb-3" />
              <p className="text-zinc-200 font-bold mb-1">Veriler Yüklenemedi</p>
              <p className="text-zinc-500 text-xs mb-6 max-w-sm">{fetchError}</p>
              <button 
                onClick={() => fetchMyRequests(false, 0)}
                className="flex items-center gap-2 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-bold transition-all border border-white/5"
              >
                <RefreshCw className="w-4 h-4" /> Tekrar Dene
              </button>
           </div>
        ) : loadingData ? (
            <div className="text-center py-20 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-4" />
                <p className="text-zinc-500 text-xs animate-pulse">Veriler yükleniyor...</p>
            </div>
        ) : requests.length === 0 ? (
            <div className="glass-panel py-20 rounded-2xl text-center border-dashed">
                <p className="text-zinc-400 mb-6">Henüz oluşturulmuş bir talebiniz yok.</p>
                <button 
                  onClick={() => window.location.hash = '#/new-request'}
                  className="text-amber-500 text-sm font-semibold hover:text-amber-400 hover:underline"
                >
                  İlk talebinizi oluşturun
                </button>
            </div>
        ) : (
            <div className={`space-y-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-70' : 'opacity-100'}`}>
            {requests.map(req => (
                <div 
                    key={req.id} 
                    onClick={() => handleOpenDetail(req)}
                    className="glass-panel p-6 rounded-2xl hover:bg-zinc-800/40 transition-all flex items-center justify-between group cursor-pointer hover:border-amber-500/30"
                >
                   <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <StatusBadge status={req.status} />
                        <span className="text-xs text-zinc-500 flex items-center gap-1 font-medium"><Calendar className="w-3 h-3"/> {new Date(req.created_at).toLocaleDateString('tr-TR')}</span>
                      </div>
                      <p className="text-zinc-200 font-medium line-clamp-1 text-lg group-hover:text-amber-500 transition-colors">{req.description}</p>
                   </div>
                   <div className="hidden md:flex flex-col items-end text-xs text-zinc-500 border-l border-white/5 pl-6 ml-6">
                      <div className="mb-2 p-2 bg-white/5 rounded-full group-hover:bg-amber-500/10 transition-colors">
                          <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-500" />
                      </div>
                      <span className="uppercase tracking-wider mb-1 text-zinc-600">Alım Tarihi</span>
                      <span className="font-mono text-zinc-400">{req.product_date}</span>
                   </div>
                </div>
            ))}
            </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleCloseDetail}></div>
          <div className="bg-zinc-950 border border-white/10 w-full max-w-5xl max-h-[95vh] rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-white/5 flex items-start justify-between bg-zinc-900/30">
              <div>
                <h3 className="text-xl font-serif font-bold text-zinc-100 mb-2 flex items-center gap-3">
                   {selectedRequest.brand} - {selectedRequest.model}
                   <StatusBadge status={selectedRequest.status} />
                </h3>
              </div>
              <button onClick={handleCloseDetail} className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors border border-white/5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                    <div className="glass-panel rounded-2xl p-6 flex flex-col h-full bg-zinc-900/40">
                        <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-white/5 pb-4">
                            <History className="w-4 h-4"/> Canlı Servis Takibi
                        </h4>
                        <div className="flex-1 overflow-y-auto space-y-0 custom-scrollbar pr-2 min-h-[300px]">
                            {notes.map((note) => (
                                <div key={note.id} className="relative pl-8 pb-8 border-l border-zinc-800 last:border-0 last:pb-0">
                                    <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-zinc-950"></div>
                                    <div className="text-sm text-zinc-200 bg-zinc-900 border border-zinc-800 p-3 rounded-lg inline-block shadow-sm w-full">
                                        <p className="whitespace-pre-wrap">{note.note}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="glass-panel p-6 rounded-2xl bg-zinc-900/40 space-y-4">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Talep Detayları</h4>
                            <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                                {selectedRequest.description}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDashboard;