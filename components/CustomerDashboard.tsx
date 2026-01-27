import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ServiceRequest, ServiceNote } from '../types';
import { useAuth } from '../lib/AuthContext';
import { Plus, Clock, CheckCircle, Calendar, AlertCircle, X, Shield, AlertTriangle, ChevronRight, History, Play, RefreshCw, Loader2, WifiOff, ShieldCheck, Database, XCircle } from 'lucide-react';
import AnchorLogo from './AnchorLogo';

const CustomerDashboard: React.FC = () => {
  const { session, profile, loading: authLoading } = useAuth();
  
  // Mounted Ref for safety
  const isMounted = useRef(true);

  // Data State
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  
  // UI States
  const [loadingData, setLoadingData] = useState(false); // Blocking loader (Initial only)
  const [isRefreshing, setIsRefreshing] = useState(false); // Background loader (Re-fetch)
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

    // Smart Loading Strategy
    const hasData = requests.length > 0;
    const isBackground = hasData || forceSilent;

    // Only update loading state on the first attempt
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

    try {
      const { data, error } = await supabase
        .from('service_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (isMounted.current) {
         setRequests(data as ServiceRequest[] || []);
         setLoadingData(false);
         setIsRefreshing(false);
      }

    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('signal is aborted')) {
         console.warn("Request fetch aborted safely.");
         return; 
      }

      console.error(`Fetch Exception (Attempt ${retryCount + 1}):`, error);

      // Auto-Retry Logic (Max 3 retries)
      if (retryCount < 3) {
          if (isMounted.current) {
              setTimeout(() => {
                  if (isMounted.current) fetchMyRequests(forceSilent, retryCount + 1);
              }, 2000);
          }
          return; // Continue loading state
      }
      
      // Final Failure
      if (isMounted.current) {
          // Only set blocking error if user sees nothing
          if (!hasData) {
              if (error.code === '42P17') {
                 setFetchError("Veritabanı güvenlik politikalarında döngüsel hata (Recursion).");
                 setErrorCode('42P17');
              } else {
                 setFetchError("Hizmet verilemiyor. Lütfen daha sonra deneyin.");
              }
          } else {
              console.warn("Background refresh failed, keeping stale data.");
          }
          setLoadingData(false);
          setIsRefreshing(false);
      }
    }
  }, [session, requests.length]);

  // Initial Fetch & Onboarding Check
  useEffect(() => {
    if (!authLoading && session?.user.id) {
      fetchMyRequests(); 
      // Check onboarding - CRITICAL: Never show to admins
      if (profile && profile.role !== 'admin' && profile.has_seen_guide === false) {
          setShowOnboarding(true);
      }
    }
  }, [session, profile, authLoading, fetchMyRequests]);

  // --- WINDOW FOCUS & VISIBILITY HANDLER ---
  useEffect(() => {
    const handleRevalidation = () => {
      if (document.visibilityState === 'visible' && session?.user.id && isMounted.current) {
        fetchMyRequests(true, 0); // Reset retry count
      }
    };

    window.addEventListener('focus', handleRevalidation);
    window.addEventListener('visibilitychange', handleRevalidation);

    return () => {
      window.removeEventListener('focus', handleRevalidation);
      window.removeEventListener('visibilitychange', handleRevalidation);
    };
  }, [session, fetchMyRequests]);

  const fetchNotes = async (requestId: number) => {
    try {
      // 1. Attempt Joined Query First (Best Case)
      const { data, error } = await supabase
        .from('service_notes')
        .select('*, author:profiles(role, full_name)')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true }); 

      if (error) throw error;
      if (isMounted.current) setNotes(data as ServiceNote[] || []);

    } catch (e: any) {
      if (e.name === 'AbortError' || e.message?.includes('aborted')) return;

      console.warn("Notes join failed, retrying simple select:", e);
      
      // 2. Fallback to Simple Select WITH Order
      try {
          const { data, error } = await supabase
          .from('service_notes')
          .select('*')
          .eq('request_id', requestId)
          .order('created_at', { ascending: true });
          
          if (error) throw error;
          if (isMounted.current) setNotes(data as ServiceNote[] || []);

      } catch (e2: any) {
          if (e2.name === 'AbortError' || e2.message?.includes('aborted')) return;
          console.warn("Notes simple select failed (possible 400), trying without sort:", e2);

          // 3. Fallback to Simple Select WITHOUT Order (Fix for 400 errors)
          try {
             const { data, error } = await supabase
                .from('service_notes')
                .select('*')
                .eq('request_id', requestId);
             
             if (error) throw error;

             if (isMounted.current) {
                 // Manual Client-Side Sort
                 const sorted = (data as ServiceNote[] || []).sort((a,b) => 
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                 );
                 setNotes(sorted);
             }
          } catch (finalError: any) {
             if (finalError.name === 'AbortError' || finalError.message?.includes('aborted')) return;
             console.error("Notes fetch completely failed", finalError);
          }
      }
    }
  };

  const handleOpenDetail = (req: ServiceRequest) => {
      setSelectedRequest(req);
      fetchNotes(req.id);
  };

  const handleCloseDetail = () => {
      setSelectedRequest(null);
      setNotes([]);
  };

  const handleCloseOnboarding = async () => {
      setShowOnboarding(false);
      if (session?.user.id) {
          try {
              const { error } = await supabase
                  .from('profiles')
                  .update({ has_seen_guide: true })
                  .eq('id', session.user.id);
              if(error) console.error("Guide update error", error);
          } catch (e) {
              console.error("Failed to update profile", e);
          }
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

  // --- SECONDARY RENDER GUARD ---
  if (profile?.role === 'admin') {
      return null;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 relative">
      
      {/* Welcome Section */}
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

      {/* Stats */}
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

      {/* List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
               <h3 className="text-xl font-bold text-zinc-100">Geçmiş Talepler</h3>
               {isRefreshing && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
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
           <div className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center text-center bg-red-900/10 border border-red-500/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-red-500/5 pattern-grid-lg opacity-20"></div>
              {errorCode === '42P17' ? (
                <>
                  <Database className="w-12 h-12 text-amber-500 mb-3" />
                  <h3 className="text-lg font-bold text-zinc-200 mb-1">Veritabanı Yapılandırma Hatası</h3>
                  <p className="text-zinc-400 text-sm mb-4 max-w-md">
                    Sistemde sonsuz döngü (recursion) hatası tespit edildi. Geliştirici ekibin <strong>db_fix.sql</strong> dosyasını çalıştırması gerekmektedir.
                  </p>
                  <div className="bg-black/50 p-4 rounded-lg border border-zinc-800 font-mono text-xs text-amber-500 text-left w-full max-w-md overflow-x-auto">
                    Error Code: 42P17 (Infinite Recursion) <br/>
                    Table: service_requests
                  </div>
                </>
              ) : (
                <>
                    <WifiOff className="w-10 h-10 text-red-500 mb-2" />
                    <p className="text-zinc-200 font-bold mb-1">Hizmet Kesintisi</p>
                    <p className="text-zinc-500 text-xs mb-4">{fetchError}</p>
                </>
              )}
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
                      <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-zinc-600 bg-zinc-900/50 px-2 py-1 rounded border border-zinc-800">{req.brand}</span>
                          <span className="text-xs text-zinc-600 bg-zinc-900/50 px-2 py-1 rounded border border-zinc-800">{req.model}</span>
                          {req.category && <span className="text-xs text-amber-500/80 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">{req.category}</span>}
                      </div>
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

      {/* --- ONBOARDING MODAL --- */}
      {showOnboarding && profile?.role !== 'admin' && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={handleCloseOnboarding}></div>
            <div className="relative bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl p-8 animate-in zoom-in-95 duration-300">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-amber-500 p-4 rounded-full border-[6px] border-zinc-950 shadow-xl">
                    <AnchorLogo className="w-12 h-12" large />
                </div>
                
                <div className="mt-8 text-center">
                    <h3 className="text-2xl font-serif font-bold text-zinc-100 mb-2">Hoşgeldiniz!</h3>
                    <p className="text-zinc-400 text-sm">Panormos Tattoo Teknik Servis Portalına hoşgeldiniz. <br/>Servis talebi oluşturma adımları aşağıdadır.</p>
                </div>

                <div className="mt-8 space-y-6">
                    <StepItem number="1" title="Cihaz Bilgisi" desc="Marka, Model ve Alım Tarihi bilgisini girin." />
                    <StepItem number="2" title="Kategori Seçimi" desc="Arıza türünü (Motor, Soket, Batarya vb.) seçin." />
                    <StepItem number="3" title="Görsel Kanıt" desc="En az 1 Fotoğraf ve 1 Video yüklemek zorunludur." />
                    <StepItem number="4" title="Şeffaf Takip" desc="Cihazınızın her onarım adımını panelden canlı izleyin." />
                </div>

                <button 
                    onClick={handleCloseOnboarding}
                    className="w-full mt-8 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-bold py-4 rounded-xl transition-all shadow-lg"
                >
                    Anladım, Devam Et
                </button>
            </div>
         </div>
      )}

      {/* --- POLICY MODAL --- */}
      {showPolicy && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowPolicy(false)}></div>
             <div className="relative bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
                 
                 <div className="p-6 border-b border-white/5 flex items-center justify-between">
                     <h3 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-amber-500" /> Garanti ve Teknik Prosedürler
                     </h3>
                     <button onClick={() => setShowPolicy(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-zinc-200">
                        <X className="w-5 h-5" />
                     </button>
                 </div>

                 <div className="p-8 overflow-y-auto space-y-8">
                     <div className="glass-panel p-6 rounded-xl bg-green-900/10 border-green-500/20">
                         <h4 className="text-green-400 font-bold mb-3 flex items-center gap-2 text-lg">
                             <CheckCircle className="w-5 h-5" /> Garanti Kapsamındaki Durumlar
                         </h4>
                         <ul className="list-disc list-inside text-zinc-300 space-y-2 text-sm ml-2">
                             <li>Üretim kaynaklı motor arızaları.</li>
                             <li>PCB elektronik devre kartı sorunları.</li>
                             <li>Batarya performans düşüklüğü (Üretim hataları).</li>
                             <li>Bağlantı soketi temassızlıkları (Kullanıcı kaynaklı olmayan).</li>
                         </ul>
                     </div>

                     <div className="glass-panel p-6 rounded-xl bg-red-900/10 border-red-500/20">
                         <h4 className="text-red-400 font-bold mb-3 flex items-center gap-2 text-lg">
                             <AlertTriangle className="w-5 h-5" /> Garanti Dışı (Ücretli Onarım)
                         </h4>
                         <div className="text-zinc-300 text-sm space-y-4">
                             <p className="font-semibold text-red-200 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                                ÖNEMLİ: Cihaz içerisine mürekkep veya sıvı kaçması (Ink Ingress) kesinlikle garanti dışıdır. Bu durum kalıcı motor ve devre hasarına yol açar.
                             </p>
                             <ul className="list-disc list-inside space-y-2 ml-2">
                                 <li>Düşürme, çarpma kaynaklı fiziksel hasarlar.</li>
                                 <li>Yüksek voltaj kullanımı sonucu motor/devre yanıkları.</li>
                                 <li>Yetkisiz kişilerce cihazın açılması veya müdahale edilmesi.</li>
                                 <li>Yan sanayi parça kullanımı.</li>
                             </ul>
                         </div>
                     </div>
                 </div>

                 <div className="p-6 border-t border-white/5 bg-zinc-900/50 rounded-b-3xl">
                     <button 
                        onClick={() => setShowPolicy(false)}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold py-3 rounded-xl transition-all"
                     >
                         Kapat
                     </button>
                 </div>
             </div>
          </div>
      )}

      {/* --- CUSTOMER DETAIL / TIMELINE MODAL --- */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleCloseDetail}></div>
          <div className="bg-zinc-950/90 backdrop-blur-2xl border border-white/10 w-full max-w-5xl max-h-[95vh] rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="p-6 border-b border-white/5 flex items-start justify-between bg-zinc-900/30">
              <div>
                <h3 className="text-xl font-serif font-bold text-zinc-100 mb-2 flex items-center gap-3">
                   {selectedRequest.brand} - {selectedRequest.model}
                   <StatusBadge status={selectedRequest.status} />
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                   <span className="flex items-center gap-2 bg-zinc-900/50 border border-white/5 px-2 py-1 rounded-lg text-xs"><Calendar className="w-3 h-3"/> {new Date(selectedRequest.created_at).toLocaleDateString('tr-TR')}</span>
                   <span className="flex items-center gap-2 bg-zinc-900/50 border border-white/5 px-2 py-1 rounded-lg text-xs text-amber-500">{selectedRequest.category}</span>
                </div>
              </div>
              <button onClick={handleCloseDetail} className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors border border-white/5">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-zinc-950/50">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                
                <div className="flex flex-col gap-4 h-full">
                   <div className="glass-panel rounded-2xl p-6 flex flex-col h-full bg-zinc-900/40">
                      <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-white/5 pb-4">
                        <History className="w-4 h-4"/> Canlı Servis Takibi
                      </h4>
                      
                      <div className="flex-1 overflow-y-auto space-y-0 custom-scrollbar pr-2">
                         <div className="relative pl-8 pb-8 border-l border-zinc-800 last:border-0 last:pb-0">
                             <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-zinc-600 ring-4 ring-zinc-950"></div>
                             <div className="flex items-center gap-2 mb-1">
                                <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide">
                                    {new Date(selectedRequest.created_at).toLocaleString('tr-TR')}
                                </div>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">SİSTEM</span>
                             </div>
                             <div className="text-sm text-zinc-400">
                                Talep oluşturuldu.
                             </div>
                         </div>

                         {notes.map((note) => (
                             <div key={note.id} className="relative pl-8 pb-8 border-l border-zinc-800 last:border-0 last:pb-0">
                                <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-zinc-950"></div>
                                <div className="flex items-center gap-2 mb-1">
                                   <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide">
                                      {new Date(note.created_at).toLocaleString('tr-TR')}
                                   </div>
                                   {note.author?.role === 'admin' && (
                                       <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                            <ShieldCheck className="w-3 h-3" /> TEKNİK EKİP
                                       </span>
                                   )}
                                   {(note.author?.role as string) === 'customer' && (
                                       <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                                            MÜŞTERİ
                                       </span>
                                   )}
                                </div>
                                <div className="text-sm text-zinc-200 bg-zinc-900 border border-zinc-800 p-3 rounded-lg inline-block shadow-sm w-full">
                                   <p className="whitespace-pre-wrap">{note.note}</p>
                                   {note.media_url && (
                                       <div className="mt-3 rounded-lg overflow-hidden border border-zinc-700 bg-black/50 cursor-pointer hover:border-amber-500/50 transition-colors"
                                            onClick={() => setLightboxMedia({url: note.media_url!, type: note.media_type!})}>
                                            {note.media_type === 'image' ? (
                                                <img src={note.media_url} alt="Note Attachment" className="w-full h-32 object-cover" />
                                            ) : (
                                                <div className="w-full h-32 flex items-center justify-center">
                                                    <Play className="w-8 h-8 text-white/80" />
                                                </div>
                                            )}
                                       </div>
                                   )}
                                </div>
                             </div>
                           ))
                         }
                      </div>
                   </div>
                </div>

                <div className="space-y-6">
                   {selectedRequest.status === 'rejected' && selectedRequest.rejection_reason && (
                       <div className="glass-panel p-6 rounded-2xl bg-red-900/20 border-red-500/30 space-y-2 animate-in slide-in-from-top-2">
                           <h4 className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
                               <AlertTriangle className="w-4 h-4" /> Red Nedeni
                           </h4>
                           <div className="text-red-100 text-sm leading-relaxed font-medium">
                                {selectedRequest.rejection_reason}
                           </div>
                       </div>
                   )}

                   <div className="glass-panel p-6 rounded-2xl bg-zinc-900/40 space-y-4">
                       <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Talep Detayları</h4>
                       <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                            {selectedRequest.description}
                       </div>
                   </div>

                   <div>
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Yüklediğiniz Dosyalar</h4>
                      <div className="grid grid-cols-3 gap-3">
                        {selectedRequest.media_urls?.map((media, idx) => (
                          <div 
                            key={idx} 
                            className="aspect-square bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 relative group cursor-pointer hover:border-amber-500/50 transition-colors shadow-lg"
                            onClick={() => setLightboxMedia({url: media.url, type: media.type})}
                          >
                            {media.type === 'image' ? (
                              <img src={media.url} className="w-full h-full object-cover" />
                            ) : (
                              <video src={media.url} className="w-full h-full object-cover" />
                            )}
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

      {lightboxMedia && (
        <div 
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
            onClick={() => setLightboxMedia(null)}
        >
           <button 
             onClick={() => setLightboxMedia(null)}
             className="absolute top-6 right-6 z-50 p-3 bg-zinc-800 hover:bg-zinc-700 text-white hover:text-amber-500 rounded-full border border-white/10 hover:border-amber-500/50 transition-all shadow-xl"
           >
              <X className="w-6 h-6" />
           </button>
           <div 
             className="relative max-w-full max-h-full"
             onClick={(e) => e.stopPropagation()}
           >
                {lightboxMedia.type === 'image' ? (
                        <img 
                            src={lightboxMedia.url} 
                            alt="Full View" 
                            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl ring-1 ring-white/10 object-contain" 
                        />
                ) : (
                        <video 
                            src={lightboxMedia.url} 
                            controls
                            autoPlay
                            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl ring-1 ring-white/10 object-contain" 
                        />
                )}
           </div>
        </div>
      )}

    </div>
  );
};

const StepItem = ({ number, title, desc }: { number: string, title: string, desc: string }) => (
    <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-amber-500 font-bold shrink-0 border border-zinc-700">
            {number}
        </div>
        <div>
            <h4 className="text-zinc-200 font-bold text-sm">{title}</h4>
            <p className="text-zinc-500 text-xs mt-0.5">{desc}</p>
        </div>
    </div>
);

export default CustomerDashboard;