
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ServiceRequest, ServiceNote, RequestStatus } from '../types';
import { useAuth } from '../lib/AuthContext';
import toast from 'react-hot-toast';
import { notifyAdmins } from '../lib/notifications'; 
import { 
  Plus, Clock, CheckCircle, Calendar, AlertCircle, X, Shield, AlertTriangle, 
  ChevronRight, History, Play, Loader2, WifiOff, XCircle, 
  Wrench, FileText, Truck, Info, MessageCircle, Paperclip, Send,
  ThumbsUp, Image as ImageIcon
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import ServicePdfDocument from './ServicePdfDocument';
import * as XLSX from 'xlsx';

const DATA_FETCH_TIMEOUT = 7000;

const STATUS_OPTIONS: { value: RequestStatus; label: string; color: string }[] = [
    { value: 'pending', label: 'Bekliyor', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
    { value: 'diagnosing', label: 'İnceleniyor', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    { value: 'pending_approval', label: 'Onay Bekliyor', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
    { value: 'approved', label: 'İşlemde', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
    { value: 'waiting_parts', label: 'Parça Bekleniyor', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
    { value: 'resolved', label: 'Tamamlandı', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { value: 'shipped', label: 'Kargolandı', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
    { value: 'completed', label: 'Teslim Edildi', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
    { value: 'rejected', label: 'İptal / Red', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
];

const CustomerDashboard: React.FC = () => {
  const { session, profile, loading: authLoading } = useAuth();
  const isMounted = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});
  const [loadingData, setLoadingData] = useState(false); 
  const [isRefreshing, setIsRefreshing] = useState(false); 
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'chat'>('info');

  const requestsRef = useRef<ServiceRequest[]>([]);
  requestsRef.current = requests;

  const [showPolicy, setShowPolicy] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const selectedRequestRef = useRef<ServiceRequest | null>(null); 
  const [notes, setNotes] = useState<ServiceNote[]>([]);
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);

  const [newNote, setNewNote] = useState('');
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [isSendingNote, setIsSendingNote] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile?.role === 'admin') window.location.hash = '#/admin-dashboard';
  }, [profile]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => { selectedRequestRef.current = selectedRequest; }, [selectedRequest]);

  useEffect(() => {
      audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'); 
      audioRef.current.volume = 0.5;
  }, []);

  const playNotificationSound = () => {
      if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(e => console.log(e)); }
  };

  const handleOpenDetail = useCallback((req: ServiceRequest) => {
      setSelectedRequest(req);
      setActiveDetailTab('info');
      fetchNotes(req.id);
      setUnreadMap(prev => ({ ...prev, [String(req.id)]: false }));
      document.body.style.overflow = 'hidden';
  }, []);

  useEffect(() => {
      const handleHashChange = () => {
          if (!requests.length) return;
          const hash = window.location.hash;
          if (hash.includes('?id=')) {
              // Extract ID using URLSearchParams for accuracy
              const queryString = hash.split('?')[1];
              const params = new URLSearchParams(queryString);
              const idPart = params.get('id');
              
              if (idPart) {
                  const req = requests.find(r => String(r.id) === idPart);
                  if (req) handleOpenDetail(req);
              }
          }
      };
      
      handleHashChange(); // Run when requests are first loaded
      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
  }, [requests, handleOpenDetail]);

  useEffect(() => {
    if (activeDetailTab === 'chat' && notesContainerRef.current) {
        const timer = setTimeout(() => {
            if (notesContainerRef.current) notesContainerRef.current.scrollTop = notesContainerRef.current.scrollHeight;
        }, 100);
        return () => clearTimeout(timer);
    }
  }, [activeDetailTab, notes, selectedRequest]);

  const fetchMyRequests = useCallback(async (forceSilent = false, retryCount = 0) => {
    if (!session?.user?.id) return;
    const hasData = requestsRef.current.length > 0;
    if (retryCount === 0) {
        if (hasData || forceSilent) { if (isMounted.current) setIsRefreshing(true); } 
        else { if (isMounted.current) setLoadingData(true); }
        if (isMounted.current) setFetchError(null);
    }
    const fetchTimeout = setTimeout(() => {
        if (isMounted.current && !hasData) { setFetchError("Bağlantı yavaş."); setLoadingData(false); }
    }, DATA_FETCH_TIMEOUT);
    try {
      const { data, error } = await supabase.from('service_requests').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      let map: Record<string, boolean> = {};
      if (data && data.length > 0) {
          const { data: notesMeta } = await supabase.from('service_notes').select('request_id, author_id').in('request_id', data.map(r => r.id)).order('created_at', { ascending: true });
          if (notesMeta) notesMeta.forEach(n => { if (n.author_id !== session.user.id) map[String(n.request_id)] = true; });
      }
      clearTimeout(fetchTimeout);
      if (isMounted.current) { setRequests(data as ServiceRequest[] || []); if (!forceSilent) setUnreadMap(map); setLoadingData(false); setIsRefreshing(false); }
    } catch (error: any) {
      clearTimeout(fetchTimeout);
      if (retryCount < 1) { setTimeout(() => { if (isMounted.current) fetchMyRequests(forceSilent, retryCount + 1); }, 1500); return; }
      if (isMounted.current) { setFetchError("Hata oluştu."); setLoadingData(false); setIsRefreshing(false); }
    }
  }, [session]);

  useEffect(() => { if (!authLoading && session?.user.id) fetchMyRequests(); }, [session, authLoading, fetchMyRequests]);

  useEffect(() => {
      if (!session?.user?.id) return;
      const channel = supabase.channel('customer-realtime')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_requests', filter: `user_id=eq.${session.user.id}` }, (payload) => {
                const updatedReq = payload.new as ServiceRequest;
                setRequests(prev => prev.map(r => r.id === updatedReq.id ? updatedReq : r));
                if (selectedRequestRef.current && String(selectedRequestRef.current.id) === String(updatedReq.id)) setSelectedRequest(updatedReq);
                toast.success('Talep durumunuz güncellendi.');
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_notes' }, (payload) => {
                const newNote = payload.new as ServiceNote;
                if (newNote.author_id === session.user.id) return;
                if (requestsRef.current.some(r => r.id === newNote.request_id)) {
                    if (selectedRequestRef.current && String(selectedRequestRef.current.id) === String(newNote.request_id)) {
                        supabase.from('profiles').select('full_name, role').eq('id', newNote.author_id).single()
                        .then(({data}) => {
                            const noteWithAuthor = { ...newNote, author: data || { full_name: 'Yetkili', role: 'admin' } };
                            setNotes(prev => prev.some(n => n.id === newNote.id) ? prev : [...prev, noteWithAuthor as ServiceNote]);
                            playNotificationSound();
                        });
                    } else {
                        playNotificationSound();
                        setUnreadMap(prev => ({ ...prev, [String(newNote.request_id)]: true }));
                        toast('Yeni mesajınız var.');
                    }
                }
        }).subscribe();
      return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const handleCloseDetail = () => {
      setSelectedRequest(null); setNotes([]); setNewNote(''); setNoteFile(null);
      document.body.style.overflow = 'auto'; window.location.hash = '#/my-requests'; 
  };

  const fetchNotes = async (requestId: number | string) => {
    try {
      const { data: notesData, error } = await supabase.from('service_notes').select('*').eq('request_id', requestId).order('created_at', { ascending: true });
      if (error) throw error;
      const authorIds = [...new Set(notesData?.map(n => n.author_id).filter(Boolean))];
      let profileMap: Record<string, any> = {};
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, role').in('id', authorIds);
        if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });
      }
      const mergedNotes = notesData?.map(n => ({ ...n, author: profileMap[n.author_id] || { role: 'customer', full_name: 'Kullanıcı' } }));
      if (isMounted.current) setNotes(mergedNotes as ServiceNote[] || []);
    } catch (e) { console.error(e); }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || (!newNote.trim() && !noteFile)) return;
    setIsSendingNote(true);
    try {
        let mediaUrl = null, mediaType = null;
        if (noteFile) {
            const path = `notes/${Date.now()}_${noteFile.name}`;
            await supabase.storage.from('service-media').upload(path, noteFile);
            mediaUrl = supabase.storage.from('service-media').getPublicUrl(path).data.publicUrl;
            mediaType = noteFile.type.startsWith('video/') ? 'video' : 'image';
        }
        const { data: insertedNote, error } = await supabase.from('service_notes').insert({ request_id: selectedRequest.id, author_id: session?.user?.id, note: newNote.trim(), media_url: mediaUrl, media_type: mediaType }).select().single();
        if (error) throw error;
        if (insertedNote) {
             const noteWithAuthor = { ...insertedNote, author: { role: 'customer', full_name: profile?.full_name || 'Ben' } };
             setNotes(prev => [...prev, noteWithAuthor as ServiceNote]);
        }
        await notifyAdmins("Müşteri Mesajı", `${profile?.full_name || 'Müşteri'} yeni mesaj gönderdi.`, 'info', `#/admin-dashboard?id=${selectedRequest.id}`);
        setNewNote(''); setNoteFile(null); toast.success("Gönderildi.");
    } catch (e: any) { toast.error("Hata: " + e.message); } finally { setIsSendingNote(false); }
  };

  const handleApproveCost = async () => {
      if (!selectedRequest) return;
      if (!confirm("Onaylıyor musunuz?")) return;
      try {
          const { error } = await supabase.from('service_requests').update({ status: 'approved', approved_by_customer: true }).eq('id', selectedRequest.id);
          if (error) throw error;
          await supabase.from('service_notes').insert({ request_id: selectedRequest.id, author_id: session?.user?.id, note: `MÜŞTERİ ONAYI: ${selectedRequest.estimated_cost} ${selectedRequest.currency} onaylandı.` });
          await notifyAdmins("Fiyat Onaylandı", `Talep #${String(selectedRequest.id).slice(0,6)}... için müşteri fiyat onayı verdi.`, 'success', `#/admin-dashboard?id=${selectedRequest.id}`);
          setSelectedRequest(prev => prev ? ({ ...prev, status: 'approved', approved_by_customer: true }) : null);
          toast.success("Onayınız alındı.");
      } catch (e) { toast.error("Hata."); }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const option = STATUS_OPTIONS.find(o => o.value === status);
    return ( <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-bold border whitespace-nowrap ${option?.color || 'bg-zinc-800 text-zinc-400'}`}> {option?.label || status} </span> );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-serif font-bold text-zinc-100 mb-0.5">Onarım Geçmişi</h2>
          <p className="text-zinc-500 text-xs">Cihazlarınızın servis durumunu takip edin.</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
            <button onClick={() => setShowPolicy(true)} className="flex-1 md:flex-none px-4 py-2 bg-zinc-900 border border-zinc-700 text-zinc-400 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider hover:bg-zinc-800 hover:text-white"> Garanti Şartları </button>
            <button onClick={() => window.location.hash = '#/new-request'} className="flex-1 md:flex-none bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl font-bold transition-all shadow-lg text-xs uppercase tracking-widest"> Yeni Talep </button>
        </div>
      </div>

      {loadingData && ( <div className="flex flex-col items-center justify-center py-12 text-zinc-500 animate-pulse"> <Loader2 className="w-8 h-8 animate-spin mb-2 text-amber-500" /> <p className="text-xs uppercase tracking-widest">Yükleniyor...</p> </div> )}
      
      {fetchError && !loadingData && ( <div className="bg-red-900/10 border border-red-500/20 p-6 rounded-2xl text-center mb-8"> <WifiOff className="w-8 h-8 text-red-500 mx-auto mb-2" /> <p className="text-red-400 font-bold mb-4">{fetchError}</p> <button onClick={() => fetchMyRequests()} className="bg-zinc-800 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors">Tekrar Dene</button> </div> )}

      {!loadingData && !fetchError && (
          <div className="grid gap-3">
              {requests.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800">
                      <Wrench className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                      <h3 className="text-zinc-300 font-bold text-base mb-1">Henüz talebiniz yok.</h3>
                      <button onClick={() => window.location.hash = '#/new-request'} className="text-amber-500 font-bold text-xs uppercase underline underline-offset-4 tracking-widest">Hemen Kayıt Oluşturun</button>
                  </div>
              ) : (
                  requests.map(req => (
                      <div key={req.id} onClick={() => handleOpenDetail(req)} className="group bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/5 hover:border-amber-500/20 p-4 rounded-xl cursor-pointer transition-all relative overflow-hidden">
                         {unreadMap[String(req.id)] && ( <div className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-[0_0_10px_#f59e0b] m-3"></div> )}
                         <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                             <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold shadow-inner shrink-0 ${unreadMap[String(req.id)] ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {unreadMap[String(req.id)] ? <MessageCircle className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <h4 className="font-bold text-zinc-200 group-hover:text-white transition-colors text-base truncate">{req.brand} {req.model}</h4>
                                        <span className="text-zinc-600 text-[9px] bg-zinc-950 px-1 py-0.5 rounded font-mono border border-zinc-800">#{String(req.id).slice(0,6)}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] text-zinc-500 truncate font-medium uppercase tracking-tighter">
                                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {new Date(req.created_at).toLocaleDateString()}</span>
                                        <span className="hidden sm:flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {req.category}</span>
                                    </div>
                                </div>
                             </div>
                             <div className="flex items-center justify-between sm:justify-end gap-4 pl-14 sm:pl-0 mt-1 sm:mt-0">
                                 <div className="text-right">
                                    <div className="mb-1"><StatusBadge status={req.status} /></div>
                                    {req.estimated_cost && req.estimated_cost > 0 && ( <div className="text-[10px] text-zinc-500 font-mono">{req.estimated_cost} {req.currency}</div> )}
                                 </div>
                                 <ChevronRight className="w-5 h-5 text-zinc-700 group-hover:text-amber-500 transition-transform group-hover:translate-x-1" />
                             </div>
                         </div>
                      </div>
                  ))
              )}
          </div>
      )}

      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-zinc-900 w-[92%] max-w-4xl h-[85vh] rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-zinc-950">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-amber-500 shrink-0"> <Wrench className="w-4 h-4" /> </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-zinc-100 truncate">{selectedRequest.brand} {selectedRequest.model}</h2>
                            <p className="text-[10px] text-zinc-500 font-mono">#{String(selectedRequest.id).slice(0,8)} | {new Date(selectedRequest.created_at).toLocaleDateString()}</p>
                        </div>
                    </div>
                    <button onClick={handleCloseDetail} className="p-1.5 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex border-b border-white/5 bg-zinc-900/50">
                    <button onClick={() => setActiveDetailTab('info')} className={`flex-1 py-3 text-[10px] font-bold transition-all border-b-2 uppercase tracking-widest ${activeDetailTab === 'info' ? 'text-amber-500 border-amber-500 bg-zinc-800/30' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}> <div className="flex items-center justify-center gap-1.5"><Info className="w-3.5 h-3.5" /> BİLGİLER</div> </button>
                    <button onClick={() => setActiveDetailTab('chat')} className={`flex-1 py-3 text-[10px] font-bold transition-all border-b-2 uppercase tracking-widest ${activeDetailTab === 'chat' ? 'text-amber-500 border-amber-500 bg-zinc-800/30' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}> <div className="flex items-center justify-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> MESAJLAR</div> </button>
                </div>
                
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {activeDetailTab === 'info' && (
                        <div className="absolute inset-0 overflow-y-auto p-5 space-y-6 bg-zinc-900/50 animate-in fade-in slide-in-from-left-4 duration-300">
                            <div className="bg-zinc-950 p-4 rounded-xl border border-white/5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Durum</h3>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${selectedRequest.status === 'pending_approval' ? 'bg-purple-500 animate-ping' : 'bg-amber-500'}`}></div>
                                        <span className="text-base font-bold text-zinc-200">{STATUS_OPTIONS.find(o => o.value === selectedRequest.status)?.label || selectedRequest.status}</span>
                                    </div>
                                </div>
                                {selectedRequest.status === 'pending_approval' && !selectedRequest.approved_by_customer && (
                                    <button onClick={handleApproveCost} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors flex items-center gap-2"> <ThumbsUp className="w-3.5 h-3.5" /> FİYATI ONAYLA </button>
                                )}
                            </div>

                            {selectedRequest.status === 'pending_approval' && !selectedRequest.approved_by_customer && (
                                <div className="bg-purple-900/10 border border-purple-500/20 p-4 rounded-xl text-center">
                                    <span className="text-[10px] text-zinc-500 block font-bold uppercase tracking-widest mb-1">Onarım Bedeli</span>
                                    <span className="text-2xl font-bold text-white">{selectedRequest.estimated_cost} {selectedRequest.currency}</span>
                                </div>
                            )}

                            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
                                <h3 className="text-amber-500 text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-2"> <AlertTriangle className="w-3 h-3" /> Arıza Açıklamanız </h3>
                                <p className="text-amber-100/80 text-xs leading-relaxed italic whitespace-pre-wrap">"{selectedRequest.description}"</p>
                            </div>

                            {selectedRequest.media_urls && selectedRequest.media_urls.length > 0 && (
                                <div className="bg-zinc-950/30 p-5 rounded-2xl border border-white/5 space-y-4">
                                    <h4 className="font-bold text-zinc-400 text-[10px] uppercase tracking-widest flex items-center gap-2"><ImageIcon className="w-3 h-3"/> Medya / Dosyalar</h4>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                                        {selectedRequest.media_urls.map((media, i) => (
                                            <div key={i} className="aspect-square bg-black rounded-lg overflow-hidden border border-white/10 relative group cursor-pointer hover:border-amber-500/40 transition-all" onClick={() => setLightboxMedia(media)}>
                                                {media.type === 'video' ? ( <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Play className="w-6 h-6 text-white opacity-70" /></div> ) : ( <img src={media.url} className="w-full h-full object-cover opacity-80" /> )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeDetailTab === 'chat' && (
                        <div className="absolute inset-0 flex flex-col bg-zinc-950 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar" ref={notesContainerRef}>
                                 {notes.length === 0 && <div className="text-center text-zinc-600 my-10 text-xs uppercase tracking-widest">Henüz mesaj yok.</div>}
                                 {notes.map(note => (
                                     <div key={note.id} className={`flex ${note.author_id === session?.user?.id ? 'justify-end' : 'justify-start'}`}>
                                         <div className={`max-w-[80%] p-3 rounded-2xl ${note.author_id === session?.user?.id ? 'bg-amber-500/10 border border-amber-500/20 text-amber-100 rounded-tr-none' : 'bg-zinc-800 text-zinc-200 rounded-tl-none border border-white/5'}`}>
                                             {note.media_url && ( <div className="mb-2 rounded-lg overflow-hidden border border-white/5 cursor-pointer" onClick={() => setLightboxMedia({ url: note.media_url!, type: note.media_type || 'image' })}> {note.media_type === 'image' ? <img src={note.media_url} className="max-w-full h-auto" /> : <div className="bg-black/50 p-4 flex items-center justify-center"><Play className="w-6 h-6 text-white"/></div>} </div> )}
                                             <p className="text-xs leading-relaxed whitespace-pre-wrap">{note.note}</p>
                                             <div className="text-[9px] opacity-40 mt-1.5 flex justify-between gap-3 pt-1.5 border-t border-white/5 uppercase tracking-tighter">
                                                 <span>{note.author_id === session?.user?.id ? 'Ben' : 'Teknik Servis'}</span>
                                                 <span>{new Date(note.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                             </div>
                                         </div>
                                     </div>
                                 ))}
                            </div>
                            <div className="p-4 bg-zinc-900 border-t border-white/5">
                                <form onSubmit={handleAddNote} className="flex gap-2">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl transition-colors"><Paperclip className="w-5 h-5" /></button>
                                    <input type="file" ref={fileInputRef} onChange={e => setNoteFile(e.target.files?.[0] || null)} className="hidden" />
                                    <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Mesaj yazın..." className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-sm text-zinc-200 outline-none" />
                                    <button type="submit" disabled={isSendingNote} className="p-2.5 bg-amber-500 text-black rounded-xl font-bold transition-all disabled:opacity-50">{isSendingNote ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}</button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
      
      {showPolicy && (
          <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4">
              <div className="bg-zinc-900 border border-white/10 rounded-3xl max-w-lg w-[92%] p-6 relative shadow-2xl">
                  <button onClick={() => setShowPolicy(false)} className="absolute top-4 right-4 p-1.5 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
                  <h3 className="text-xl font-serif font-bold text-white mb-6 flex items-center gap-3"><Shield className="w-6 h-6 text-amber-500" /> Garanti Şartları</h3>
                  
                  <div className="space-y-5 text-zinc-400 text-xs leading-relaxed overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
                      
                      <div className="bg-zinc-950/50 p-4 rounded-xl border border-white/5">
                          <h4 className="text-zinc-200 font-bold mb-2 flex items-center gap-2">
                             <Clock className="w-4 h-4 text-amber-500"/> 1. Onarım Süresi
                          </h4>
                          <p>Yasal tamir süresi azami <strong>21 iş günüdür</strong>. Arıza tespiti ortalama 1-3 iş günü içinde tamamlanarak tarafınıza bilgi verilir.</p>
                      </div>

                      <div className="bg-zinc-950/50 p-4 rounded-xl border border-white/5">
                          <h4 className="text-zinc-200 font-bold mb-2 flex items-center gap-2">
                             <Truck className="w-4 h-4 text-amber-500"/> 2. Ücretsiz Kargo
                          </h4>
                          <p>Teknik servise gönderimler <strong>Yurtiçi Kargo</strong> ile ücretsizdir. Gönderim yaparken Panormos Tattoo <strong>Anlaşma Kodunu</strong> belirtmeniz yeterlidir.</p>
                      </div>

                      <div className="bg-zinc-950/50 p-4 rounded-xl border border-white/5">
                          <h4 className="text-zinc-200 font-bold mb-2 flex items-center gap-2">
                             <Shield className="w-4 h-4 text-amber-500"/> 3. Garanti Kapsamı
                          </h4>
                          <ul className="list-disc list-inside space-y-1 ml-1">
                              <li>Onarım yapılan parçalar <strong>3 Ay</strong> servis garantisi altındadır.</li>
                              <li>Sıvı teması (Ink Ingress), düşme, darbe ve yetkisiz müdahale garanti dışıdır.</li>
                              <li>Hijyen kurallarına uygun temizlenmemiş cihazlar işleme alınmayabilir.</li>
                          </ul>
                      </div>

                      <div className="bg-zinc-950/50 p-4 rounded-xl border border-white/5">
                          <h4 className="text-zinc-200 font-bold mb-2 flex items-center gap-2">
                             <AlertCircle className="w-4 h-4 text-amber-500"/> 4. Fiyat Onayı ve İade
                          </h4>
                          <p>Onarım teklifi onaylanmayan veya iade istenen cihazlarda <strong>kargo ücreti müşteriye aittir</strong>. 30 gün içinde teslim alınmayan cihazlardan firmamız sorumlu değildir.</p>
                      </div>

                  </div>
                  
                  <button onClick={() => setShowPolicy(false)} className="w-full mt-6 bg-zinc-100 hover:bg-white text-black font-bold py-3 rounded-xl transition-colors text-xs uppercase tracking-widest shadow-lg">Okudum, Anladım</button>
              </div>
          </div>
      )}
      
      {lightboxMedia && (
         <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4" onClick={() => setLightboxMedia(null)}>
             <button className="absolute top-4 right-4 text-white hover:text-amber-500"><X className="w-8 h-8" /></button>
             {lightboxMedia.type === 'image' ? ( <img src={lightboxMedia.url} className="max-w-[90%] max-h-[85vh] object-contain shadow-2xl rounded-lg" /> ) : ( <video src={lightboxMedia.url} controls autoPlay className="max-w-[90%] max-h-[85vh] rounded-lg shadow-2xl" /> )}
         </div>
      )}
    </div>
  );
};

export default CustomerDashboard;
