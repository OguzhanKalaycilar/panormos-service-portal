import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ServiceRequest, ServiceNote, ProfileWithStats, BrokenStockItem } from '../types';
import { 
  Lock, Search, RefreshCw, X, Calendar, Phone, Mail, 
  CheckCircle, Clock, History, Play, Maximize2, ChevronRight,
  Send, Tag, Users, User, LayoutList, Paperclip, Image as ImageIcon, Loader2,
  AlertTriangle, Archive, WifiOff, ShieldCheck, FileSpreadsheet, Package,
  Trash2, Edit, Save, Plus, PenTool, Hammer, Box, Activity, Filter, Eye, XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import AnchorLogo from './AnchorLogo';
import * as XLSX from 'xlsx';
import { sendUpdateNotificationEmail } from '../lib/email';

type TabType = 'requests' | 'crm' | 'stock';
type RequestFilter = 'pending' | 'resolved' | 'rejected' | 'all';
type StockStatusFilter = 'all' | 'waiting' | 'in_repair' | 'ready' | 'scrapped';

const AdminDashboard: React.FC = () => {
  const { profile, session, loading: authLoading } = useAuth();
  
  // Mounted Ref
  const isMounted = useRef(true);

  // View State
  const [activeTab, setActiveTab] = useState<TabType>('requests');
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('pending');
  const [stockStatusFilter, setStockStatusFilter] = useState<StockStatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data State
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithStats[]>([]);
  const [stockItems, setStockItems] = useState<BrokenStockItem[]>([]);
  
  // Loading & Error States
  const [isLoadingData, setIsLoadingData] = useState(true); 
  const [isRefreshing, setIsRefreshing] = useState(false); 
  const [showSlowLoading, setShowSlowLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Detail Modal State (Requests)
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [notes, setNotes] = useState<ServiceNote[]>([]);
  
  // Reject Request State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Stock Detail Modal State
  const [selectedStock, setSelectedStock] = useState<BrokenStockItem | null>(null);
  const [editStockData, setEditStockData] = useState<Partial<BrokenStockItem>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Note Form State
  const [newNote, setNewNote] = useState('');
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [isSendingNote, setIsSendingNote] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Lightbox State
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);

  // Stock Form State
  const [newStock, setNewStock] = useState<Partial<BrokenStockItem>>({
      brand: '', model: '', quantity: 1, 
      cosmetic_condition: 'Sıfır Ayarında', 
      failure_reason: 'Diğer', 
      missing_parts: '', notes: '' 
  });

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Handle ESC key for modals and overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (showRejectModal) {
                setShowRejectModal(false);
                return;
            }
            if (showDeleteConfirm) {
                setShowDeleteConfirm(false);
                return;
            }
            if (lightboxMedia) {
                setLightboxMedia(null);
                return;
            }
            if (selectedStock) {
                handleCloseStockDetail();
                return;
            }
            if (selectedRequest) {
                handleCloseDetail();
                return;
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxMedia, selectedStock, selectedRequest, showDeleteConfirm, showRejectModal]);

  // --- WINDOW FOCUS & VISIBILITY HANDLER ---
  useEffect(() => {
    const handleRevalidation = () => {
      if (document.visibilityState === 'visible' && profile?.role === 'admin' && isMounted.current) {
        fetchData(true); // true = silent/background refresh
      }
    };
    window.addEventListener('focus', handleRevalidation);
    window.addEventListener('visibilitychange', handleRevalidation);
    return () => {
      window.removeEventListener('focus', handleRevalidation);
      window.removeEventListener('visibilitychange', handleRevalidation);
    };
  }, [profile, activeTab]);

  useEffect(() => {
    if (!authLoading && profile?.role === 'admin') {
      fetchData();
    }
  }, [profile, activeTab, authLoading]);

  // Monitor loading time
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isLoadingData) {
        timer = setTimeout(() => setShowSlowLoading(true), 4000);
    } else {
        setShowSlowLoading(false);
    }
    return () => clearTimeout(timer);
  }, [isLoadingData]);

  const fetchData = useCallback(async (forceSilent = false) => {
    if (!profile) return;
    
    let hasData = false;
    if (activeTab === 'requests') hasData = requests.length > 0;
    if (activeTab === 'crm') hasData = profiles.length > 0;
    if (activeTab === 'stock') hasData = stockItems.length > 0;

    const isBackground = hasData || forceSilent;

    if (isBackground) {
        if (isMounted.current) setIsRefreshing(true);
    } else {
        if (isMounted.current) setIsLoadingData(true);
    }

    if (isMounted.current) setDataError(null);
    
    try {
      if (activeTab === 'requests') {
          await fetchRequestsSafe();
      } else if (activeTab === 'crm') {
          await fetchCRMSafe();
      } else if (activeTab === 'stock') {
          await fetchStockSafe();
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('signal is aborted')) {
          console.warn("Dashboard fetch aborted safely");
          return;
      }
      console.error("Unexpected Dashboard Error:", err);
      if (isMounted.current) {
          if (!isBackground) {
              setDataError("Veri yüklenirken bir sorun oluştu.");
          } else {
              toast.error("Veriler güncellenemedi (Arka plan)", { id: 'bg-error' }); 
          }
      }
    } finally {
      if (isMounted.current) {
          setIsLoadingData(false);
          setIsRefreshing(false);
      }
    }
  }, [profile, activeTab, requests.length, profiles.length, stockItems.length]);

  const fetchRequestsSafe = async () => {
    try {
        const { data, error } = await supabase
          .from('service_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (isMounted.current) setRequests(data as ServiceRequest[] || []);
    } catch (error: any) {
        throw error;
    }
  };

  const fetchStockSafe = async () => {
     try {
         const { data, error } = await supabase
            .from('broken_stock')
            .select('*')
            .order('created_at', { ascending: false });
        
         if (error) throw error;
         if (isMounted.current) setStockItems(data as BrokenStockItem[] || []);
     } catch (error: any) {
         if (error.code === '42P01') { 
             console.warn("Broken Stock table missing");
             return; 
         }
         throw error;
     }
  };

  const fetchCRMSafe = async () => {
    const [profilesResult, requestsResult] = await Promise.allSettled([
        supabase
            .from('profiles')
            .select('id, full_name, email, phone, role, created_at')
            .order('created_at', { ascending: false }),
        supabase.from('service_requests').select('user_id')
    ]);

    let fetchedProfiles: any[] = [];
    let fetchedRequests: any[] = [];

    if (profilesResult.status === 'fulfilled') {
        const { data, error } = profilesResult.value;
        if (error) throw error;
        fetchedProfiles = data || [];
    } else {
        throw profilesResult.reason;
    }

    if (requestsResult.status === 'fulfilled') {
        const { data, error } = requestsResult.value;
        if (!error && data) {
            fetchedRequests = data;
        }
    }

    const statsMap: Record<string, number> = {};
    fetchedRequests.forEach(r => {
        if(r.user_id) statsMap[r.user_id] = (statsMap[r.user_id] || 0) + 1;
    });

    const enrichedProfiles: ProfileWithStats[] = fetchedProfiles.map((p) => ({
        ...p,
        full_name: p.full_name || 'İsimsiz Müşteri',
        email: p.email || '-',
        phone: p.phone || '-',
        created_at: p.created_at, 
        request_count: statsMap[p.id] || 0
    }));

    if (isMounted.current) setProfiles(enrichedProfiles);
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
      if (e.name === 'AbortError') return;
      try {
          const { data, error } = await supabase
          .from('service_notes')
          .select('*')
          .eq('request_id', requestId)
          .order('created_at', { ascending: true });
          
          if (error) throw error;
          if (isMounted.current) setNotes(data as ServiceNote[] || []);

      } catch (e2: any) {
         // Fallback
      }
    }
  };

  const handleExportExcel = () => {
      if (requests.length === 0) {
          toast.error("Dışa aktarılacak veri yok.");
          return;
      }
      try {
          const excelData = requests.map(req => ({
              "Müşteri Adı": req.full_name,
              "Telefon": req.phone,
              "E-posta": req.email,
              "Marka": req.brand,
              "Model": req.model,
              "Kategori": req.category,
              "Alım Tarihi": req.product_date,
              "Durum": req.status === 'resolved' ? 'Çözüldü' : (req.status === 'rejected' ? 'Reddedildi' : 'Bekliyor'),
              "Red Nedeni": req.rejection_reason || '-',
              "Kayıt Tarihi": new Date(req.created_at).toLocaleDateString('tr-TR'),
              "Sorun Açıklaması": req.description
          }));
          const worksheet = XLSX.utils.json_to_sheet(excelData);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, "Teknik Servis Raporu");
          XLSX.writeFile(workbook, `Panormos_Servis_Raporu_${new Date().toISOString().slice(0,10)}.xlsx`);
          toast.success("Rapor başarıyla indirildi.");
      } catch (e: any) {
          toast.error("Excel oluşturulurken bir hata oluştu.");
      }
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
    setNoteFile(null);
    document.body.style.overflow = 'auto';
  };

  const toggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'resolved' : 'pending';
    const noteText = `Durum değişikliği: "${newStatus === 'resolved' ? 'Çözüldü' : 'Beklemede'}"`;
    
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus as 'pending' | 'resolved' } : r));
    if (selectedRequest && selectedRequest.id === id) {
        setSelectedRequest({ ...selectedRequest, status: newStatus as 'pending' | 'resolved' });
    }
    try {
      await supabase.from('service_requests').update({ status: newStatus }).eq('id', id);
      toast.success(newStatus === 'resolved' ? 'Talep çözüldü!' : 'Talep beklemeye alındı.');
      await supabase.from('service_notes').insert({
        request_id: id,
        author_id: session?.user?.id,
        note: noteText
      });
      if(selectedRequest?.id === id) fetchNotes(id);

      // Email Notification
      if (selectedRequest) {
          sendUpdateNotificationEmail({
              to_email: selectedRequest.email,
              full_name: selectedRequest.full_name,
              brand: selectedRequest.brand,
              model: selectedRequest.model,
              new_status: newStatus === 'resolved' ? 'ÇÖZÜLDÜ' : 'BEKLİYOR',
              latest_note: noteText
          }).catch(err => console.error("Update email error:", err));
      }
    } catch (error) {
      toast.error('Durum güncellenemedi.');
      fetchData(true); 
    }
  };

  const handleRejectSubmit = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
        toast.error("Lütfen bir red nedeni giriniz.");
        return;
    }

    const currentRejectionReason = rejectionReason;
    setIsRejecting(true);
    try {
        const { error } = await supabase
            .from('service_requests')
            .update({ 
                status: 'rejected',
                rejection_reason: currentRejectionReason 
            })
            .eq('id', selectedRequest.id);
        
        if (error) throw error;

        await supabase.from('service_notes').insert({
            request_id: selectedRequest.id,
            author_id: session?.user?.id,
            note: `Talep, Teknik Ekip tarafından reddedildi. Sebep: ${currentRejectionReason}`
        });

        toast.success("Talep reddedildi.");
        
        // Email Notification
        sendUpdateNotificationEmail({
            to_email: selectedRequest.email,
            full_name: selectedRequest.full_name,
            brand: selectedRequest.brand,
            model: selectedRequest.model,
            new_status: 'REDDEDİLDİ',
            latest_note: currentRejectionReason
        }).catch(err => console.error("Reject email error:", err));

        setRequests(prev => prev.map(r => r.id === selectedRequest.id ? { ...r, status: 'rejected', rejection_reason: currentRejectionReason } : r));
        setSelectedRequest({ ...selectedRequest, status: 'rejected', rejection_reason: currentRejectionReason });
        setShowRejectModal(false);
        setRejectionReason('');
        fetchNotes(selectedRequest.id);
    } catch (e: any) {
        toast.error("İşlem başarısız: " + e.message);
    } finally {
        setIsRejecting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || (!newNote.trim() && !noteFile)) return;
    
    const noteToSend = newNote.trim();
    setIsSendingNote(true);
    try {
        let mediaUrl = null;
        let mediaType = null;
        if (noteFile) {
            const fileExt = noteFile.name.split('.').pop()?.toLowerCase() || 'bin';
            const filePath = `notes/${Date.now()}_${Math.random().toString(36).slice(2,9)}.${fileExt}`;
            await supabase.storage.from('service-media').upload(filePath, noteFile);
            const { data: { publicUrl } } = supabase.storage.from('service-media').getPublicUrl(filePath);
            mediaUrl = publicUrl;
            mediaType = noteFile.type.startsWith('video/') ? 'video' : 'image';
        }
        await supabase.from('service_notes').insert({
            request_id: selectedRequest.id,
            author_id: session?.user?.id,
            note: noteToSend,
            media_url: mediaUrl,
            media_type: mediaType
        });

        // Email Notification
        if (selectedRequest) {
            const statusLabel = selectedRequest.status === 'resolved' ? 'ÇÖZÜLDÜ' : (selectedRequest.status === 'rejected' ? 'REDDEDİLDİ' : 'BEKLİYOR');
            sendUpdateNotificationEmail({
                to_email: selectedRequest.email,
                full_name: selectedRequest.full_name,
                brand: selectedRequest.brand,
                model: selectedRequest.model,
                new_status: statusLabel,
                latest_note: noteToSend || (mediaType === 'image' ? 'Yeni fotoğraf eklendi.' : 'Yeni video eklendi.')
            }).catch(err => console.error("Note email error:", err));
        }

        setNewNote('');
        setNoteFile(null);
        fetchNotes(selectedRequest.id);
        toast.success('Not eklendi.');
    } catch (error: any) {
        toast.error(`Not hatası: ${error.message}`);
    } finally {
        if (isMounted.current) setIsSendingNote(false);
    }
  };

  const handleAddStock = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newStock.brand || !newStock.model) {
          toast.error("Marka ve Model zorunludur.");
          return;
      }
      
      const stockPayload = {
          brand: newStock.brand,
          model: newStock.model,
          quantity: newStock.quantity || 1,
          cosmetic_condition: newStock.cosmetic_condition || 'Sıfır Ayarında',
          failure_reason: newStock.failure_reason || 'Diğer',
          missing_parts: newStock.missing_parts || '',
          notes: newStock.notes || '',
          status: 'waiting'
      };

      try {
          const { error } = await supabase.from('broken_stock').insert(stockPayload);
          if (error) throw error;
          
          toast.success("Yeni envanter kaydı başarıyla eklendi!");
          setNewStock({ 
              brand: '', model: '', quantity: 1, 
              cosmetic_condition: 'Sıfır Ayarında', 
              failure_reason: 'Diğer', 
              missing_parts: '', notes: '' 
          });
          fetchStockSafe();
      } catch (e: any) {
          console.error("Stock Add Error:", e);
          toast.error("Ekleme hatası: " + e.message);
      }
  };

  const handleOpenStockDetail = (item: BrokenStockItem) => {
      setSelectedStock(item);
      setEditStockData(item);
      document.body.style.overflow = 'hidden';
  };

  const handleCloseStockDetail = () => {
      setSelectedStock(null);
      setEditStockData({});
      document.body.style.overflow = 'auto';
  };

  const handleUpdateStock = async () => {
      if (!selectedStock) return;
      try {
          const { error } = await supabase
            .from('broken_stock')
            .update({
                brand: editStockData.brand,
                model: editStockData.model,
                status: editStockData.status,
                quantity: editStockData.quantity,
                cosmetic_condition: editStockData.cosmetic_condition,
                failure_reason: editStockData.failure_reason,
                missing_parts: editStockData.missing_parts,
                notes: editStockData.notes
            })
            .eq('id', selectedStock.id);
          
          if (error) throw error;
          
          toast.success("Kayıt güncellendi.");
          handleCloseStockDetail();
          fetchStockSafe();
      } catch (e: any) {
          toast.error("Güncelleme hatası");
      }
  };

  const handleDeleteStock = () => {
      if(!selectedStock) return;
      setShowDeleteConfirm(true);
  };

  const executeDeleteStock = async () => {
      if(!selectedStock) return;
      try {
          const { error } = await supabase.from('broken_stock').delete().eq('id', selectedStock.id);
          if (error) throw error;
          toast.success("Kayıt başarıyla silindi.");
          setStockItems(prev => prev.filter(i => i.id !== selectedStock.id));
          setShowDeleteConfirm(false);
          handleCloseStockDetail();
      } catch (e) {
          console.error(e);
          toast.error("Silme işlemi başarısız.");
          setShowDeleteConfirm(false);
      }
  };

  const filteredRequests = requests.filter(req => {
    const s = searchTerm.toLowerCase();
    const matchesSearch = 
      (req.full_name || '').toLowerCase().includes(s) ||
      (req.phone || '').includes(s) ||
      (req.email || '').toLowerCase().includes(s);
    
    const matchesFilter = 
      requestFilter === 'all' ? true : req.status === requestFilter;

    return matchesSearch && matchesFilter;
  });

  const filteredProfiles = profiles.filter(p => {
     const s = searchTerm.toLowerCase();
     return (p.full_name || '').toLowerCase().includes(s) ||
     (p.email || '').toLowerCase().includes(s) ||
     (p.phone || '').includes(s);
  });

  const filteredStock = stockItems.filter(item => {
      const s = searchTerm.toLowerCase();
      const matchesSearch = 
        (item.brand || '').toLowerCase().includes(s) || 
        (item.model || '').toLowerCase().includes(s) ||
        (item.failure_reason || '').toLowerCase().includes(s);
      
      const matchesStatus = stockStatusFilter === 'all' ? true : item.status === stockStatusFilter;
      return matchesSearch && matchesStatus;
  });

  const StatusBadge = ({ status, large = false }: { status: string, large?: boolean }) => {
    let colorClasses = '';
    let icon = null;
    let label = '';

    switch(status) {
        case 'resolved':
            colorClasses = 'bg-green-500/10 text-green-400 border-green-500/20 shadow-green-900/10';
            icon = <CheckCircle className={large ? "w-4 h-4" : "w-3 h-3"}/>;
            label = 'ÇÖZÜLDÜ';
            break;
        case 'rejected':
            colorClasses = 'bg-red-500/10 text-red-400 border-red-500/20 shadow-red-900/10';
            icon = <XCircle className={large ? "w-4 h-4" : "w-3 h-3"}/>;
            label = 'REDDEDİLDİ';
            break;
        default:
            colorClasses = 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-amber-900/10';
            icon = <Clock className={large ? "w-4 h-4" : "w-3 h-3"}/>;
            label = 'BEKLİYOR';
    }

    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full font-bold border shadow-sm ${
        large ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs'
      } ${colorClasses}`}>
        {icon}
        {label}
      </span>
    );
  };

  const StockStatusBadge = ({ status }: { status: string }) => {
      let colorClass = "bg-zinc-800 text-zinc-400 border-zinc-700";
      let label = "Bilinmiyor";
      
      switch(status) {
          case 'waiting': 
             colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-blue-500/10"; 
             label = "BEKLİYOR";
             break;
          case 'in_repair':
             colorClass = "bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-amber-500/10";
             label = "TAMİRDE";
             break;
          case 'ready':
             colorClass = "bg-green-500/10 text-green-400 border-green-500/20 shadow-green-500/10";
             label = "HAZIR";
             break;
          case 'scrapped':
             colorClass = "bg-red-500/10 text-red-400 border-red-500/20 shadow-red-500/10";
             label = "HURDA";
             break;
      }
      return <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded shadow-sm border ${colorClass}`}>{label}</span>;
  };

  if (authLoading) return null; 
  
  if (profile?.role !== 'admin') {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-in fade-in zoom-in">
            <Lock className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-xl font-bold text-white">Yetkisiz Erişim</h2>
            <p className="text-zinc-500 mt-2">Bu sayfayı görüntüleme yetkiniz yok.</p>
        </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* --- DASHBOARD HEADER --- */}
      <div className="flex flex-col gap-8 mb-10">
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-serif font-bold text-zinc-100 flex items-center gap-3">
              <AnchorLogo className="w-8 h-8"/>
              Yönetici Paneli
            </h2>
            <p className="text-zinc-500 text-sm mt-1 ml-11">Panormos Tattoo Technical Service</p>
          </div>
          <button 
            onClick={() => fetchData(false)} 
            disabled={isLoadingData || isRefreshing}
            className="flex items-center gap-2 bg-zinc-800/50 hover:bg-zinc-800 text-sm px-5 py-2.5 rounded-xl text-zinc-300 transition-colors border border-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${(isLoadingData || isRefreshing) ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* CONTROLS */}
        <div className="glass-panel p-2 rounded-2xl flex flex-col md:flex-row gap-4 shadow-lg">
           
           <div className="flex bg-zinc-950/50 rounded-xl p-1.5 border border-zinc-800 shrink-0 overflow-x-auto">
              <button
                 onClick={() => { setActiveTab('requests'); setDataError(null); setSearchTerm(''); }}
                 className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === 'requests'
                    ? 'bg-zinc-800 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                 }`}
              >
                 <LayoutList className="w-4 h-4" /> Talepler
              </button>
              <button
                 onClick={() => { setActiveTab('crm'); setDataError(null); setSearchTerm(''); }}
                 className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === 'crm'
                    ? 'bg-zinc-800 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                 }`}
              >
                 <Users className="w-4 h-4" /> Müşteriler
              </button>
              <button
                 onClick={() => { setActiveTab('stock'); setDataError(null); setSearchTerm(''); }}
                 className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === 'stock'
                    ? 'bg-zinc-800 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                 }`}
              >
                 <Package className="w-4 h-4" /> Arızalı Stok
              </button>
           </div>

           <div className="flex gap-2 shrink-0">
               {activeTab === 'requests' && (
                   <button
                     onClick={handleExportExcel}
                     className="flex items-center gap-2 px-4 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-500/30 rounded-xl text-sm font-medium transition-all"
                     title="Excel Raporu İndir"
                   >
                      <FileSpreadsheet className="w-4 h-4" /> <span className="hidden md:inline">Rapor</span>
                   </button>
               )}

               {activeTab === 'requests' && (
                   <div className="flex bg-zinc-950/50 rounded-xl p-1.5 border border-zinc-800">
                      {(['pending', 'resolved', 'rejected', 'all'] as RequestFilter[]).map((f) => (
                        <button
                          key={f}
                          onClick={() => setRequestFilter(f)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            requestFilter === f 
                              ? (f === 'rejected' ? 'bg-red-600 text-white' : (f === 'resolved' ? 'bg-green-600 text-white' : 'bg-amber-500 text-black')) 
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {f === 'pending' && 'Bekleyen'}
                          {f === 'resolved' && 'Çözülen'}
                          {f === 'rejected' && 'Reddedilen'}
                          {f === 'all' && 'Hepsi'}
                        </button>
                      ))}
                   </div>
               )}

               {activeTab === 'stock' && (
                    <div className="relative">
                         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                             <Filter className="h-3 w-3 text-zinc-500" />
                         </div>
                         <select
                             value={stockStatusFilter}
                             onChange={(e) => setStockStatusFilter(e.target.value as StockStatusFilter)}
                             className="h-full pl-9 pr-8 bg-zinc-950/50 border border-zinc-800 text-zinc-300 text-xs rounded-xl focus:border-amber-500/30 outline-none appearance-none font-medium hover:bg-zinc-900 cursor-pointer"
                         >
                             <option value="all">Tüm Durumlar</option>
                             <option value="waiting">Bekliyor</option>
                             <option value="in_repair">Tamirde</option>
                             <option value="ready">Hazır</option>
                             <option value="scrapped">Hurda</option>
                         </select>
                    </div>
               )}
           </div>

           <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder={
                    activeTab === 'requests' ? "Talep Ara..." : 
                    activeTab === 'crm' ? "Müşteri Ara..." :
                    "Stok Ara (Marka, Model, Arıza)..."
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-full bg-zinc-950/50 border border-zinc-800 focus:border-amber-500/30 rounded-xl pl-12 pr-4 text-zinc-200 outline-none text-sm placeholder-zinc-600 transition-colors"
              />
           </div>
        </div>
      </div>

      {dataError && (
         <div className="p-8 glass-panel rounded-2xl flex flex-col items-center justify-center text-center border border-amber-500/20 mb-6 bg-gradient-to-br from-zinc-900 to-black relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl"></div>
            <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-zinc-800/80 border border-amber-500/30 flex items-center justify-center mb-4 shadow-xl">
                   <WifiOff className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-serif font-bold text-zinc-100 mb-2">Veri Yükleme Sorunu</h3>
                <p className="text-zinc-400 text-sm mb-6 max-w-lg mx-auto">{dataError}</p>
                <button 
                    onClick={() => fetchData(false)} 
                    className="px-8 py-3 bg-gradient-to-r from-amber-500 to-yellow-600 text-black font-bold rounded-xl hover:shadow-lg hover:shadow-amber-900/20 transition-all flex items-center gap-2"
                >
                    <RefreshCw className="w-4 h-4" /> Tekrar Dene
                </button>
            </div>
         </div>
      )}

      {activeTab === 'requests' && !dataError && (
          <div className={`grid grid-cols-1 gap-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-70' : 'opacity-100'}`}>
            {isLoadingData ? (
                <div className="py-20 flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
                    {showSlowLoading && (
                        <button onClick={() => fetchData(false)} className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 rounded-lg text-xs text-amber-500 border border-amber-500/20 hover:bg-zinc-700 transition-colors animate-in fade-in">
                            <RefreshCw className="w-3 h-3" /> Yanıt gecikti, tekrar dene
                        </button>
                    )}
                </div>
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-24 glass-panel rounded-2xl border-dashed">
                <Archive className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500">Kayıt bulunamadı.</p>
              </div>
            ) : (
              filteredRequests.map((req) => (
                <div 
                  key={req.id} 
                  onClick={() => handleOpenDetail(req)}
                  className="group glass-panel hover:bg-zinc-800/40 p-6 rounded-2xl transition-all cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-amber-500/20"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-zinc-100 text-lg group-hover:text-amber-400 transition-colors">{req.full_name}</h3>
                      <StatusBadge status={req.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                         <span className="bg-zinc-900/50 border border-zinc-800 text-zinc-400 px-2 py-1 rounded">{req.brand}</span>
                         <span className="bg-zinc-900/50 border border-zinc-800 text-zinc-400 px-2 py-1 rounded">{req.model}</span>
                         {req.category && <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-1 rounded">{req.category}</span>}
                    </div>
                    <div className="flex items-center gap-6 text-xs text-zinc-500">
                      <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> {new Date(req.created_at).toLocaleDateString('tr-TR')}</span>
                      <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5"/> {req.phone}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex -space-x-3">
                       {req.media_urls?.slice(0, 3).map((m, i) => (
                         <div key={i} className="w-10 h-10 rounded-full border-2 border-zinc-900 bg-zinc-800 overflow-hidden shadow-lg">
                            {m.type === 'image' ? (
                              <img src={m.url} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-zinc-900"><Play className="w-3 h-3 text-zinc-400" /></div>
                            )}
                         </div>
                       ))}
                       {req.media_urls?.length > 3 && (
                         <div className="w-10 h-10 rounded-full border-2 border-zinc-900 bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 font-bold shadow-lg">
                           +{req.media_urls.length - 3}
                         </div>
                       )}
                    </div>
                    <div className="p-2 bg-white/5 rounded-full group-hover:bg-amber-500/10 transition-colors">
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-amber-500" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
      )}

      {activeTab === 'crm' && !dataError && (
          <div className={`overflow-hidden glass-panel rounded-2xl transition-opacity duration-300 ${isRefreshing ? 'opacity-70' : 'opacity-100'}`}>
             {isLoadingData ? (
                 <div className="py-20 flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
                 </div>
             ) : (
                 <>
                     <div className="overflow-x-auto">
                         <table className="w-full text-left border-collapse">
                            <thead>
                               <tr className="border-b border-white/5 bg-zinc-900/50 text-xs uppercase tracking-wider text-zinc-500">
                                  <th className="p-4 font-bold whitespace-nowrap">Müşteri</th>
                                  <th className="p-4 font-bold whitespace-nowrap">İletişim</th>
                                  <th className="p-4 font-bold whitespace-nowrap">Kayıt Tarihi</th>
                                  <th className="p-4 font-bold text-center whitespace-nowrap">Talep Sayısı</th>
                                  <th className="p-4 font-bold text-center whitespace-nowrap">Durum</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-sm text-zinc-300">
                               {filteredProfiles.map(p => (
                                  <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                                     <td className="p-4 font-medium text-white flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-amber-500 shrink-0">
                                           <User className="w-4 h-4" />
                                        </div>
                                        {p.full_name || 'İsimsiz'}
                                     </td>
                                     <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                           <span className="text-zinc-200">{p.email || '-'}</span>
                                           <span className="text-zinc-500 text-xs">{p.phone || '-'}</span>
                                        </div>
                                     </td>
                                     <td className="p-4 text-zinc-500">
                                        {p.created_at ? new Date(p.created_at).toLocaleDateString('tr-TR') : 'Tarih Yok'}
                                     </td>
                                     <td className="p-4 text-center">
                                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${p.request_count > 0 ? 'bg-zinc-800 text-white' : 'bg-red-900/20 text-red-400'}`}>
                                            {p.request_count}
                                        </span>
                                     </td>
                                     <td className="p-4 text-center">
                                        {p.request_count === 0 && (
                                            <span className="text-[10px] uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded">
                                               Potansiyel
                                            </span>
                                        )}
                                     </td>
                                  </tr>
                               ))}
                            </tbody>
                         </table>
                     </div>
                     {filteredProfiles.length === 0 && (
                         <div className="p-12 text-center text-zinc-500">Müşteri bulunamadı.</div>
                     )}
                 </>
             )}
          </div>
      )}

      {activeTab === 'stock' && !dataError && (
          <div className={`space-y-6 transition-opacity duration-300 ${isRefreshing ? 'opacity-70' : 'opacity-100'}`}>
              
              <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
                  <div className="flex items-center gap-2 mb-4">
                      <div className="p-2 bg-amber-500/10 rounded-lg">
                        <Plus className="w-5 h-5 text-amber-500" />
                      </div>
                      <h3 className="font-bold text-zinc-100">Yeni Envanter Kaydı</h3>
                  </div>
                  
                  <form onSubmit={handleAddStock} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-1">
                          <label className="text-xs text-zinc-500 uppercase font-bold ml-1">Marka *</label>
                          <input type="text" value={newStock.brand} onChange={e => setNewStock({...newStock, brand: e.target.value})} className="w-full bg-zinc-950/50 border border-zinc-700 rounded-lg p-2.5 text-sm focus:border-amber-500/50 outline-none" placeholder="Marka..." required />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs text-zinc-500 uppercase font-bold ml-1">Model *</label>
                          <input type="text" value={newStock.model} onChange={e => setNewStock({...newStock, model: e.target.value})} className="w-full bg-zinc-950/50 border border-zinc-700 rounded-lg p-2.5 text-sm focus:border-amber-500/50 outline-none" placeholder="Model..." required />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs text-zinc-500 uppercase font-bold ml-1">Miktar</label>
                          <input type="number" min="1" value={newStock.quantity} onChange={e => setNewStock({...newStock, quantity: parseInt(e.target.value)})} className="w-full bg-zinc-950/50 border border-zinc-700 rounded-lg p-2.5 text-sm focus:border-amber-500/50 outline-none" />
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs text-zinc-500 uppercase font-bold ml-1">Kozmetik Durum</label>
                          <select 
                            value={newStock.cosmetic_condition} 
                            onChange={e => setNewStock({...newStock, cosmetic_condition: e.target.value})}
                            className="w-full bg-zinc-950/50 border border-zinc-700 rounded-lg p-2.5 text-sm focus:border-amber-500/50 outline-none appearance-none"
                          >
                              <option value="Sıfır Ayarında">Sıfır Ayarında</option>
                              <option value="Hafif Aşınma">Hafif Aşınma</option>
                              <option value="Çok Yıpranmış">Çok Yıpranmış</option>
                          </select>
                      </div>
                      <div className="space-y-1">
                          <label className="text-xs text-zinc-500 uppercase font-bold ml-1">Arıza Sebebi</label>
                          <select 
                            value={newStock.failure_reason} 
                            onChange={e => setNewStock({...newStock, failure_reason: e.target.value})}
                            className="w-full bg-zinc-950/50 border border-zinc-700 rounded-lg p-2.5 text-sm focus:border-amber-500/50 outline-none appearance-none"
                          >
                              <option value="Diğer">Diğer</option>
                              <option value="Motor Arızası">Motor Arızası</option>
                              <option value="Elektronik Hata">Elektronik Hata</option>
                              <option value="Fiziksel Hasar">Fiziksel Hasar</option>
                          </select>
                      </div>
                      <div className="space-y-1 lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                             <label className="text-xs text-zinc-500 uppercase font-bold ml-1">Eksik Parçalar</label>
                             <input 
                                type="text" 
                                value={newStock.missing_parts || ''} 
                                onChange={e => setNewStock({...newStock, missing_parts: e.target.value})} 
                                className="w-full bg-zinc-950/50 border border-zinc-700 rounded-lg p-2.5 text-sm focus:border-amber-500/50 outline-none" 
                                placeholder="Eksik parçalar..." 
                             />
                          </div>
                          <div className="space-y-1 flex gap-2">
                             <div className="flex-1 space-y-1">
                                <label className="text-xs text-zinc-500 uppercase font-bold ml-1">Dahili Notlar</label>
                                <textarea 
                                    value={newStock.notes || ''} 
                                    onChange={e => setNewStock({...newStock, notes: e.target.value})} 
                                    className="w-full bg-zinc-950/50 border border-zinc-700 rounded-lg p-2.5 text-sm focus:border-amber-500/50 outline-none h-[42px] min-h-[42px] resize-y overflow-hidden leading-tight pt-3" 
                                    placeholder="Notlar..." 
                                />
                             </div>
                             <div className="flex items-end">
                                 <button type="submit" className="h-[42px] px-6 bg-zinc-800 hover:bg-zinc-700 text-amber-500 border border-amber-500/20 rounded-lg font-bold transition-all">
                                     Ekle
                                 </button>
                             </div>
                          </div>
                      </div>
                  </form>
              </div>

              {isLoadingData ? (
                 <div className="py-20 text-center"><Loader2 className="w-10 h-10 text-amber-500 animate-spin mx-auto"/></div>
              ) : filteredStock.length === 0 ? (
                 <div className="text-center py-24 glass-panel rounded-2xl border-dashed">
                    <Package className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-500">Envanterde kayıt bulunamadı.</p>
                 </div>
              ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                     {filteredStock.map(item => (
                         <div 
                            key={item.id} 
                            onClick={() => handleOpenStockDetail(item)}
                            className="glass-panel p-5 rounded-2xl relative group border hover:border-amber-500/30 transition-all cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-black/50"
                         >
                             <div className="flex justify-between items-start mb-3">
                                 <div>
                                     <h3 className="font-bold text-zinc-100 truncate pr-2">{item.brand}</h3>
                                     <p className="text-zinc-400 text-sm">{item.model}</p>
                                 </div>
                                 <StockStatusBadge status={item.status} />
                             </div>
                             
                             <div className="space-y-3 mb-4">
                                 <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-950/50 p-2 rounded border border-white/5">
                                    <Box className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Miktar: <strong className="text-white">{item.quantity}</strong></span>
                                 </div>
                                 <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-950/50 p-2 rounded border border-white/5">
                                    <Activity className="w-3.5 h-3.5 text-red-400" />
                                    <span className="truncate">{item.failure_reason}</span>
                                 </div>
                             </div>

                             <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5 text-xs text-zinc-500">
                                 <span className="font-mono">{new Date(item.created_at).toLocaleDateString('tr-TR')}</span>
                                 <div className="flex items-center gap-1 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <span>Düzenle</span>
                                     <ChevronRight className="w-3 h-3" />
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
              )}
          </div>
      )}

      {selectedStock && (
         <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleCloseStockDetail}></div>
            <div className="bg-zinc-950/90 backdrop-blur-2xl border border-white/10 w-full max-w-2xl h-[92vh] md:h-auto rounded-t-3xl md:rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
                <div className="sticky top-0 z-20 p-5 md:p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/90 backdrop-blur-md">
                   <h3 className="text-xl font-bold text-zinc-100 flex items-center gap-3">
                      <Package className="w-6 h-6 text-amber-500" /> Stok Detayı
                   </h3>
                   <button onClick={handleCloseStockDetail} className="p-3 hover:bg-zinc-800 rounded-2xl text-zinc-100 border border-white/5 active:scale-90 transition-all">
                      <X className="w-6 h-6" />
                   </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-zinc-500 uppercase">Marka</label>
                           <input 
                              type="text" 
                              value={editStockData.brand || ''} 
                              onChange={e => setEditStockData({...editStockData, brand: e.target.value})}
                              className="w-full bg-black/50 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200"
                           />
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-bold text-zinc-500 uppercase">Model</label>
                           <input 
                              type="text" 
                              value={editStockData.model || ''} 
                              onChange={e => setEditStockData({...editStockData, model: e.target.value})}
                              className="w-full bg-black/50 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200"
                           />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-900/30 rounded-2xl border border-white/5 shadow-inner">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Stok Durumu</label>
                            <select 
                                value={editStockData.status || 'waiting'}
                                onChange={e => setEditStockData({...editStockData, status: e.target.value as any})}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200 appearance-none"
                            >
                                <option value="waiting">BEKLİYOR</option>
                                <option value="in_repair">TAMİRDE</option>
                                <option value="ready">HAZIR</option>
                                <option value="scrapped">HURDA</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Adet</label>
                            <input 
                                type="number" 
                                min="0"
                                value={editStockData.quantity || 0} 
                                onChange={e => setEditStockData({...editStockData, quantity: parseInt(e.target.value)})}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Kozmetik Durum</label>
                            <select 
                                value={editStockData.cosmetic_condition || 'Sıfır Ayarında'}
                                onChange={e => setEditStockData({...editStockData, cosmetic_condition: e.target.value})}
                                className="w-full bg-black/50 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200 appearance-none"
                            >
                                <option value="Sıfır Ayarında">Sıfır Ayarında</option>
                                <option value="Hafif Aşınma">Hafif Aşınma</option>
                                <option value="Çok Yıpranmış">Çok Yıpranmış</option>
                            </select>
                         </div>
                         <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Arıza Sebebi</label>
                            <select 
                                value={editStockData.failure_reason || 'Diğer'}
                                onChange={e => setEditStockData({...editStockData, failure_reason: e.target.value})}
                                className="w-full bg-black/50 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200 appearance-none"
                            >
                                <option value="Diğer">Diğer</option>
                                <option value="Motor Arızası">Motor Arızası</option>
                                <option value="Elektronik Hata">Elektronik Hata</option>
                                <option value="Fiziksel Hasar">Fiziksel Hasar</option>
                            </select>
                         </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Eksik Parçalar</label>
                            <textarea 
                                value={editStockData.missing_parts || ''} 
                                onChange={e => setEditStockData({...editStockData, missing_parts: e.target.value})}
                                className="w-full bg-black/50 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200 min-h-[80px] resize-none"
                                placeholder="Yok"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase">Dahili Notlar</label>
                            <textarea 
                                value={editStockData.notes || ''} 
                                onChange={e => setEditStockData({...editStockData, notes: e.target.value})}
                                className="w-full bg-black/50 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200 min-h-[100px] resize-none"
                                placeholder="Servis notları..."
                            />
                        </div>
                    </div>
                    <div className="h-6 md:hidden"></div>
                </div>

                <div className="p-6 border-t border-white/5 bg-zinc-900/50 flex flex-col md:flex-row items-center justify-between gap-4">
                    <button 
                        onClick={handleDeleteStock}
                        className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors text-sm font-bold border border-red-500/10"
                    >
                        <Trash2 className="w-4 h-4" /> Kaydı Sil
                    </button>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button onClick={handleCloseStockDetail} className="flex-1 md:flex-none px-8 py-3 bg-zinc-800 text-zinc-300 rounded-xl hover:bg-zinc-700 font-bold transition-all border border-white/5">İptal</button>
                        <button onClick={handleUpdateStock} className="flex-1 md:flex-none px-8 py-3 bg-amber-600 text-black font-bold rounded-xl hover:bg-amber-500 shadow-lg shadow-amber-900/20 transition-all">Kaydet</button>
                    </div>
                </div>
            </div>
         </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowDeleteConfirm(false)}></div>
             <div className="relative bg-zinc-950 border border-red-500/30 rounded-3xl w-full max-w-sm shadow-2xl p-8 animate-in zoom-in-95 duration-200 ring-1 ring-red-900/50">
                  <div className="flex flex-col items-center text-center">
                      <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 ring-1 ring-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                          <AlertTriangle className="w-10 h-10 text-red-500" />
                      </div>
                      <h3 className="text-xl font-serif font-bold text-zinc-100 mb-2">Kaydı Sil</h3>
                      <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                         Bu stok kaydını silmek üzeresiniz.<br/>
                         <span className="text-red-400 font-bold">Bu işlem geri alınamaz.</span>
                      </p>
                      <div className="flex gap-4 w-full">
                          <button 
                             onClick={() => setShowDeleteConfirm(false)}
                             className="flex-1 px-4 py-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-600 rounded-2xl font-bold transition-all"
                          >
                             İptal
                          </button>
                          <button 
                             onClick={executeDeleteStock}
                             className="flex-1 px-4 py-4 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white border border-red-500/30 rounded-2xl font-bold transition-all shadow-lg shadow-red-900/30"
                          >
                             Sil
                          </button>
                      </div>
                  </div>
             </div>
        </div>
      )}

      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleCloseDetail}></div>
          <div className="bg-zinc-950 border-t md:border border-white/10 w-full max-w-6xl h-[92vh] md:h-auto md:max-h-[95vh] md:rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95 duration-200">
            {/* STICKY HEADER FOR CLOSE BUTTON */}
            <div className="sticky top-0 z-30 p-5 md:p-8 border-b border-white/10 flex items-center justify-between bg-zinc-900/90 backdrop-blur-md">
              <div className="min-w-0 pr-4 flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h3 className="text-lg md:text-2xl font-serif font-bold text-zinc-100 truncate">
                     {selectedRequest.full_name}
                  </h3>
                  <div className="shrink-0">
                    <StatusBadge status={selectedRequest.status} large />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                   <span className="flex items-center gap-2 bg-zinc-950/50 border border-white/5 px-3 py-1.5 rounded-lg"><Mail className="w-3.5 h-3.5"/> {selectedRequest.email}</span>
                   <span className="flex items-center gap-2 bg-zinc-950/50 border border-white/5 px-3 py-1.5 rounded-lg"><Phone className="w-3.5 h-3.5"/> {selectedRequest.phone}</span>
                </div>
              </div>
              <button 
                onClick={handleCloseDetail} 
                className="shrink-0 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-zinc-100 border border-white/10 shadow-lg active:scale-90 transition-all ml-2"
                aria-label="Kapat"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 md:p-8 bg-zinc-950/50">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                <div className="lg:col-span-5 flex flex-col gap-6 order-2 lg:order-1 h-full">
                   <div className="glass-panel rounded-2xl p-6 flex flex-col h-full bg-zinc-900/40 border border-white/5">
                      <h4 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-white/5 pb-4">
                        <History className="w-4 h-4"/> Servis İş Akışı
                      </h4>
                      <div className="flex-1 overflow-y-auto max-h-[300px] lg:max-h-[500px] space-y-0 mb-6 pr-2 custom-scrollbar">
                         <div className="relative pl-8 pb-8 border-l border-zinc-800 last:border-0 last:pb-0">
                             <div className="absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-zinc-600 ring-4 ring-zinc-950"></div>
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
                                <div className="absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-zinc-950"></div>
                                <div className="flex items-center gap-2 mb-1">
                                   <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wide">
                                      {new Date(note.created_at).toLocaleString('tr-TR')}
                                   </div>
                                   {note.author?.role === 'admin' && (
                                       <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                            <ShieldCheck className="w-3 h-3" /> TEKNİK EKİP
                                       </span>
                                   )}
                                   {note.author?.role === 'customer' && (
                                       <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                                            MÜŞTERİ
                                       </span>
                                   )}
                                </div>
                                <div className="text-sm text-zinc-200 bg-zinc-900 border border-zinc-800 p-4 rounded-xl inline-block shadow-sm w-full">
                                   <p className="whitespace-pre-wrap leading-relaxed">{note.note}</p>
                                   {note.media_url && (
                                       <div className="mt-4 rounded-xl overflow-hidden border border-zinc-700 bg-black/50 cursor-pointer hover:border-amber-500/50 transition-colors shadow-inner"
                                            onClick={() => setLightboxMedia({url: note.media_url!, type: note.media_type!})}>
                                            {note.media_type === 'image' ? (
                                                <img src={note.media_url} alt="Note Attachment" className="w-full h-32 md:h-40 object-cover" />
                                            ) : (
                                                <div className="w-full h-32 md:h-40 flex items-center justify-center">
                                                    <Play className="w-10 h-10 text-white/80" />
                                                </div>
                                            )}
                                       </div>
                                   )}
                                </div>
                             </div>
                           ))
                         }
                      </div>
                      <form onSubmit={handleAddNote} className="relative mt-auto pt-4 border-t border-white/5">
                         <div className="relative flex items-center gap-2">
                             <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={(e) => setNoteFile(e.target.files ? e.target.files[0] : null)} />
                             <button type="button" onClick={() => fileInputRef.current?.click()} className={`p-4 rounded-2xl transition-all border border-zinc-800 ${noteFile ? 'bg-amber-500/20 text-amber-500 border-amber-500/50' : 'bg-zinc-950 text-zinc-500 hover:text-zinc-300'}`}>
                                 {noteFile ? <ImageIcon className="w-5 h-5" /> : <Paperclip className="w-5 h-5" />}
                             </button>
                             <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Not ekle..." className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-200 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all shadow-inner"/>
                             <button type="submit" disabled={isSendingNote} className="p-4 bg-amber-500 rounded-2xl text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-900/20 disabled:opacity-50">
                                {isSendingNote ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                             </button>
                         </div>
                      </form>
                   </div>
                </div>

                <div className="lg:col-span-7 space-y-8 order-1 lg:order-2">
                   <div className="glass-panel p-6 rounded-2xl bg-zinc-900/40 space-y-6 border border-white/5 shadow-inner">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-zinc-950/70 border border-white/5 px-4 py-3 rounded-xl shadow-sm">
                              <span className="block text-[10px] uppercase text-zinc-500 font-bold mb-1 tracking-wider">Marka</span>
                              <span className="text-zinc-100 font-medium">{selectedRequest.brand}</span>
                          </div>
                          <div className="bg-zinc-950/70 border border-white/5 px-4 py-3 rounded-xl shadow-sm">
                              <span className="block text-[10px] uppercase text-zinc-500 font-bold mb-1 tracking-wider">Model</span>
                              <span className="text-zinc-100 font-medium">{selectedRequest.model}</span>
                          </div>
                          <div className="bg-amber-500/5 border border-amber-500/10 px-4 py-3 rounded-xl shadow-sm">
                              <span className="block text-[10px] uppercase text-amber-600 font-bold mb-1 tracking-wider">Kategori</span>
                              <span className="text-amber-500 font-medium">{selectedRequest.category}</span>
                          </div>
                          <div className="bg-zinc-950/70 border border-white/5 px-4 py-3 rounded-xl shadow-sm">
                              <span className="block text-[10px] uppercase text-zinc-500 font-bold mb-1 tracking-wider">Alım Tarihi</span>
                              <span className="text-zinc-100 font-medium">{selectedRequest.product_date}</span>
                          </div>
                      </div>
                      <div>
                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 ml-1">Sorun Açıklaması</h4>
                        <div className="bg-zinc-950/70 p-6 rounded-2xl border border-white/5 text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap shadow-inner">
                            {selectedRequest.description}
                        </div>
                      </div>
                      {selectedRequest.status === 'rejected' && selectedRequest.rejection_reason && (
                        <div className="bg-red-500/10 p-6 rounded-2xl border border-red-500/20 text-red-200 text-sm leading-relaxed shadow-lg">
                            <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <AlertTriangle className="w-3.5 h-3.5" /> Red Nedeni
                            </h4>
                            {selectedRequest.rejection_reason}
                        </div>
                      )}
                   </div>
                   <div className="flex flex-col gap-5 glass-panel p-6 rounded-2xl bg-zinc-900/40 border border-white/5">
                      <span className="text-sm text-zinc-400 font-bold ml-1 uppercase tracking-wider">İşlem Kontrolü</span>
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <button
                          onClick={() => toggleStatus(selectedRequest.id, selectedRequest.status)}
                          className={`w-full sm:flex-1 px-8 py-4 rounded-2xl text-sm font-bold transition-all shadow-xl flex items-center justify-center gap-3 ${
                            selectedRequest.status === 'pending'
                            ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/20'
                            : 'bg-amber-600 hover:bg-amber-500 text-black shadow-amber-900/20'
                          }`}
                        >
                          {selectedRequest.status === 'pending' 
                            ? <><CheckCircle className="w-5 h-5"/> Çözüldü Olarak İşaretle</>
                            : <><Clock className="w-5 h-5"/> Beklemeye Al</>
                          }
                        </button>
                        
                        {selectedRequest.status !== 'rejected' && (
                          <button
                            onClick={() => setShowRejectModal(true)}
                            className="w-full sm:flex-1 px-8 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl text-sm font-bold transition-all shadow-xl shadow-red-900/20 flex items-center justify-center gap-3 border border-red-500/20"
                          >
                            <XCircle className="w-5 h-5" /> Talebi Reddet
                          </button>
                        )}
                      </div>
                   </div>
                   <div>
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 ml-1">Medya Dosyaları</h4>
                      {(!selectedRequest.media_urls || selectedRequest.media_urls.length === 0) ? (
                          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-dashed border-zinc-800 text-zinc-600 text-sm italic text-center">Medya bulunmuyor.</div>
                      ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {selectedRequest.media_urls.map((media, idx) => (
                              <div 
                                key={idx} 
                                className="aspect-square bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 relative group cursor-pointer hover:border-amber-500/50 transition-all shadow-lg"
                                onClick={() => setLightboxMedia({url: media.url, type: media.type})}
                              >
                                {media.type === 'image' ? (
                                  <>
                                    <img src={media.url} alt="Evidence" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                        <Maximize2 className="w-6 h-6 text-white drop-shadow-lg" />
                                    </div>
                                  </>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                                      <Play className="w-10 h-10 text-amber-500" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                      )}
                   </div>
                </div>
              </div>
              <div className="h-10 md:hidden"></div>
            </div>
          </div>
        </div>
      )}

      {/* --- REJECT MODAL --- */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
             <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowRejectModal(false)}></div>
             <div className="relative bg-zinc-950 border border-red-500/30 rounded-3xl w-full max-w-lg shadow-2xl p-8 animate-in zoom-in-95 duration-300">
                  <div className="flex flex-col gap-6">
                      <div className="flex items-center gap-5 border-b border-white/10 pb-5">
                          <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20 shadow-lg">
                              <XCircle className="w-8 h-8 text-red-500" />
                          </div>
                          <div>
                              <h3 className="text-2xl font-serif font-bold text-zinc-100 leading-tight">Talebi Reddet</h3>
                              <p className="text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-bold mt-1">Servis Red İşlemi</p>
                          </div>
                      </div>

                      <div className="space-y-3">
                          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Red Nedeni *</label>
                          <textarea 
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              placeholder="Müşteriye iletilecek açıklama..."
                              className="w-full bg-black/50 border border-zinc-800 focus:border-red-500/40 rounded-2xl p-5 text-zinc-200 text-sm outline-none transition-all min-h-[160px] shadow-inner leading-relaxed"
                              required
                          />
                          <p className="text-[10px] text-zinc-600 italic px-1">Bu açıklama müşterinin zaman tüneline yansıyacaktır.</p>
                      </div>

                      <div className="flex gap-4">
                          <button 
                             onClick={() => setShowRejectModal(false)}
                             className="flex-1 px-4 py-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 rounded-2xl font-bold transition-all"
                          >
                             İptal
                          </button>
                          <button 
                             onClick={handleRejectSubmit}
                             disabled={isRejecting || !rejectionReason.trim()}
                             className="flex-1 px-4 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-red-900/30 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                             {isRejecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ShieldCheck className="w-5 h-5" /> Reddi Onayla</>}
                          </button>
                      </div>
                  </div>
             </div>
        </div>
      )}

      {lightboxMedia && (
        <div 
            className="fixed inset-0 z-[110] bg-black/98 backdrop-blur-2xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
            onClick={() => setLightboxMedia(null)}
        >
           <button 
             onClick={() => setLightboxMedia(null)}
             className="absolute top-8 right-8 z-[120] p-4 bg-zinc-800/80 hover:bg-zinc-700 text-white hover:text-amber-500 rounded-full border border-white/10 hover:border-amber-500/50 transition-all shadow-2xl active:scale-90"
           >
              <X className="w-8 h-8" />
           </button>
           <div 
             className="relative max-w-full max-h-full flex items-center justify-center"
             onClick={(e) => e.stopPropagation()}
           >
                {lightboxMedia.type === 'image' ? (
                        <img 
                            src={lightboxMedia.url} 
                            alt="Full View" 
                            className="max-w-full max-h-[85vh] rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.9)] ring-1 ring-white/10 object-contain" 
                        />
                ) : (
                        <video 
                            src={lightboxMedia.url} 
                            controls
                            autoPlay
                            className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl ring-1 ring-white/10" 
                        />
                )}
           </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;