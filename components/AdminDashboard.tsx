
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ServiceRequest, ServiceNote, ProfileWithStats, BrokenStockItem } from '../types';
import { 
  Lock, Search, RefreshCw, X, Calendar, Phone, Mail, 
  CheckCircle, Clock, History, Play, Maximize2, ChevronRight,
  Send, Tag, Users, User, LayoutList, Paperclip, Image as ImageIcon, Loader2,
  AlertTriangle, Archive, WifiOff, ShieldCheck, FileSpreadsheet, Package,
  Trash2, Box, Activity, Filter, XCircle, Plus, Info, Layers
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import AnchorLogo from './AnchorLogo';
import * as XLSX from 'xlsx';
import { sendUpdateNotificationEmail } from '../lib/email';

type TabType = 'requests' | 'crm' | 'stock';
type RequestFilter = 'pending' | 'resolved' | 'rejected' | 'all';

const AdminDashboard: React.FC = () => {
  const { profile, session, loading: authLoading } = useAuth();
  const isMounted = useRef(true);

  // View State
  const [activeTab, setActiveTab] = useState<TabType>('requests');
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data State
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithStats[]>([]);
  const [stockItems, setStockItems] = useState<BrokenStockItem[]>([]);
  
  // Loading & Error States
  const [isLoadingData, setIsLoadingData] = useState(true); 
  const [isRefreshing, setIsRefreshing] = useState(false); 

  // Detail Modal State (Requests)
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [notes, setNotes] = useState<ServiceNote[]>([]);
  
  // Reject Request State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Note Form State
  const [newNote, setNewNote] = useState('');
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [isSendingNote, setIsSendingNote] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Lightbox State
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);

  // Robust Stock Form State
  const [newStock, setNewStock] = useState<Partial<BrokenStockItem>>({
      brand: '', 
      model: '', 
      quantity: 1, 
      cosmetic_condition: 'Sıfır Ayarında', 
      failure_reason: 'Diğer', 
      missing_parts: '', 
      notes: '' 
  });

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const fetchData = useCallback(async (forceSilent = false) => {
    if (!profile) return;
    
    if (forceSilent) setIsRefreshing(true);
    else setIsLoadingData(true);

    try {
      if (activeTab === 'requests') {
          const { data, error } = await supabase.from('service_requests').select('*').order('created_at', { ascending: false });
          if (error) throw error;
          if (isMounted.current) setRequests(data as ServiceRequest[] || []);
      } else if (activeTab === 'crm') {
          const { data: profilesData, error: pError } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
          const { data: reqsData } = await supabase.from('service_requests').select('user_id');
          if (pError) throw pError;
          
          const statsMap: Record<string, number> = {};
          (reqsData || []).forEach(r => { if(r.user_id) statsMap[r.user_id] = (statsMap[r.user_id] || 0) + 1; });

          const enriched = (profilesData || []).map(p => ({
              ...p,
              full_name: p.full_name || 'İsimsiz',
              request_count: statsMap[p.id] || 0
          }));
          if (isMounted.current) setProfiles(enriched as ProfileWithStats[]);
      } else if (activeTab === 'stock') {
          const { data, error } = await supabase.from('broken_stock').select('*').order('created_at', { ascending: false });
          if (error) throw error;
          if (isMounted.current) setStockItems(data as BrokenStockItem[] || []);
      }
    } catch (err: any) {
      console.error("Fetch error:", err);
      toast.error("Veriler yüklenemedi.");
    } finally {
      if (isMounted.current) {
          setIsLoadingData(false);
          setIsRefreshing(false);
      }
    }
  }, [profile, activeTab]);

  useEffect(() => {
    if (!authLoading && profile?.role === 'admin') {
      fetchData();
    }
  }, [profile, activeTab, authLoading, fetchData]);

  const fetchNotes = async (requestId: number) => {
    try {
      const { data, error } = await supabase
        .from('service_notes')
        .select('*, author:profiles(role, full_name)')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true }); 
      if (error) throw error;
      if (isMounted.current) setNotes(data as ServiceNote[] || []);
    } catch (e) {
      console.error("Notes error:", e);
    }
  };

  const handleExportExcel = () => {
      if (requests.length === 0) return toast.error("Veri yok.");
      const data = requests.map(req => ({
          "Müşteri": req.full_name, "Telefon": req.phone, "E-posta": req.email, "Cihaz": `${req.brand} ${req.model}`, "Durum": req.status, "Tarih": new Date(req.created_at).toLocaleDateString('tr-TR')
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rapor");
      XLSX.writeFile(wb, `Teknik_Servis_Raporu_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleOpenDetail = (req: ServiceRequest) => {
    setSelectedRequest(req);
    fetchNotes(req.id);
    document.body.style.overflow = 'hidden';
  };

  const handleCloseDetail = () => {
    setSelectedRequest(null);
    setNotes([]);
    setNewNote('');
    document.body.style.overflow = 'auto';
  };

  const toggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'resolved' : 'pending';
    try {
      await supabase.from('service_requests').update({ status: newStatus }).eq('id', id);
      const note = `Durum değiştirildi: ${newStatus === 'resolved' ? 'Çözüldü' : 'Bekliyor'}`;
      await supabase.from('service_notes').insert({ request_id: id, author_id: session?.user?.id, note });
      toast.success("Durum güncellendi.");
      fetchData(true);
      if (selectedRequest?.id === id) {
          setSelectedRequest({ ...selectedRequest, status: newStatus as any });
          fetchNotes(id);
      }
      sendUpdateNotificationEmail({
          to_email: selectedRequest?.email || '', full_name: selectedRequest?.full_name || '', brand: selectedRequest?.brand || '', model: selectedRequest?.model || '', new_status: newStatus.toUpperCase(), latest_note: note
      }).catch(console.error);
    } catch (e) { toast.error("Hata oluştu."); }
  };

  const handleRejectSubmit = async () => {
    if (!selectedRequest || !rejectionReason.trim()) return toast.error("Neden girin.");
    setIsRejecting(true);
    try {
        await supabase.from('service_requests').update({ status: 'rejected', rejection_reason: rejectionReason }).eq('id', selectedRequest.id);
        await supabase.from('service_notes').insert({ request_id: selectedRequest.id, author_id: session?.user?.id, note: `REDDEDİLDİ: ${rejectionReason}` });
        toast.success("Talep reddedildi.");
        setShowRejectModal(false);
        setRejectionReason('');
        fetchData(true);
        if (selectedRequest) setSelectedRequest({ ...selectedRequest, status: 'rejected', rejection_reason: rejectionReason });
        fetchNotes(selectedRequest.id);
    } catch (e) { toast.error("İşlem başarısız."); } finally { setIsRejecting(false); }
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
        await supabase.from('service_notes').insert({ request_id: selectedRequest.id, author_id: session?.user?.id, note: newNote.trim(), media_url: mediaUrl, media_type: mediaType });
        setNewNote(''); setNoteFile(null);
        fetchNotes(selectedRequest.id);
        toast.success("Not eklendi.");
    } catch (e) { toast.error("Hata oluştu."); } finally { setIsSendingNote(false); }
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStock.brand || !newStock.model) return toast.error("Lütfen marka ve model girin.");

    try {
      const { error } = await supabase
        .from('broken_stock')
        .insert([{
          brand: newStock.brand,
          model: newStock.model,
          quantity: newStock.quantity,
          cosmetic_condition: newStock.cosmetic_condition,
          failure_reason: newStock.failure_reason,
          missing_parts: newStock.missing_parts,
          notes: newStock.notes,
          status: 'waiting'
        }]);

      if (error) throw error;

      toast.success("Envanter kaydı eklendi.");
      setNewStock({
        brand: '', model: '', quantity: 1, 
        cosmetic_condition: 'Sıfır Ayarında', 
        failure_reason: 'Diğer', 
        missing_parts: '', notes: '' 
      });
      fetchData(true);
    } catch (err: any) {
      toast.error("Hata oluştu: " + err.message);
    }
  };

  const filteredRequests = requests.filter(req => {
    const s = searchTerm.toLowerCase();
    const match = (req.full_name || '').toLowerCase().includes(s) || (req.brand || '').toLowerCase().includes(s) || (req.model || '').toLowerCase().includes(s);
    return match && (requestFilter === 'all' ? true : req.status === requestFilter);
  });

  const filteredStock = stockItems.filter(item => {
    const s = searchTerm.toLowerCase();
    return (item.brand || '').toLowerCase().includes(s) || (item.model || '').toLowerCase().includes(s);
  });

  const StatusBadge = ({ status, large = false }: { status: string, large?: boolean }) => {
    let classes = '';
    switch(status) {
        case 'resolved': classes = 'bg-green-500/10 text-green-400 border-green-500/20'; break;
        case 'rejected': classes = 'bg-red-500/10 text-red-400 border-red-500/20'; break;
        default: classes = 'bg-amber-500/10 text-amber-400 border-amber-500/20'; break;
    }
    return <span className={`inline-flex items-center gap-1 font-bold border rounded-full px-3 py-1 ${large ? 'text-xs' : 'text-[10px]'} ${classes}`}>{status.toUpperCase()}</span>;
  };

  if (profile?.role !== 'admin') return <div className="p-20 text-center text-zinc-500"><Lock className="mx-auto mb-4 w-10 h-10" /> Yetkisiz Erişim</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
      {/* HEADER CONTROLS */}
      <div className="flex flex-col gap-6 mb-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
           <h2 className="text-2xl md:text-3xl font-serif font-bold text-zinc-100 flex items-center gap-3">
             <AnchorLogo className="w-8 h-8" /> Yönetim Paneli
           </h2>
           <div className="flex items-center gap-2 w-full md:w-auto">
              <button onClick={() => fetchData(false)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-zinc-800/50 hover:bg-zinc-800 text-sm px-6 py-3 rounded-xl text-zinc-300 border border-white/5">
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Yenile
              </button>
           </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
           <div className="glass-panel p-1 rounded-2xl flex overflow-x-auto no-scrollbar bg-black/40">
              <button onClick={() => setActiveTab('requests')} className={`flex-1 px-6 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'requests' ? 'bg-zinc-800 text-amber-500 shadow-xl' : 'text-zinc-500 hover:text-zinc-300'}`}>
                 <LayoutList className="w-4 h-4 inline mr-2" /> Talepler
              </button>
              <button onClick={() => setActiveTab('crm')} className={`flex-1 px-6 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'crm' ? 'bg-zinc-800 text-amber-500 shadow-xl' : 'text-zinc-500 hover:text-zinc-300'}`}>
                 <Users className="w-4 h-4 inline mr-2" /> Müşteriler
              </button>
              <button onClick={() => setActiveTab('stock')} className={`flex-1 px-6 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'stock' ? 'bg-zinc-800 text-amber-500 shadow-xl' : 'text-zinc-500 hover:text-zinc-300'}`}>
                 <Package className="w-4 h-4 inline mr-2" /> Envanter
              </button>
           </div>

           <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input type="text" placeholder="Arama yapın..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full h-full bg-zinc-900/50 border border-zinc-800 rounded-xl pl-12 pr-4 py-4 text-zinc-100 focus:border-amber-500/30 outline-none transition-all" />
           </div>

           <div className="flex gap-2">
              {activeTab === 'requests' && (
                  <select value={requestFilter} onChange={(e) => setRequestFilter(e.target.value as RequestFilter)} className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-4 py-3 rounded-xl outline-none appearance-none cursor-pointer hover:border-amber-500/20">
                      <option value="pending">BEKLEYEN</option>
                      <option value="resolved">ÇÖZÜLEN</option>
                      <option value="rejected">REDDEDİLEN</option>
                      <option value="all">TÜMÜ</option>
                  </select>
              )}
              <button onClick={handleExportExcel} className="p-3 bg-green-900/20 text-green-400 border border-green-500/20 rounded-xl hover:bg-green-500/10"><FileSpreadsheet className="w-6 h-6" /></button>
           </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="space-y-4">
         {activeTab === 'requests' && (
             <div className="grid grid-cols-1 gap-4">
                {isLoadingData ? <div className="py-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-amber-500" /></div> : filteredRequests.length === 0 ? <div className="py-20 text-center text-zinc-600">Kayıt bulunamadı.</div> : (
                   filteredRequests.map(req => (
                      <div key={req.id} onClick={() => handleOpenDetail(req)} className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-zinc-800/40 cursor-pointer border-white/5 group transition-all active:scale-[0.99]">
                         <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                               <StatusBadge status={req.status} />
                               <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight">{new Date(req.created_at).toLocaleDateString('tr-TR')}</span>
                            </div>
                            <h3 className="font-bold text-zinc-100 text-lg group-hover:text-amber-500 transition-colors truncate">{req.full_name}</h3>
                            <p className="text-zinc-500 text-sm truncate">{req.brand} {req.model}</p>
                         </div>
                         <div className="flex items-center gap-4 w-full sm:w-auto justify-between border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                            <div className="flex -space-x-3 overflow-hidden">
                                {req.media_urls?.slice(0, 3).map((m, i) => (
                                    <div key={i} className="w-10 h-10 rounded-full border-2 border-zinc-900 bg-zinc-800 overflow-hidden shadow-lg shadow-black/50">
                                        <img src={m.url} className="w-full h-full object-cover" alt="" />
                                    </div>
                                ))}
                            </div>
                            <ChevronRight className="w-6 h-6 text-zinc-700 group-hover:text-amber-500" />
                         </div>
                      </div>
                   ))
                )}
             </div>
         )}

         {activeTab === 'crm' && (
             <div className="glass-panel rounded-2xl overflow-hidden border-white/5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-900/80 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5">
                            <tr>
                                <th className="p-6">Müşteri</th>
                                <th className="p-6">İletişim</th>
                                <th className="p-6 text-center">Talep Sayısı</th>
                                <th className="p-6">Son Kayıt</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {profiles.map(p => (
                                <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                                    <td className="p-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-amber-500">
                                                <User className="w-5 h-5" />
                                            </div>
                                            <span className="font-bold text-zinc-200">{p.full_name}</span>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex flex-col">
                                            <span className="text-zinc-400 font-medium">{p.email}</span>
                                            <span className="text-zinc-600 text-[10px]">{p.phone}</span>
                                        </div>
                                    </td>
                                    <td className="p-6 text-center font-mono font-bold text-amber-500">{p.request_count}</td>
                                    <td className="p-6 text-zinc-500 text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString('tr-TR') : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </div>
         )}

         {activeTab === 'stock' && (
             <div className="space-y-8">
                <div className="glass-panel p-6 md:p-8 rounded-3xl bg-zinc-900/40 border-dashed border-zinc-800 animate-in fade-in zoom-in-95">
                   <h3 className="text-sm font-bold text-zinc-100 mb-6 flex items-center gap-3">
                     <div className="p-2 bg-amber-500/10 rounded-lg"><Plus className="w-4 h-4 text-amber-500" /></div>
                     Yeni Envanter Kaydı
                   </h3>
                   <form onSubmit={handleAddStock} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest ml-1">Marka</label>
                        <input value={newStock.brand} onChange={e => setNewStock({...newStock, brand: e.target.value})} placeholder="Örn: Cheyenne" className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-amber-500/50 transition-all text-zinc-200" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest ml-1">Model</label>
                        <input value={newStock.model} onChange={e => setNewStock({...newStock, model: e.target.value})} placeholder="Örn: Sol Nova" className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-amber-500/50 transition-all text-zinc-200" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest ml-1">Miktar</label>
                        <input type="number" min="1" value={newStock.quantity} onChange={e => setNewStock({...newStock, quantity: parseInt(e.target.value)})} placeholder="Adet" className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-amber-500/50 transition-all text-zinc-200" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest ml-1">Kozmetik Durum</label>
                        <select value={newStock.cosmetic_condition} onChange={e => setNewStock({...newStock, cosmetic_condition: e.target.value})} className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-amber-500/50 transition-all text-zinc-200">
                            <option value="Sıfır Ayarında">Sıfır Ayarında</option>
                            <option value="İyi">İyi</option>
                            <option value="Yıpranmış">Yıpranmış</option>
                            <option value="Parçalık">Parçalık</option>
                        </select>
                      </div>
                      <div className="lg:col-span-2 space-y-2">
                        <label className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest ml-1">Eksik Parçalar</label>
                        <input value={newStock.missing_parts} onChange={e => setNewStock({...newStock, missing_parts: e.target.value})} placeholder="Örn: Kablo eksik" className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-amber-500/50 transition-all text-zinc-200" />
                      </div>
                      <div className="lg:col-span-2 space-y-2">
                        <label className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest ml-1">Notlar</label>
                        <input value={newStock.notes} onChange={e => setNewStock({...newStock, notes: e.target.value})} placeholder="Ekstra bilgi..." className="w-full bg-black/40 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-amber-500/50 transition-all text-zinc-200" />
                      </div>
                      <div className="lg:col-span-4 pt-2">
                        <button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold py-4 rounded-xl hover:shadow-lg hover:shadow-amber-500/10 transition-all flex items-center justify-center gap-2">
                          <Package className="w-4 h-4" /> ENVANTERE EKLE
                        </button>
                      </div>
                   </form>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredStock.map(item => (
                        <div key={item.id} className="glass-panel p-5 rounded-2xl border-white/5 hover:border-amber-500/30 transition-all group relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="font-bold text-zinc-100 truncate pr-2 group-hover:text-amber-500 transition-colors">{item.brand}</h4>
                                    <p className="text-zinc-500 text-xs">{item.model}</p>
                                </div>
                                <span className="bg-zinc-800 text-[10px] px-2 py-1 rounded text-zinc-400 border border-white/5 uppercase font-bold">{item.status}</span>
                            </div>
                            <div className="space-y-3 mb-6 bg-black/20 p-3 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
                                  <span>Miktar</span>
                                  <strong className="text-zinc-200 text-xs">{item.quantity}</strong>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
                                  <span>Durum</span>
                                  <strong className="text-zinc-200 text-xs">{item.cosmetic_condition}</strong>
                                </div>
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t border-white/5">
                                <span className="text-[9px] text-zinc-600 font-mono">{new Date(item.created_at).toLocaleDateString('tr-TR')}</span>
                                <button onClick={() => toast.success("Geliştirme aşamasında...")} className="text-amber-500 text-xs font-bold hover:underline">DÜZENLE</button>
                            </div>
                        </div>
                    ))}
                </div>
             </div>
         )}
      </div>

      {/* REQUEST DETAIL MODAL - ULTIMATE MOBILE FIX */}
      {selectedRequest && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-xl">
          {/* Close button at top-right of the whole screen to ensure accessibility */}
          <button 
            onClick={handleCloseDetail} 
            className="fixed top-4 right-4 z-[10001] p-4 bg-zinc-800 hover:bg-red-500/20 hover:text-red-500 rounded-full text-zinc-100 border border-white/10 shadow-2xl active:scale-90 transition-all"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="w-full h-full md:max-w-6xl md:h-[95dvh] md:rounded-3xl relative flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* PINNED HEADER - REDESIGNED FOR GUARANTEED VISIBILITY */}
            <div className="shrink-0 bg-zinc-900 border-b border-white/10 p-6 md:p-10 pt-12 md:pt-10">
               <div className="flex flex-col gap-6">
                  {/* Row 1: Name and Status */}
                  <div className="flex items-start justify-between gap-4">
                     <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                           <h3 className="text-2xl md:text-4xl font-serif font-bold text-zinc-100 tracking-tight leading-none break-words">
                             {selectedRequest.full_name}
                           </h3>
                           <StatusBadge status={selectedRequest.status} large />
                        </div>
                        <p className="text-[10px] md:text-xs text-zinc-500 font-bold uppercase tracking-[0.3em]">TEKNİK SERVİS DOSYASI</p>
                     </div>
                  </div>

                  {/* Row 2: Info Grid - Stacked on Mobile for Space */}
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 md:gap-4">
                     <div className="flex items-center gap-3 bg-black/60 px-4 py-3 rounded-2xl border border-white/10 shadow-xl min-w-0">
                        <Mail className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-[11px] md:text-sm text-zinc-100 font-bold truncate">{selectedRequest.email}</span>
                     </div>
                     <div className="flex items-center gap-3 bg-black/60 px-4 py-3 rounded-2xl border border-white/10 shadow-xl min-w-0">
                        <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-[11px] md:text-sm text-zinc-100 font-bold">{selectedRequest.phone}</span>
                     </div>
                     <div className="flex items-center gap-3 bg-black/60 px-4 py-3 rounded-2xl border border-white/10 shadow-xl min-w-0">
                        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-[11px] md:text-sm text-zinc-100 font-bold truncate">{selectedRequest.category}</span>
                     </div>
                  </div>
               </div>
            </div>

            {/* SCROLLABLE BODY */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
               <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pb-20">
                  {/* LEFT: WORKFLOW & NOTES */}
                  <div className="lg:col-span-5 flex flex-col gap-8 order-2 lg:order-1">
                     <div className="glass-panel rounded-3xl p-6 bg-zinc-900/40 border-white/5 flex flex-col min-h-[500px]">
                        <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-[0.2em] mb-8 flex items-center gap-2 pb-5 border-b border-white/5">
                           <History className="w-4 h-4" /> Servis İş Akışı
                        </h4>
                        
                        <div className="flex-1 overflow-y-auto pr-2 space-y-8 mb-8 custom-scrollbar">
                           <div className="relative pl-6 pb-6 border-l border-zinc-800 last:border-0">
                              <div className="absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-zinc-600 ring-4 ring-zinc-950"></div>
                              <div className="text-[10px] text-zinc-500 font-mono mb-2 uppercase tracking-tight">{new Date(selectedRequest.created_at).toLocaleString('tr-TR')}</div>
                              <div className="text-sm text-zinc-400 bg-zinc-900/50 p-5 rounded-2xl border border-white/5 italic">Müşteri talebi başarıyla oluşturuldu.</div>
                           </div>
                           
                           {notes.map(note => (
                              <div key={note.id} className="relative pl-6 pb-6 border-l border-zinc-800 last:border-0">
                                 <div className="absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.5)]"></div>
                                 <div className="flex items-center gap-2 mb-2">
                                    <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-tight">{new Date(note.created_at).toLocaleString('tr-TR')}</div>
                                    <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${note.author?.role === 'admin' ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 border border-white/5'}`}>{note.author?.role === 'admin' ? 'TEKNİK EKİP' : 'MÜŞTERİ'}</span>
                                 </div>
                                 <div className="text-sm text-zinc-200 bg-zinc-900 p-5 rounded-2xl border border-white/5 shadow-lg">
                                    <p className="whitespace-pre-wrap leading-relaxed">{note.note}</p>
                                    {note.media_url && (
                                       <div className="mt-5 rounded-2xl overflow-hidden border border-zinc-700 bg-black/50 cursor-pointer group" onClick={() => setLightboxMedia({url: note.media_url!, type: note.media_type!})}>
                                          {note.media_type === 'image' ? <img src={note.media_url} className="w-full h-40 object-cover group-hover:scale-110 transition-transform duration-700" alt="" /> : <div className="w-full h-40 flex items-center justify-center bg-zinc-800"><Play className="w-12 h-12 text-amber-500" /></div>}
                                       </div>
                                    )}
                                 </div>
                              </div>
                           ))}
                        </div>

                        {/* NOTE INPUT */}
                        <form onSubmit={handleAddNote} className="flex items-center gap-3 pt-6 border-t border-white/5 mt-auto">
                           <input type="file" ref={fileInputRef} className="hidden" onChange={e => setNoteFile(e.target.files ? e.target.files[0] : null)} />
                           <button type="button" onClick={() => fileInputRef.current?.click()} className={`p-5 rounded-2xl border border-zinc-800 transition-all ${noteFile ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'bg-zinc-950 text-zinc-600 hover:text-amber-500'}`}><Paperclip className="w-6 h-6" /></button>
                           <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Bir not veya işlem detayı girin..." className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm outline-none focus:border-amber-500/50 text-zinc-100 transition-all shadow-inner" />
                           <button type="submit" className="p-5 bg-amber-500 rounded-2xl text-black hover:bg-amber-400 transition-all active:scale-90 shadow-xl shadow-amber-900/30"><Send className="w-6 h-6" /></button>
                        </form>
                     </div>
                  </div>

                  {/* RIGHT: DEVICE DETAILS & MEDIA */}
                  <div className="lg:col-span-7 space-y-10 order-1 lg:order-2">
                     <div className="glass-panel p-6 md:p-10 rounded-3xl bg-zinc-900/20 border-white/5 shadow-inner space-y-10">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           <div className="bg-zinc-950/70 p-5 rounded-2xl border border-white/5"><span className="block text-[9px] text-zinc-500 font-bold uppercase mb-2 tracking-widest">Marka</span><strong className="text-zinc-100 text-base md:text-lg">{selectedRequest.brand}</strong></div>
                           <div className="bg-zinc-950/70 p-5 rounded-2xl border border-white/5"><span className="block text-[9px] text-zinc-500 font-bold uppercase mb-2 tracking-widest">Model</span><strong className="text-zinc-100 text-base md:text-lg">{selectedRequest.model}</strong></div>
                           <div className="bg-zinc-950/70 p-5 rounded-2xl border border-white/5"><span className="block text-[9px] text-zinc-500 font-bold uppercase mb-2 tracking-widest">Kategori</span><strong className="text-amber-500 text-base md:text-lg">{selectedRequest.category}</strong></div>
                           <div className="bg-zinc-950/70 p-5 rounded-2xl border border-white/5"><span className="block text-[9px] text-zinc-500 font-bold uppercase mb-2 tracking-widest">Alım Tarihi</span><strong className="text-zinc-100 font-mono text-sm">{selectedRequest.product_date}</strong></div>
                        </div>

                        <div>
                           <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Müşteri Arıza Beyanı</h4>
                           <div className="bg-zinc-950/90 p-8 rounded-3xl border border-white/5 text-zinc-200 text-sm md:text-base leading-relaxed italic whitespace-pre-wrap">"{selectedRequest.description}"</div>
                        </div>

                        {selectedRequest.status === 'rejected' && (
                           <div className="bg-red-500/5 p-8 rounded-3xl border border-red-500/20 text-red-200 text-sm md:text-base leading-relaxed animate-pulse">
                             <h4 className="text-[10px] font-bold uppercase mb-3 flex items-center gap-2 text-red-400 tracking-[0.2em]"><AlertTriangle className="w-4 h-4" /> RED NEDENİ</h4>
                             {selectedRequest.rejection_reason}
                           </div>
                        )}
                     </div>

                     {/* ACTIONS */}
                     <div className="flex flex-col sm:flex-row gap-5">
                        <button onClick={() => toggleStatus(selectedRequest.id, selectedRequest.status)} className={`flex-1 flex items-center justify-center gap-4 py-5 md:py-6 rounded-2xl font-bold text-base transition-all shadow-2xl active:scale-[0.98] ${selectedRequest.status === 'pending' ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/30' : 'bg-amber-600 hover:bg-amber-500 text-black shadow-amber-900/30'}`}>
                           {selectedRequest.status === 'pending' ? <CheckCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                           {selectedRequest.status === 'pending' ? 'ONARIMI TAMAMLA' : 'DOSYAYI AÇ'}
                        </button>
                        {selectedRequest.status !== 'rejected' && (
                           <button onClick={() => setShowRejectModal(true)} className="flex-1 flex items-center justify-center gap-4 py-5 md:py-6 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"><XCircle className="w-6 h-6" /> TALEBİ REDDET</button>
                        )}
                     </div>

                     {/* MEDIA CLUSTER */}
                     <div>
                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2"><ImageIcon className="w-5 h-5" /> Dosya Ekleri ({selectedRequest.media_urls?.length || 0})</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6">
                           {selectedRequest.media_urls?.map((m, i) => (
                              <div key={i} onClick={() => setLightboxMedia({url: m.url, type: m.type})} className="aspect-square bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden relative group cursor-pointer hover:border-amber-500/60 transition-all shadow-xl">
                                 {m.type === 'image' ? <img src={m.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt="" /> : <div className="w-full h-full flex items-center justify-center bg-zinc-800"><Play className="w-12 h-12 text-amber-500" /></div>}
                                 <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]"><Maximize2 className="w-10 h-10 text-white" /></div>
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

      {/* REJECT MODAL */}
      {showRejectModal && (
         <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/98 backdrop-blur-3xl">
             <div className="glass-panel p-10 rounded-[2.5rem] w-full max-w-xl border-red-500/30 animate-in zoom-in-95 duration-300 shadow-3xl">
                <div className="flex items-center gap-5 mb-8 pb-6 border-b border-white/5">
                   <div className="p-4 bg-red-500/20 rounded-2xl text-red-500 shadow-xl shadow-red-950/20"><XCircle className="w-8 h-8" /></div>
                   <h3 className="text-2xl font-serif font-bold text-zinc-100">Red Gerekçesi</h3>
                </div>
                <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Müşterinin e-posta bildiriminde göreceği açıklama..." className="w-full h-48 bg-black/60 border border-zinc-800 rounded-3xl p-6 text-zinc-100 text-sm md:text-base outline-none focus:border-red-500/60 mb-8 transition-all shadow-inner" />
                <div className="flex gap-5">
                   <button onClick={() => setShowRejectModal(false)} className="flex-1 py-5 bg-zinc-900 text-zinc-500 rounded-2xl font-bold hover:bg-zinc-800 transition-all text-sm tracking-widest">VAZGEÇ</button>
                   <button onClick={handleRejectSubmit} className="flex-1 py-5 bg-red-600 text-white rounded-2xl font-bold shadow-2xl shadow-red-900/50 hover:bg-red-500 transition-all text-sm tracking-widest">KESİNLEŞTİR</button>
                </div>
             </div>
         </div>
      )}

      {/* LIGHTBOX */}
      {lightboxMedia && (
        <div className="fixed inset-0 z-[10100] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-6 md:p-12 animate-in fade-in duration-300" onClick={() => setLightboxMedia(null)}>
           <button onClick={() => setLightboxMedia(null)} className="absolute top-10 right-10 p-5 bg-zinc-800/90 hover:bg-red-600 text-white rounded-full z-[10110] active:scale-75 transition-all shadow-2xl border border-white/10"><X className="w-8 h-8" /></button>
           <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                {lightboxMedia.type === 'image' ? <img src={lightboxMedia.url} className="max-w-full max-h-[85dvh] rounded-[2rem] object-contain shadow-[0_0_100px_rgba(0,0,0,1)] border border-white/5" alt="" /> : <video src={lightboxMedia.url} controls autoPlay className="max-w-full max-h-[85dvh] rounded-[2rem] shadow-[0_0_100px_rgba(0,0,0,1)]" />}
           </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
