
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { ServiceRequest, ServiceNote, ProfileWithStats, InventoryItem, RequestStatus } from '../types';
import { 
  Search, RefreshCw, X, Calendar, Phone, Mail, 
  CheckCircle, History, Play, ChevronRight,
  Send, User, Paperclip, Image as ImageIcon, Loader2,
  AlertTriangle, FileSpreadsheet,
  XCircle, Info, Layers, MessageCircle,
  PieChart as PieChartIcon, BarChart2, Wallet, Smartphone,
  Wrench, Activity, FileText, Trash2, Edit3, Box, Cpu,
  Plus, Package, TrendingUp, DollarSign, AlertCircle, Archive, Tag
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import * as XLSX from 'xlsx';
import { sendUpdateNotificationEmail } from '../lib/email';
import { sendNotification } from '../lib/notifications';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area
} from 'recharts';
import { pdf } from '@react-pdf/renderer';
import ServicePdfDocument from './ServicePdfDocument';

// Simple notification sound (Pop sound)
const NOTIFICATION_SOUND = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'; 

type TabType = 'requests' | 'crm' | 'stock' | 'reports';
type RequestFilter = 'pending' | 'resolved' | 'rejected' | 'all';

interface EnrichedProfile extends ProfileWithStats {
  stats: {
    pending: number;
    resolved: number;
    rejected: number;
  };
  display_phone: string;
  display_email: string;
  latest_requests: ServiceRequest[];
}

const STATUS_OPTIONS: { value: RequestStatus; label: string; color: string }[] = [
    { value: 'pending', label: 'Bekliyor', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
    { value: 'diagnosing', label: 'İnceleniyor', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    { value: 'pending_approval', label: 'Fiyat Onayı', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
    { value: 'approved', label: 'İşlemde', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
    { value: 'waiting_parts', label: 'Parça Bekleniyor', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
    { value: 'resolved', label: 'Test Ok', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { value: 'shipped', label: 'Kargolandı', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
    { value: 'completed', label: 'Teslim Edildi', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
    { value: 'rejected', label: 'İptal / Red', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
];

// INVENTORY STATUS OPTIONS
const INVENTORY_STATUS_OPTIONS = [
    { value: 'new', label: 'Sıfır', color: 'bg-green-500/20 text-green-500 border-green-500/30' },
    { value: 'used', label: 'İkinci El', color: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
    { value: 'refurbished', label: 'Yenilenmiş', color: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
    { value: 'defective', label: 'Arızalı', color: 'bg-orange-500/20 text-orange-500 border-orange-500/30' },
    { value: 'scrap', label: 'Hurda', color: 'bg-red-500/20 text-red-500 border-red-500/30' },
];

const AdminDashboard: React.FC = () => {
  const { profile, session, loading: authLoading } = useAuth();
  const isMounted = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>('requests');
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'chat'>('info');
  
  // Data States
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [profiles, setProfiles] = useState<EnrichedProfile[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  
  const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});
  const [isLoadingData, setIsLoadingData] = useState(true); 
  const [isRefreshing, setIsRefreshing] = useState(false); 
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Selections
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<EnrichedProfile | null>(null);

  // Forms & Modals
  const [showStockModal, setShowStockModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null); // NEW: Track item to delete
  const [stockForm, setStockForm] = useState<Partial<InventoryItem>>({
      name: '', category: 'Yedek Parça', sku: '', quantity: 0, critical_level: 5, buy_price: 0, sell_price: 0, shelf_location: '', status: 'new', notes: ''
  });

  const [notes, setNotes] = useState<ServiceNote[]>([]);
  const notesRef = useRef<ServiceNote[]>([]); 
  const selectedRequestRef = useRef<ServiceRequest | null>(null); 
  
  const [editForm, setEditForm] = useState<{
      estimated_cost: number;
      currency: string;
      shipping_company: string;
      shipping_tracking_code: string;
      status: RequestStatus;
  }>({ estimated_cost: 0, currency: 'TL', shipping_company: '', shipping_tracking_code: '', status: 'pending' });

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const [newNote, setNewNote] = useState('');
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [isSendingNote, setIsSendingNote] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesContainerRef = useRef<HTMLDivElement>(null);
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);


  useEffect(() => {
      notesRef.current = notes;
      selectedRequestRef.current = selectedRequest;
  }, [notes, selectedRequest]);

  useEffect(() => {
      audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'); 
      audioRef.current.volume = 0.5;
  }, []);

  const playNotificationSound = () => {
      if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => console.log("Audio play blocked", e));
      }
  };

  const handleOpenDetail = useCallback((req: ServiceRequest) => {
    setActiveTab('requests');
    setSelectedRequest(req);
    setEditForm({ estimated_cost: req.estimated_cost || 0, currency: req.currency || 'TL', shipping_company: req.shipping_company || '', shipping_tracking_code: req.shipping_tracking_code || '', status: req.status });
    setActiveDetailTab('info');
    fetchNotes(req.id);
    document.body.style.overflow = 'hidden';
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Data Fetching
  const fetchData = useCallback(async (forceSilent = false) => {
    if (!profile) return;
    if (forceSilent) setIsRefreshing(true);
    else setIsLoadingData(true);
    try {
      // 1. Fetch Requests
      const { data: reqData, error: reqError } = await supabase.from('service_requests').select('*').order('created_at', { ascending: false });
      if (reqError) throw reqError;
      const allRequests = reqData as ServiceRequest[] || [];
      if (isMounted.current) setRequests(allRequests);

      // 2. Fetch Unread Notes Logic
      const { data: notesMeta } = await supabase.from('service_notes').select('request_id, author_id').order('created_at', { ascending: true });
      const map: Record<string, boolean> = {};
      if (notesMeta) {
        notesMeta.forEach(n => {
            if (n.author_id !== session?.user?.id) map[String(n.request_id)] = true;
        });
      }
      if (isMounted.current && !forceSilent) setUnreadMap(map);

      // 3. Tab Specific Data
      if (activeTab === 'crm') {
          const { data: profilesData, error: pError } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
          if (pError) throw pError;
          
          const userMap: Record<string, any> = {};
          allRequests.forEach(r => {
             if (!r.user_id) return;
             if (!userMap[r.user_id]) userMap[r.user_id] = { total: 0, pending: 0, resolved: 0, rejected: 0, last_phone: '', last_email: '', requests: [] };
             userMap[r.user_id].total++;
             if (['pending', 'diagnosing', 'pending_approval', 'approved', 'waiting_parts'].includes(r.status)) userMap[r.user_id].pending++;
             if (['resolved', 'completed', 'shipped'].includes(r.status)) userMap[r.user_id].resolved++;
             if (r.status === 'rejected') userMap[r.user_id].rejected++;
             if (!userMap[r.user_id].last_phone && r.phone) userMap[r.user_id].last_phone = r.phone;
             if (!userMap[r.user_id].last_email && r.email) userMap[r.user_id].last_email = r.email;
             userMap[r.user_id].requests.push(r);
          });

          const enriched = (profilesData || []).map(p => {
              const stats = userMap[p.id] || { total: 0, pending: 0, resolved: 0, rejected: 0, last_phone: '', last_email: '', requests: [] };
              return { 
                  ...p, 
                  full_name: p.full_name || 'İsimsiz', 
                  request_count: stats.total, 
                  stats: { pending: stats.pending, resolved: stats.resolved, rejected: stats.rejected }, 
                  display_phone: p.phone || stats.last_phone || '-', 
                  display_email: p.email || stats.last_email || '-',
                  latest_requests: stats.requests
              };
          });
          if (isMounted.current) setProfiles(enriched as EnrichedProfile[]);

      } else if (activeTab === 'stock') {
          const { data: invData, error: invError } = await supabase.from('inventory').select('*').order('created_at', { ascending: false });
          if (invError) {
              if (invError.code === '42P01') console.warn("Inventory table missing, please run SQL."); 
              else throw invError;
          }
          if (isMounted.current) setInventory(invData as InventoryItem[] || []);
      }

    } catch (err: any) { 
        toast.error("Veriler yüklenemedi."); 
        console.error(err);
    } finally { 
        if (isMounted.current) { setIsLoadingData(false); setIsRefreshing(false); } 
    }
  }, [profile, activeTab, session?.user?.id]);

  useEffect(() => { if (!authLoading && profile?.role === 'admin') fetchData(); }, [profile, activeTab, authLoading, fetchData]);

  // Realtime Subscriptions
  useEffect(() => {
    if (!profile?.role || profile.role !== 'admin') return;
    const channel = supabase.channel('admin-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'service_notes' }, (payload) => {
          const newNote = payload.new as ServiceNote;
          if (selectedRequestRef.current && String(selectedRequestRef.current.id) === String(newNote.request_id)) {
             supabase.from('profiles').select('full_name, role').eq('id', newNote.author_id).single().then(({data}) => {
                    const noteWithAuthor = { ...newNote, author: data || { full_name: 'Bilinmeyen', role: 'customer' } };
                    setNotes(prev => [...prev, noteWithAuthor as ServiceNote]);
                    if (newNote.author_id !== session?.user?.id) playNotificationSound();
                });
          } else {
             if (newNote.author_id !== session?.user?.id) { 
                 playNotificationSound(); 
                 setUnreadMap(prev => ({ ...prev, [String(newNote.request_id)]: true })); 
                 toast(`Yeni Mesaj: Talep #${String(newNote.request_id).slice(0,6)}...`, { icon: '💬' }); 
             }
          }
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'service_requests' }, (payload) => {
           const updatedReq = payload.new as ServiceRequest;
           setRequests(prev => prev.map(r => r.id === updatedReq.id ? updatedReq : r));
           if (selectedRequestRef.current && String(selectedRequestRef.current.id) === String(updatedReq.id)) {
               setSelectedRequest(updatedReq);
               setEditForm(prev => ({ ...prev, status: updatedReq.status, estimated_cost: updatedReq.estimated_cost || 0 }));
           }
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.role, session?.user?.id]);

  // --- REPORT ANALYTICS CALCULATIONS ---
  const analyticsData = useMemo(() => {
      // 1. Financials
      let totalEstimatedRevenue = 0;
      let realizedRevenue = 0;
      let totalRequests = requests.length;
      
      const monthlyData: Record<string, {name: string, count: number, revenue: number}> = {};

      requests.forEach(req => {
          const cost = req.estimated_cost || 0;
          totalEstimatedRevenue += cost;
          if (['completed', 'shipped', 'resolved'].includes(req.status)) {
              realizedRevenue += cost;
          }

          // Monthly Trend
          const date = new Date(req.created_at);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const monthLabel = date.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
          
          if (!monthlyData[monthKey]) monthlyData[monthKey] = { name: monthLabel, count: 0, revenue: 0 };
          monthlyData[monthKey].count++;
          if (['completed', 'shipped', 'resolved', 'approved'].includes(req.status)) {
             monthlyData[monthKey].revenue += cost;
          }
      });

      const trendData = Object.values(monthlyData).sort((a,b) => a.name.localeCompare(b.name));

      // 2. Status Distribution
      const statusCounts = requests.reduce((acc, curr) => {
          const simplifiedStatus = ['resolved', 'completed', 'shipped'].includes(curr.status) ? 'resolved' : ['rejected'].includes(curr.status) ? 'rejected' : 'pending';
          acc[simplifiedStatus] = (acc[simplifiedStatus] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

      const statusData = [
          { name: 'Aktif', value: statusCounts['pending'] || 0, color: '#f59e0b' },
          { name: 'Tamamlanan', value: statusCounts['resolved'] || 0, color: '#22c55e' },
          { name: 'İptal', value: statusCounts['rejected'] || 0, color: '#ef4444' },
      ];

      // 3. Stock Value
      const totalStockValue = inventory.reduce((acc, item) => acc + (item.quantity * item.buy_price), 0);
      const potentialStockRevenue = inventory.reduce((acc, item) => acc + (item.quantity * item.sell_price), 0);

      return { 
          totalEstimatedRevenue, 
          realizedRevenue, 
          totalRequests, 
          trendData, 
          statusData,
          totalStockValue,
          potentialStockRevenue
      };
  }, [requests, inventory]);

  const customerSpecificData = useMemo(() => {
      if (!selectedCustomer) return null;
      const customerRequests = requests.filter(r => r.user_id === selectedCustomer.id);
      const totalSpend = customerRequests.reduce((acc, curr) => {
          if (['completed', 'shipped', 'resolved', 'approved'].includes(curr.status) && curr.estimated_cost) return acc + curr.estimated_cost;
          return acc;
      }, 0);
      return { requests: customerRequests, totalSpend };
  }, [requests, selectedCustomer]);


  // --- HANDLERS ---
  
  const fetchNotes = async (requestId: number | string) => {
    try {
      const { data: notesData, error: notesError } = await supabase.from('service_notes').select('*').eq('request_id', requestId).order('created_at', { ascending: true });
      if (notesError) throw notesError;
      const authorIds = [...new Set(notesData?.map(n => n.author_id).filter(Boolean))];
      let profileMap: Record<string, any> = {};
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, role').in('id', authorIds);
        if (profiles) profiles.forEach(p => { profileMap[p.id] = p; });
      }
      const mergedNotes = notesData?.map(n => ({ ...n, author: profileMap[n.author_id] || { role: 'customer', full_name: 'Kullanıcı' } }));
      if (isMounted.current) setNotes(mergedNotes as ServiceNote[] || []);
      setUnreadMap(prev => ({ ...prev, [String(requestId)]: false }));
    } catch (e) { toast.error("Notlar yüklenirken bağlantı hatası."); }
  };

  const handleExportExcel = () => {
      if (requests.length === 0) return toast.error("Veri yok.");
      const data = requests.map(req => ({ "Müşteri": req.full_name, "Telefon": req.phone, "E-posta": req.email, "Cihaz": `${req.brand} ${req.model}`, "Durum": req.status, "Fiyat": `${req.estimated_cost || 0} ${req.currency}`, "Tarih": new Date(req.created_at).toLocaleDateString('tr-TR') }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rapor");
      XLSX.writeFile(wb, `Teknik_Servis_Raporu_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePreviewPdf = async () => {
      if (!selectedRequest) return;
      setIsGeneratingPdf(true);
      try {
          await new Promise(r => setTimeout(r, 100));
          const blob = await pdf(<ServicePdfDocument request={selectedRequest} notes={notes} />).toBlob();
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
      } catch (e: any) { 
          toast.error(`PDF Hatası: ${e.message}`); 
      } finally { 
          setIsGeneratingPdf(false); 
      }
  };

  const handleCloseDetail = () => {
    setSelectedRequest(null); setNotes([]); setNewNote('');
    if (!selectedCustomer) document.body.style.overflow = 'auto';
    window.location.hash = '#/admin-dashboard'; 
  };

  const handleSaveChanges = async () => {
      if (!selectedRequest) return;
      try {
          const { error } = await supabase.from('service_requests').update({ status: editForm.status, estimated_cost: editForm.estimated_cost, currency: editForm.currency, shipping_company: editForm.shipping_company, shipping_tracking_code: editForm.shipping_tracking_code }).eq('id', selectedRequest.id);
          if (error) throw error;
          
          const changeLog = [];
          if (editForm.status !== selectedRequest.status) changeLog.push(`Durum: ${STATUS_OPTIONS.find(o => o.value === editForm.status)?.label}`);
          if (editForm.estimated_cost !== selectedRequest.estimated_cost) changeLog.push(`Fiyat: ${editForm.estimated_cost} ${editForm.currency}`);
          
          if (changeLog.length > 0) {
              await supabase.from('service_notes').insert({ 
                  request_id: selectedRequest.id, 
                  author_id: session?.user?.id, 
                  note: `SİSTEM GÜNCELLEMESİ:\n${changeLog.join('\n')}` 
              });
          }
          
          toast.success("Bilgiler güncellendi.");
          if (editForm.status !== selectedRequest.status) {
              let title = "Talep Güncellemesi";
              let msg = `Cihazınızın durumu güncellendi: ${STATUS_OPTIONS.find(o => o.value === editForm.status)?.label}`;
              await sendNotification(selectedRequest.user_id, title, msg, 'info', `#/my-requests?id=${selectedRequest.id}`);
          }
          setSelectedRequest(prev => prev ? ({ ...prev, ...editForm }) : null);
          if (editForm.status !== selectedRequest.status || editForm.estimated_cost > 0) {
             sendUpdateNotificationEmail({ to_email: selectedRequest.email || '', full_name: selectedRequest.full_name || '', brand: selectedRequest.brand || '', model: selectedRequest.model || '', new_status: STATUS_OPTIONS.find(o => o.value === editForm.status)?.label || '', latest_note: "Servis durumunuz veya fiyat bilgisi güncellendi." }).catch(console.error);
          }
      } catch(e: any) { toast.error("Güncelleme hatası."); }
  };

  const handleRejectSubmit = async () => {
    if (!selectedRequest || !rejectionReason.trim()) return toast.error("Neden girin.");
    setIsRejecting(true);
    try {
        await supabase.from('service_requests').update({ status: 'rejected', rejection_reason: rejectionReason }).eq('id', selectedRequest.id);
        await supabase.from('service_notes').insert({ request_id: selectedRequest.id, author_id: session?.user?.id, note: `REDDEDİLDİ: ${rejectionReason}` });
        await sendNotification(selectedRequest.user_id, "Talep Reddedildi", `Talebi iptal edildi. Neden: ${rejectionReason}`, 'error', `#/my-requests?id=${selectedRequest.id}`);
        toast.success("Talep reddedildi.");
        setShowRejectModal(false); setRejectionReason('');
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
        const { data: insertedNote, error } = await supabase.from('service_notes').insert({ request_id: selectedRequest.id, author_id: session?.user?.id, note: newNote.trim(), media_url: mediaUrl, media_type: mediaType }).select().single();
        if (error) throw error;
        if (insertedNote) {
            const noteWithAuthor = { ...insertedNote, author: { role: 'admin', full_name: profile?.full_name || 'Admin' } };
            setNotes(prev => [...prev, noteWithAuthor as ServiceNote]);
        }
        await sendNotification(selectedRequest.user_id, "Yeni Mesaj", `Teknik servisten yeni bir mesajınız var.`, 'info', `#/my-requests?id=${selectedRequest.id}`);
        setNewNote(''); setNoteFile(null);
    } catch (e: any) { toast.error("Hata oluştu."); } finally { setIsSendingNote(false); }
  };

  // --- INVENTORY HANDLERS ---
  const handleSaveStock = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!stockForm.name || stockForm.quantity === undefined) return toast.error("Ürün adı ve stok adedi zorunludur.");
      
      try {
          if (stockForm.id) {
              const { error } = await supabase.from('inventory').update({
                  name: stockForm.name,
                  category: stockForm.category,
                  sku: stockForm.sku,
                  quantity: stockForm.quantity,
                  critical_level: stockForm.critical_level,
                  buy_price: stockForm.buy_price,
                  sell_price: stockForm.sell_price,
                  shelf_location: stockForm.shelf_location,
                  status: stockForm.status,
                  notes: stockForm.notes
              }).eq('id', stockForm.id);
              if (error) throw error;
              toast.success("Ürün güncellendi.");
          } else {
              const { error } = await supabase.from('inventory').insert([{
                  name: stockForm.name,
                  category: stockForm.category,
                  sku: stockForm.sku,
                  quantity: stockForm.quantity,
                  critical_level: stockForm.critical_level,
                  buy_price: stockForm.buy_price,
                  sell_price: stockForm.sell_price,
                  shelf_location: stockForm.shelf_location,
                  status: stockForm.status,
                  notes: stockForm.notes
              }]);
              if (error) throw error;
              toast.success("Ürün eklendi.");
          }
          setShowStockModal(false);
          setStockForm({ name: '', category: 'Yedek Parça', quantity: 0, critical_level: 5, status: 'new', notes: '' });
          fetchData(true);
      } catch (e: any) { toast.error("Hata: " + e.message); }
  };

  // Trigger Confirmation Modal
  const handleDeleteClick = (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      setItemToDelete(id);
  };

  // Perform Actual Delete
  const performDelete = async () => {
      if (!itemToDelete) return;
      try {
          const { error } = await supabase.from('inventory').delete().eq('id', itemToDelete);
          if (error) throw error;
          setInventory(prev => prev.filter(i => i.id !== itemToDelete));
          toast.success("Ürün başarıyla silindi.");
          setItemToDelete(null);
      } catch (e: any) { 
          console.error("Delete Error", e);
          toast.error("Silinemedi: " + (e.message || "Yetki hatası")); 
      }
  };

  const handleEditInventory = (item: InventoryItem, e?: React.MouseEvent) => {
      if (e) e.stopPropagation(); 
      setStockForm(item);
      setShowStockModal(true);
  };


  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Search and Tabs Bar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-zinc-900/50 p-4 rounded-2xl border border-white/5 backdrop-blur-sm shadow-xl">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-hide">
           {(['requests', 'crm', 'stock', 'reports'] as TabType[]).map(t => (
             <button
               key={t} onClick={() => setActiveTab(t)}
               className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap uppercase tracking-widest ${activeTab === t ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
             >
               {t === 'requests' && 'Talepler'}
               {t === 'crm' && 'Müşteriler'}
               {t === 'stock' && 'Stok'}
               {t === 'reports' && 'Raporlar'}
             </button>
           ))}
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  type="text" placeholder="Hızlı Ara..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-zinc-200 focus:border-amber-500/50 outline-none transition-all"
                />
             </div>
             <button onClick={() => fetchData(false)} disabled={isRefreshing} className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 transition-all"><RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} /></button>
             <button onClick={handleExportExcel} className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 transition-all"><FileSpreadsheet className="w-4 h-4 text-green-500" /></button>
        </div>
      </div>

      {/* REQUESTS VIEW */}
      {activeTab === 'requests' && (
         <div className="space-y-4">
            <div className="flex gap-2 text-[10px] overflow-x-auto pb-1 scrollbar-hide">
               {(['pending', 'resolved', 'rejected', 'all'] as RequestFilter[]).map(f => (
                  <button key={f} onClick={() => setRequestFilter(f)} className={`px-4 py-2 rounded-lg border font-bold uppercase tracking-tighter whitespace-nowrap transition-all ${requestFilter === f ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                     {f === 'pending' && 'Bekleyenler'} {f === 'resolved' && 'Tamamlananlar'} {f === 'rejected' && 'İptaller'} {f === 'all' && 'Tümü'}
                  </button>
               ))}
            </div>
            <div className="grid gap-3">
              {isLoadingData ? (
                 <div className="p-12 text-center text-zinc-500 uppercase text-xs tracking-widest"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500"/> Yükleniyor...</div>
              ) : requests.length === 0 ? (
                 <div className="p-12 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-2xl text-xs uppercase">Talep bulunamadı.</div>
              ) : (
                requests
                .filter(r => {
                    const matchesSearch = r.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || String(r.id).includes(searchTerm) || r.brand.toLowerCase().includes(searchTerm);
                    if (!matchesSearch) return false;
                    if (requestFilter === 'all') return true;
                    if (requestFilter === 'pending') return ['pending', 'diagnosing', 'pending_approval', 'approved', 'waiting_parts'].includes(r.status);
                    if (requestFilter === 'resolved') return ['resolved', 'shipped', 'completed'].includes(r.status);
                    if (requestFilter === 'rejected') return r.status === 'rejected';
                    return true;
                })
                .map(req => (
                    <div key={req.id} onClick={() => handleOpenDetail(req)} className="group bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/5 hover:border-amber-500/20 p-4 rounded-xl cursor-pointer transition-all relative overflow-hidden shadow-lg">
                        {unreadMap[String(req.id)] && ( <div className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-full animate-pulse m-3 shadow-[0_0_10px_#f59e0b]"></div> )}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-white/5 transition-all ${unreadMap[String(req.id)] ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {unreadMap[String(req.id)] ? <MessageCircle className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="font-bold text-zinc-100 truncate text-sm uppercase tracking-tight">{req.full_name}</span>
                                        <span className="text-[9px] font-mono bg-zinc-950 px-1.5 py-0.5 rounded text-zinc-600 border border-zinc-800">#{String(req.id).slice(0, 6)}</span>
                                    </div>
                                    <div className="text-[10px] text-zinc-500 truncate uppercase font-medium">{req.brand} {req.model} • {new Date(req.created_at).toLocaleDateString()}</div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-4 pl-14 sm:pl-0">
                                <span className={`px-3 py-1 rounded-full text-[9px] font-bold border whitespace-nowrap uppercase tracking-wider ${STATUS_OPTIONS.find(o=>o.value===req.status)?.color}`}>
                                    {STATUS_OPTIONS.find(o=>o.value===req.status)?.label}
                                </span>
                                <ChevronRight className="w-5 h-5 text-zinc-700 group-hover:text-amber-500 transition-transform group-hover:translate-x-1" />
                            </div>
                        </div>
                    </div>
                ))
              )}
            </div>
         </div>
      )}

      {/* CRM VIEW */}
      {activeTab === 'crm' && (
         <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
             {profiles.filter(p => p.full_name?.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                 <div key={p.id} onClick={() => { setSelectedCustomer(p); document.body.style.overflow = 'hidden'; }} className="bg-zinc-900/50 border border-white/5 hover:border-amber-500/30 p-4 rounded-xl cursor-pointer group transition-all shadow-lg flex flex-col h-full">
                     <div className="flex items-center gap-3 mb-4">
                         <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-amber-500 group-hover:bg-zinc-700 transition-all shrink-0"><User className="w-5 h-5" /></div>
                         <div className="min-w-0">
                             <div className="font-bold text-zinc-200 text-sm truncate uppercase tracking-tight">{p.full_name}</div>
                             <div className="text-[9px] text-zinc-600 uppercase tracking-widest">{p.role === 'admin' ? 'Yönetici' : 'Müşteri'}</div>
                         </div>
                     </div>
                     <div className="grid grid-cols-4 gap-1.5 text-center mb-4">
                         <div className="bg-zinc-950 p-2 rounded-lg border border-white/5"> <div className="text-[8px] text-zinc-500 font-bold uppercase mb-0.5">Talep</div> <div className="text-xs font-bold text-zinc-200">{p.request_count}</div> </div>
                         <div className="bg-zinc-950 p-2 rounded-lg border border-white/5"> <div className="text-[8px] text-green-600 font-bold uppercase mb-0.5">OK</div> <div className="text-xs font-bold text-zinc-200">{p.stats?.resolved || 0}</div> </div>
                         <div className="bg-zinc-950 p-2 rounded-lg border border-white/5"> <div className="text-[8px] text-amber-500 font-bold uppercase mb-0.5">Aktif</div> <div className="text-xs font-bold text-zinc-200">{p.stats?.pending || 0}</div> </div>
                         <div className="bg-zinc-950 p-2 rounded-lg border border-red-900/20"> <div className="text-[8px] text-red-500 font-bold uppercase mb-0.5">Red</div> <div className="text-xs font-bold text-red-200">{p.stats?.rejected || 0}</div> </div>
                     </div>
                     <div className="flex-1">
                        <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">Son İşlemler</div>
                        <div className="space-y-2">
                             {p.latest_requests && p.latest_requests.length > 0 ? (
                                 p.latest_requests.slice(0, 3).map(req => (
                                     <div key={req.id} className="bg-zinc-950/30 p-2 rounded-lg border border-white/5 group-hover:border-white/10 transition-colors">
                                         <div className="flex justify-between items-start mb-0.5">
                                             <span className="text-[10px] font-bold text-zinc-300 truncate w-2/3">{req.brand} {req.model}</span>
                                             <div className={`w-1.5 h-1.5 rounded-full mt-1 ${STATUS_OPTIONS.find(o=>o.value===req.status)?.color.split(' ')[0].replace('text-', 'bg-')}`}></div>
                                         </div>
                                         <div className="text-[9px] text-zinc-500 truncate flex items-center gap-1">
                                             <AlertTriangle className="w-2.5 h-2.5" /> {req.category}
                                         </div>
                                     </div>
                                 ))
                             ) : (
                                 <div className="text-[10px] text-zinc-600 italic py-2 text-center">İşlem geçmişi yok.</div>
                             )}
                        </div>
                     </div>
                 </div>
             ))}
         </div>
      )}

      {/* STOCK MANAGEMENT VIEW */}
      {activeTab === 'stock' && (
          <div className="space-y-6">
              <div className="flex justify-end">
                  <button onClick={() => { setStockForm({}); setShowStockModal(true); }} className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-xs uppercase tracking-widest shadow-lg shadow-amber-900/20">
                      <Plus className="w-4 h-4"/> Yeni Ürün Ekle
                  </button>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-zinc-900/50 p-4 rounded-xl border border-white/5">
                      <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Toplam Kalem</div>
                      <div className="text-2xl font-bold text-zinc-100">{inventory.length}</div>
                  </div>
                  <div className="bg-zinc-900/50 p-4 rounded-xl border border-white/5">
                      <div className="text-[10px] text-red-500 font-bold uppercase mb-1 flex items-center gap-2"><AlertCircle className="w-3 h-3"/> Kritik Stok</div>
                      <div className="text-2xl font-bold text-red-400">{inventory.filter(i => i.quantity <= i.critical_level).length}</div>
                  </div>
                  <div className="bg-zinc-900/50 p-4 rounded-xl border border-white/5">
                      <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Stok Değeri (Alış)</div>
                      <div className="text-2xl font-bold text-zinc-100">{analyticsData.totalStockValue.toLocaleString('tr-TR')} ₺</div>
                  </div>
                  <div className="bg-zinc-900/50 p-4 rounded-xl border border-white/5">
                      <div className="text-[10px] text-green-500 font-bold uppercase mb-1">Stok Değeri (Satış)</div>
                      <div className="text-2xl font-bold text-green-400">{analyticsData.potentialStockRevenue.toLocaleString('tr-TR')} ₺</div>
                  </div>
              </div>

              {/* Inventory Table */}
              <div className="bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                          <thead className="bg-zinc-950/50 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                              <tr>
                                  <th className="p-4">Ürün Adı</th>
                                  <th className="p-4 text-center">Durum</th>
                                  <th className="p-4">SKU / Konum</th>
                                  <th className="p-4 text-center">Stok</th>
                                  <th className="p-4 text-right">Fiyat</th>
                                  <th className="p-4 text-right">İşlem</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-xs text-zinc-300">
                              {inventory.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase())).map(item => (
                                  <tr key={item.id} onClick={() => handleEditInventory(item)} className="hover:bg-white/5 transition-colors group cursor-pointer">
                                      <td className="p-4">
                                          <div className="font-bold text-zinc-100">{item.name}</div>
                                          <div className="text-[10px] text-zinc-500">{item.category}</div>
                                          {item.notes && <div className="mt-1 text-[9px] text-zinc-400 flex items-center gap-1 italic truncate max-w-[150px]"><Info className="w-3 h-3"/> {item.notes}</div>}
                                      </td>
                                      <td className="p-4 text-center">
                                          {item.status && (
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${INVENTORY_STATUS_OPTIONS.find(o => o.value === item.status)?.color}`}>
                                                  {INVENTORY_STATUS_OPTIONS.find(o => o.value === item.status)?.label || item.status}
                                              </span>
                                          )}
                                      </td>
                                      <td className="p-4">
                                          <div className="font-mono text-zinc-400">{item.sku || '-'}</div>
                                          <div className="text-[9px] text-zinc-600">{item.shelf_location || 'Raf Yok'}</div>
                                      </td>
                                      <td className="p-4 text-center">
                                          <span className={`px-2 py-1 rounded-full font-bold text-[10px] ${item.quantity <= item.critical_level ? 'bg-red-900/20 text-red-500 border border-red-900/30' : 'bg-zinc-800 text-zinc-300'}`}>
                                              {item.quantity} ADET
                                          </span>
                                      </td>
                                      <td className="p-4 text-right">
                                          <div className="font-bold text-green-400">{item.sell_price} ₺</div>
                                          <div className="text-[9px] text-zinc-500">Maliyet: {item.buy_price} ₺</div>
                                      </td>
                                      <td className="p-4 text-right">
                                          <div className="flex items-center justify-end gap-2">
                                              <button 
                                                onClick={(e) => handleEditInventory(item, e)} 
                                                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
                                              >
                                                  <Edit3 className="w-4 h-4"/>
                                              </button>
                                              <button 
                                                onClick={(e) => handleDeleteClick(item.id, e)} 
                                                className="p-2 bg-zinc-800 hover:bg-red-900/20 rounded-lg text-zinc-400 hover:text-red-500 transition-colors z-10"
                                              >
                                                  <Trash2 className="w-4 h-4"/>
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                              {inventory.length === 0 && (
                                  <tr><td colSpan={6} className="p-8 text-center text-zinc-500 italic">Envanter boş.</td></tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {/* REPORTS VIEW - ENHANCED */}
      {activeTab === 'reports' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-900/20 to-zinc-900 p-6 rounded-2xl border border-green-500/10 shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-900/20 rounded-lg text-green-500"><DollarSign className="w-5 h-5"/></div>
                        <h3 className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Gerçekleşen Ciro</h3>
                    </div>
                    <div className="text-2xl font-bold text-zinc-100">{analyticsData.realizedRevenue.toLocaleString('tr-TR')} ₺</div>
                </div>
                <div className="bg-gradient-to-br from-amber-900/20 to-zinc-900 p-6 rounded-2xl border border-amber-500/10 shadow-lg">
                     <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-900/20 rounded-lg text-amber-500"><TrendingUp className="w-5 h-5"/></div>
                        <h3 className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Bekleyen Ciro</h3>
                    </div>
                    <div className="text-2xl font-bold text-zinc-100">{(analyticsData.totalEstimatedRevenue - analyticsData.realizedRevenue).toLocaleString('tr-TR')} ₺</div>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-white/5 shadow-lg">
                     <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-zinc-800 rounded-lg text-zinc-400"><Wrench className="w-5 h-5"/></div>
                        <h3 className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Toplam İşlem</h3>
                    </div>
                    <div className="text-2xl font-bold text-zinc-100">{analyticsData.totalRequests}</div>
                </div>
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-white/5 shadow-lg">
                     <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-900/20 rounded-lg text-blue-500"><Activity className="w-5 h-5"/></div>
                        <h3 className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Aktif İşler</h3>
                    </div>
                    <div className="text-2xl font-bold text-zinc-100">{requests.filter(r => !['completed','rejected','resolved','shipped'].includes(r.status)).length}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Financial Trend Chart */}
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-white/5 shadow-xl">
                    <h3 className="text-zinc-100 font-bold mb-6 text-xs uppercase tracking-widest flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-amber-500"/> Aylık Ciro Analizi
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={analyticsData.trendData}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="name" stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
                                <YAxis stroke="#666" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(val) => `${val/1000}k`} />
                                <RechartsTooltip 
                                    contentStyle={{backgroundColor: '#18181b', borderColor: '#333', borderRadius: '12px', fontSize: '12px'}} 
                                    itemStyle={{color:'#fff'}}
                                    formatter={(val: number) => [`${val.toLocaleString()} ₺`, 'Ciro']}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#f59e0b" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="bg-zinc-900/50 p-6 rounded-2xl border border-white/5 shadow-xl">
                    <h3 className="text-zinc-100 font-bold mb-6 text-xs uppercase tracking-widest flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-amber-500"/> İşlem Durum Dağılımı
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={analyticsData.statusData} 
                                    cx="50%" cy="50%" 
                                    innerRadius={80} 
                                    outerRadius={100} 
                                    paddingAngle={5} 
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {analyticsData.statusData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={entry.color} /> ))}
                                </Pie>
                                <RechartsTooltip contentStyle={{backgroundColor: '#18181b', borderColor: '#333', borderRadius: '12px', fontSize: '12px'}} itemStyle={{color:'#fff'}} />
                                <Legend wrapperStyle={{fontSize: '11px', textTransform: 'uppercase', paddingTop: '20px'}} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* --- MODALS --- */}
      
      {/* Delete Confirmation Modal */}
      {itemToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-zinc-900 p-6 rounded-3xl w-full max-w-sm border border-red-900/30 shadow-2xl scale-100">
                  <div className="w-12 h-12 rounded-full bg-red-900/20 flex items-center justify-center mb-4 mx-auto border border-red-500/20"> 
                      <Trash2 className="w-6 h-6 text-red-500"/> 
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2 text-center uppercase tracking-tighter">Silme Onayı</h3>
                  <p className="text-zinc-500 text-[11px] mb-6 text-center leading-relaxed">
                      Bu stok kaydı kalıcı olarak silinecektir.<br/>Bu işlem geri alınamaz. Devam etmek istiyor musunuz?
                  </p>
                  <div className="flex gap-3">
                      <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 text-xs font-bold transition-all uppercase tracking-widest">
                          Vazgeç
                      </button>
                      <button onClick={performDelete} className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-xl text-white text-xs font-bold transition-all uppercase tracking-widest shadow-lg shadow-red-900/20"> 
                          Evet, Sil
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* Stock Modal */}
      {showStockModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-zinc-900 w-full max-w-lg p-6 rounded-2xl border border-white/10 shadow-2xl my-8 animate-in zoom-in-95 duration-200">
                  <h3 className="text-lg font-bold text-zinc-100 mb-6 uppercase tracking-widest flex items-center gap-2">
                      <Package className="w-5 h-5 text-amber-500"/> {stockForm.id ? 'Ürün Düzenle' : 'Yeni Stok Ekle'}
                  </h3>
                  <form onSubmit={handleSaveStock} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Ürün Adı</label>
                              <input required value={stockForm.name} onChange={e => setStockForm({...stockForm, name: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-500/50" />
                          </div>
                          <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Kategori</label>
                              <select value={stockForm.category} onChange={e => setStockForm({...stockForm, category: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white outline-none">
                                  <option>Yedek Parça</option>
                                  <option>Sarf Malzeme</option>
                                  <option>Dövme Makinesi</option>
                                  <option>Güç Kaynağı</option>
                                  <option>Kablo / Pedal</option>
                                  <option>Diğer</option>
                              </select>
                          </div>
                           <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Ürün Durumu</label>
                              <select value={stockForm.status || 'new'} onChange={e => setStockForm({...stockForm, status: e.target.value as any})} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white outline-none">
                                  {INVENTORY_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">SKU / Kod</label>
                              <input value={stockForm.sku || ''} onChange={e => setStockForm({...stockForm, sku: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white outline-none" />
                          </div>
                          <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Stok Adedi</label>
                              <input type="number" required value={stockForm.quantity} onChange={e => setStockForm({...stockForm, quantity: parseInt(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white outline-none" />
                          </div>
                          <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block text-red-400">Kritik Seviye</label>
                              <input type="number" required value={stockForm.critical_level} onChange={e => setStockForm({...stockForm, critical_level: parseInt(e.target.value)})} className="w-full bg-zinc-950 border border-red-900/30 rounded-xl p-3 text-xs text-white focus:border-red-500 outline-none" />
                          </div>
                          <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Alış Fiyatı</label>
                              <input type="number" required value={stockForm.buy_price} onChange={e => setStockForm({...stockForm, buy_price: parseFloat(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white outline-none" />
                          </div>
                          <div>
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block text-green-500">Satış Fiyatı</label>
                              <input type="number" required value={stockForm.sell_price} onChange={e => setStockForm({...stockForm, sell_price: parseFloat(e.target.value)})} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white outline-none" />
                          </div>
                          <div className="col-span-2">
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Raf / Lokasyon</label>
                              <input value={stockForm.shelf_location || ''} onChange={e => setStockForm({...stockForm, shelf_location: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white outline-none" placeholder="Örn: A1 Rafı" />
                          </div>
                           <div className="col-span-2">
                              <label className="text-[10px] text-zinc-500 uppercase font-bold mb-1 block">Açıklama / Notlar</label>
                              <textarea rows={3} value={stockForm.notes || ''} onChange={e => setStockForm({...stockForm, notes: e.target.value})} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white outline-none resize-none" placeholder="Örn: Hurdaya ayrılma sebebi, arıza detayı..." />
                          </div>
                      </div>
                      <div className="flex justify-end gap-3 mt-6">
                          <button type="button" onClick={() => setShowStockModal(false)} className="px-4 py-3 rounded-xl bg-zinc-800 text-zinc-400 font-bold text-xs uppercase">Vazgeç</button>
                          <button type="submit" className="px-6 py-3 rounded-xl bg-amber-500 text-black font-bold text-xs uppercase shadow-lg shadow-amber-900/20">Kaydet</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* CUSTOMER CRM MODAL */}
      {selectedCustomer && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
              <div className="bg-zinc-950 w-[92%] max-w-4xl h-[85vh] rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-5 border-b border-white/5 bg-zinc-900/50 flex justify-between items-start">
                      <div className="flex items-center gap-5">
                          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-amber-500/20 shadow-lg text-zinc-500"> <User className="w-8 h-8" /> </div>
                          <div className="min-w-0">
                              <h2 className="text-xl font-bold text-zinc-100 uppercase tracking-tight truncate">{selectedCustomer.full_name}</h2>
                              <div className="flex flex-col gap-0.5 mt-1 text-xs text-zinc-400">
                                  <div className="flex items-center gap-2"><Mail className="w-3 h-3 text-zinc-600" /> {selectedCustomer.email || selectedCustomer.display_email}</div>
                                  <div className="flex items-center gap-2"><Phone className="w-3 h-3 text-zinc-600" /> {selectedCustomer.phone || selectedCustomer.display_phone}</div>
                              </div>
                          </div>
                      </div>
                      <button onClick={() => { setSelectedCustomer(null); document.body.style.overflow = 'auto'; }} className="p-1.5 hover:bg-zinc-800 rounded-full transition-colors"><X className="w-5 h-5 text-zinc-400" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5"> <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1 flex items-center gap-2"> <Layers className="w-3 h-3" /> Toplam </div> <div className="text-xl font-bold text-white">{customerSpecificData?.requests.length || 0}</div> </div>
                          <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5"> <div className="text-[10px] text-green-500 font-bold uppercase mb-1 flex items-center gap-2"> <CheckCircle className="w-3 h-3" /> Bitti </div> <div className="text-xl font-bold text-white">{selectedCustomer.stats.resolved}</div> </div>
                          <div className="bg-zinc-900/50 p-3 rounded-xl border border-white/5"> <div className="text-[10px] text-amber-500 font-bold uppercase mb-1 flex items-center gap-2"> <Activity className="w-3 h-3" /> Aktif </div> <div className="text-xl font-bold text-white">{selectedCustomer.stats.pending}</div> </div>
                          <div className="bg-zinc-900/50 p-3 rounded-xl border border-amber-500/20"> <div className="text-[10px] text-amber-500/80 font-bold uppercase mb-1 flex items-center gap-2"> <Wallet className="w-3 h-3" /> Harcama </div> <div className="text-xl font-bold text-white">{customerSpecificData?.totalSpend.toLocaleString('tr-TR')} TL</div> </div>
                      </div>
                      <div>
                          <h3 className="text-base font-bold text-zinc-200 mb-3 flex items-center gap-2 uppercase tracking-widest"><History className="w-4 h-4 text-amber-500" /> Talep Geçmişi</h3>
                          <div className="grid gap-2">
                              {customerSpecificData?.requests.length === 0 ? ( <div className="text-center py-10 border border-dashed border-white/10 rounded-xl text-zinc-500 text-sm uppercase tracking-widest">Kayıt bulunamadı.</div> ) : (
                                  customerSpecificData?.requests.map(req => (
                                      <div key={req.id} onClick={() => handleOpenDetail(req)} className="bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-amber-500/20 p-3 rounded-xl cursor-pointer transition-all flex items-center gap-3 group">
                                          <div className="w-8 h-8 rounded-lg bg-zinc-950 flex items-center justify-center text-zinc-500 border border-white/5 shrink-0"><Smartphone className="w-4 h-4" /></div>
                                          <div className="flex-1 min-w-0"> <div className="font-bold text-zinc-200 text-sm group-hover:text-amber-500 transition-colors truncate uppercase">{req.brand} {req.model}</div> <div className="text-[10px] text-zinc-600 font-mono tracking-tighter">#{String(req.id).slice(0,6)} • {new Date(req.created_at).toLocaleDateString()}</div> </div>
                                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${STATUS_OPTIONS.find(o=>o.value===req.status)?.color}`}> {STATUS_OPTIONS.find(o=>o.value===req.status)?.label} </span>
                                          <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-white transition-transform group-hover:translate-x-1" />
                                      </div>
                                  ))
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* REQUEST DETAIL MODAL - OPTIMIZED GRID */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 w-[95%] sm:w-[92%] max-w-4xl h-[90vh] sm:h-[85vh] rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header: Optimized for Mobile Stacking */}
                <div className="p-4 sm:p-5 border-b border-white/5 flex justify-between items-start bg-zinc-950">
                    <div className="flex-1 min-w-0 pr-2">
                        <h2 className="text-base sm:text-lg font-serif font-bold text-zinc-100 uppercase tracking-widest truncate">Talep Detayı <span className="text-zinc-600 font-mono text-xs sm:text-sm ml-1 sm:ml-2">#{String(selectedRequest.id).slice(0,8)}</span></h2>
                        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-3 text-[10px] sm:text-xs text-zinc-500 mt-1 uppercase tracking-tighter font-medium">
                            <span className="font-bold text-zinc-300 truncate">{selectedRequest.full_name}</span>
                            <div className="flex items-center gap-2">
                                <span className="hidden sm:inline opacity-30">|</span>
                                <span>{selectedRequest.phone}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={handleCloseDetail} className="p-1.5 bg-zinc-800/50 hover:bg-zinc-800 rounded-full transition-all text-zinc-400 shrink-0"><X className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                </div>

                {/* Tab Switcher: Full Width Buttons */}
                <div className="flex border-b border-white/5 bg-zinc-900/50 shrink-0">
                    <button onClick={() => setActiveDetailTab('info')} className={`flex-1 py-3 sm:py-3.5 text-[10px] sm:text-xs font-bold transition-all border-b-2 uppercase tracking-widest ${activeDetailTab === 'info' ? 'text-amber-500 border-amber-500 bg-zinc-800/30' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2"><Info className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> BİLGİLER</div>
                    </button>
                    <button onClick={() => setActiveDetailTab('chat')} className={`flex-1 py-3 sm:py-3.5 text-[10px] sm:text-xs font-bold transition-all border-b-2 uppercase tracking-widest ${activeDetailTab === 'chat' ? 'text-amber-500 border-amber-500 bg-zinc-800/30' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2"><MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> MESAJLAR</div>
                    </button>
                </div>
                
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    {activeDetailTab === 'info' && (
                        <div className="absolute inset-0 overflow-y-auto p-4 sm:p-5 space-y-5 sm:space-y-6 bg-zinc-900/50 animate-in fade-in slide-in-from-left-4 duration-300 custom-scrollbar">
                            
                            {/* TOP ACTION GRID */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-start">
                                {/* Left Section: Update Form */}
                                <div className="lg:col-span-2 space-y-4 p-4 sm:p-5 bg-zinc-950/40 border border-white/5 rounded-xl sm:rounded-2xl shadow-inner">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">İşlem Durumu</label>
                                            <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value as RequestStatus})} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg sm:rounded-xl p-3 text-zinc-200 text-xs focus:border-amber-500/50 transition-all outline-none">
                                                {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Servis Bedeli</label>
                                            <div className="flex gap-2">
                                                <input type="number" value={editForm.estimated_cost} onChange={e => setEditForm({...editForm, estimated_cost: parseFloat(e.target.value)})} className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg sm:rounded-xl p-3 text-zinc-200 text-xs focus:border-amber-500/50 outline-none transition-all" />
                                                <select value={editForm.currency} onChange={e => setEditForm({...editForm, currency: e.target.value})} className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg sm:rounded-xl p-3 text-zinc-200 text-xs outline-none">
                                                    <option>TL</option><option>USD</option><option>EUR</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {['shipped'].includes(editForm.status) && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-zinc-900/50 border border-white/5 rounded-xl animate-in fade-in slide-in-from-top-2">
                                            <div className="space-y-1"> <label className="text-[9px] font-bold text-zinc-600 uppercase ml-1">Kargo Firması</label> <input type="text" placeholder="Firma Adı" value={editForm.shipping_company} onChange={e => setEditForm({...editForm, shipping_company: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs" /> </div>
                                            <div className="space-y-1"> <label className="text-[9px] font-bold text-zinc-600 uppercase ml-1">Takip Numarası</label> <input type="text" placeholder="Takip No" value={editForm.shipping_tracking_code} onChange={e => setEditForm({...editForm, shipping_tracking_code: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs" /> </div>
                                        </div>
                                    )}

                                    <button onClick={handleSaveChanges} className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-3.5 rounded-xl transition-all text-xs uppercase tracking-widest shadow-lg shadow-white/5 active:scale-95"> Değişiklikleri Kaydet </button>
                                </div>

                                {/* Right Section: Quick Actions Card */}
                                <div className="space-y-3 p-4 sm:p-5 bg-zinc-950/40 border border-white/5 rounded-xl sm:rounded-2xl shadow-inner">
                                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-2 mb-2">Hızlı Aksiyonlar</h4>
                                    <button onClick={handlePreviewPdf} disabled={isGeneratingPdf} className="w-full flex items-center justify-center gap-3 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 font-bold py-3 rounded-xl transition-all text-xs uppercase tracking-widest">
                                        {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> : <FileText className="w-4 h-4" />} SERVİS FORMU (PDF)
                                    </button>
                                    <button onClick={() => setShowRejectModal(true)} className="w-full text-red-400 hover:text-red-300 text-[10px] font-bold py-2.5 flex items-center justify-center gap-2 border border-red-900/20 rounded-xl hover:bg-red-900/10 transition-all uppercase tracking-widest mt-2">
                                        <XCircle className="w-4 h-4" /> Talebi Reddet
                                    </button>
                                    <p className="text-[9px] text-zinc-600 text-center uppercase tracking-tighter leading-tight mt-1">Müşteri bilgilendirilecektir.</p>
                                </div>
                            </div>
                            
                            {/* Device Info Card */}
                            <div className="bg-zinc-950/20 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-white/5 space-y-4 sm:space-y-5">
                                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                                    <Smartphone className="w-4 h-4 text-amber-500" />
                                    <h4 className="font-bold text-zinc-300 text-[11px] uppercase tracking-widest">Cihaz ve Arıza Detayları</h4>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 px-1">
                                    <div className="space-y-1"><span className="text-zinc-600 text-[9px] sm:text-[10px] block uppercase font-bold tracking-tighter">Marka</span> <span className="text-zinc-200 text-xs sm:text-sm font-bold uppercase">{selectedRequest.brand}</span></div>
                                    <div className="space-y-1"><span className="text-zinc-600 text-[9px] sm:text-[10px] block uppercase font-bold tracking-tighter">Model</span> <span className="text-zinc-200 text-xs sm:text-sm font-bold uppercase">{selectedRequest.model}</span></div>
                                    <div className="space-y-1"><span className="text-zinc-600 text-[9px] sm:text-[10px] block uppercase font-bold tracking-tighter">Kategori</span> <span className="text-zinc-200 text-xs sm:text-sm font-bold uppercase tracking-tight">{selectedRequest.category}</span></div>
                                </div>
                                
                                <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 sm:p-5 relative">
                                    <div className="absolute top-0 right-0 p-3 opacity-10"><AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-amber-500" /></div>
                                    <h5 className="text-amber-500 text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-2"> <Activity className="w-3.5 h-3.5" /> Müşteri Şikayeti </h5>
                                    <p className="text-amber-100/80 text-xs leading-relaxed italic relative z-10 whitespace-pre-wrap">"{selectedRequest.description}"</p>
                                </div>
                            </div>

                            {/* Media Gallery */}
                            {selectedRequest.media_urls && selectedRequest.media_urls.length > 0 && (
                                <div className="bg-zinc-950/20 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-white/5 space-y-4">
                                    <h4 className="font-bold text-zinc-400 text-[10px] uppercase tracking-widest flex items-center gap-2 border-b border-white/5 pb-2"><ImageIcon className="w-3.5 h-3.5 text-zinc-500"/> Galeri</h4>
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5 sm:gap-3">
                                        {selectedRequest.media_urls.map((media, i) => (
                                            <div key={i} className="aspect-square bg-black rounded-lg overflow-hidden border border-white/10 relative group cursor-pointer hover:border-amber-500/40 transition-all shadow-lg" onClick={() => setLightboxMedia(media)}>
                                                {media.type === 'video' ? (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/60"><Play className="w-5 h-5 sm:w-6 sm:h-6 text-white opacity-70" /></div>
                                                ) : (
                                                    <img src={media.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" alt="attachment" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeDetailTab === 'chat' && (
                        <div className="absolute inset-0 flex flex-col bg-zinc-950 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar" ref={notesContainerRef}>
                                 {notes.length === 0 && ( <div className="flex flex-col items-center justify-center h-full opacity-20"> <MessageCircle className="w-12 h-12 sm:w-16 sm:h-16 mb-2" /> <p className="text-xs uppercase tracking-widest font-bold">Henüz mesaj yok.</p> </div> )}
                                 {notes.map(note => (
                                     <div key={note.id} className={`flex ${note.author_id === session?.user?.id ? 'justify-end' : 'justify-start'}`}>
                                         <div className={`max-w-[92%] sm:max-w-[80%] p-3 sm:p-3.5 rounded-2xl shadow-xl ${note.author_id === session?.user?.id ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-tr-none' : 'bg-zinc-800 text-zinc-200 rounded-tl-none border border-white/5'}`}>
                                             {note.media_url && (
                                                 <div className="mb-2.5 rounded-lg overflow-hidden cursor-pointer border border-white/10 shadow-lg" onClick={() => setLightboxMedia({ url: note.media_url!, type: note.media_type || 'image' })}>
                                                     {note.media_type === 'image' ? <img src={note.media_url} className="max-w-full h-auto" alt="attachment" /> : <div className="bg-black/50 p-6 flex items-center justify-center"><Play className="w-8 h-8 text-white"/></div>}
                                                 </div>
                                             )}
                                             <p className="text-xs leading-relaxed whitespace-pre-wrap">{note.note}</p>
                                             <div className="text-[8px] sm:text-[9px] opacity-40 mt-2 flex justify-between gap-4 pt-1.5 border-t border-white/5 uppercase tracking-tighter font-bold">
                                                 <span>{note.author?.full_name}</span>
                                                 <span>{new Date(note.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                             </div>
                                         </div>
                                     </div>
                                 ))}
                            </div>
                            <div className="p-3 sm:p-4 bg-zinc-900 border-t border-white/5 shadow-2xl shrink-0">
                                <form onSubmit={handleAddNote} className="flex gap-2">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 sm:p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg sm:rounded-xl transition-all shadow-md active:scale-90"><Paperclip className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                                    <input type="file" ref={fileInputRef} onChange={e => setNoteFile(e.target.files?.[0] || null)} className="hidden" />
                                    <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Mesaj yazın..." className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg sm:rounded-xl px-3 sm:px-5 text-sm text-zinc-100 outline-none focus:border-amber-500/50 transition-all shadow-inner" />
                                    <button type="submit" disabled={isSendingNote} className="p-2.5 sm:p-3 bg-amber-500 hover:bg-amber-400 text-black rounded-lg sm:rounded-xl font-bold transition-all shadow-lg active:scale-90 disabled:opacity-50">{isSendingNote ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Send className="w-4 h-4 sm:w-5 sm:h-5" />}</button>
                                </form>
                                {noteFile && <div className="text-[8px] sm:text-[9px] text-amber-500 mt-2 px-2 truncate font-bold uppercase tracking-widest">Dosya: {noteFile.name}</div>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
      
      {/* Reject Modal */}
      {showRejectModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
              <div className="bg-zinc-900 p-6 rounded-3xl w-full max-w-sm border border-red-900/30 shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="w-12 h-12 rounded-full bg-red-900/20 flex items-center justify-center mb-4 mx-auto border border-red-500/20"> <AlertTriangle className="w-6 h-6 text-red-500"/> </div>
                  <h3 className="text-lg font-bold text-white mb-2 text-center uppercase tracking-tighter">Talebi Reddet</h3>
                  <p className="text-zinc-500 text-[10px] mb-5 text-center leading-relaxed uppercase tracking-tight">Bu işlem kalıcıdır ve müşteriye anında bildirim olarak düşer. Lütfen geçerli bir sebep belirtin.</p>
                  <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} placeholder="Reddetme nedeni (Müşteri görecektir)..." className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-100 mb-6 h-28 resize-none outline-none focus:border-red-500/50 transition-all shadow-inner" />
                  <div className="flex gap-3">
                      <button onClick={() => setShowRejectModal(false)} className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 text-xs font-bold transition-all uppercase tracking-widest">Vazgeç</button>
                      <button onClick={handleRejectSubmit} disabled={isRejecting} className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-xl text-white text-xs font-bold transition-all uppercase tracking-widest shadow-lg shadow-red-900/20 disabled:opacity-50"> {isRejecting ? 'Reddediliyor...' : 'Onayla ve Reddet'} </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* Lightbox Overlay */}
      {lightboxMedia && (
         <div className="fixed inset-0 z-[100] bg-black/98 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setLightboxMedia(null)}>
             <button className="absolute top-6 right-6 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-white transition-all shadow-2xl"><X className="w-8 h-8" /></button>
             {lightboxMedia.type === 'image' ? (
                 <img src={lightboxMedia.url} className="max-w-[95%] max-h-[85vh] object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-lg" alt="preview" />
             ) : (
                 <video src={lightboxMedia.url} controls autoPlay className="max-w-[95%] max-h-[85vh] rounded-lg shadow-2xl" />
             )}
         </div>
      )}
    </div>
  );
};

export default AdminDashboard;
