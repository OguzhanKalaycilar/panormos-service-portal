
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Notification } from '../types';
import { Bell, Check, Trash2, Info, CheckCircle, AlertTriangle, Truck, MessageSquare, X, Volume2, VolumeX } from 'lucide-react';
import toast from 'react-hot-toast';

// Simple "Pop" sound for notifications
const POP_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

const NotificationCenter: React.FC = () => {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Volume State with Persistence
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('notification_volume');
    return saved !== null ? parseFloat(saved) : 0.4;
  });

  // Initialize Audio
  useEffect(() => {
    audioRef.current = new Audio(POP_SOUND);
  }, []);

  // Update volume when state changes
  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = volume;
    }
    localStorage.setItem('notification_volume', volume.toString());
  }, [volume]);

  const playSound = () => {
    if (audioRef.current && volume > 0) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.log("Audio play blocked", e));
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch & Subscribe
  useEffect(() => {
    if (!session?.user?.id) return;

    // Initial Fetch
    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (data) setNotifications(data as Notification[]);
    };

    fetchNotifications();

    // Setup Realtime
    const channel = supabase.channel(`notifications:${session.user.id}`)
      .on(
        'postgres_changes',
        { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications', 
            filter: `user_id=eq.${session.user.id}` 
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev]);
          playSound(); // Audio Feedback
          
          // Show toast notification
          toast(newNotif.title, {
             icon: newNotif.type === 'success' ? '✅' : '🔔',
             style: { 
                 background: '#18181b', 
                 color: '#fff', 
                 border: '1px solid rgba(255,255,255,0.1)',
                 padding: '16px',
                 fontSize: '14px'
             },
             duration: 4000
          });
        }
      )
      .on(
        'postgres_changes',
        { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'notifications', 
            filter: `user_id=eq.${session.user.id}` 
        },
        (payload) => {
           const updated = payload.new as Notification;
           setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', session?.user?.id);
  };

  const deleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  };

  const getIcon = (type: string, title: string) => {
      if (title.includes('Kargo') || type === 'shipped') return <Truck className="w-4 h-4 text-cyan-400" />;
      if (title.includes('Mesaj') || title.includes('Not')) return <MessageSquare className="w-4 h-4 text-amber-500" />;
      if (type === 'success') return <CheckCircle className="w-4 h-4 text-green-400" />;
      if (type === 'warning' || type === 'error') return <AlertTriangle className="w-4 h-4 text-red-400" />;
      return <Info className="w-4 h-4 text-blue-400" />;
  };

  const handleNotificationClick = (notif: Notification) => {
      markAsRead(notif.id);
      if (notif.link) {
          // Update hash to navigate
          window.location.hash = notif.link;
      }
      setIsOpen(false); // Close dropdown menu
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 md:p-2.5 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-amber-500 rounded-lg transition-all border border-white/5 active:scale-95"
      >
        <Bell className="w-4 h-4 md:w-5 md:h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow-lg shadow-red-900/50 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div 
            ref={dropdownRef}
            className="absolute right-0 mt-3 w-80 md:w-96 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100] origin-top-right animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-center justify-between p-4 border-b border-white/5 bg-zinc-900/50">
             <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2">
                Bildirimler 
                {unreadCount > 0 && <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-md text-[10px]">{unreadCount}</span>}
             </h3>
             {unreadCount > 0 && (
                 <button onClick={markAllRead} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-colors">
                    <Check className="w-3 h-3" /> Tümünü Okundu Say
                 </button>
             )}
          </div>

          <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
             {notifications.length === 0 ? (
                 <div className="p-8 text-center text-zinc-500">
                     <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                     <p className="text-xs">Bildiriminiz bulunmuyor.</p>
                 </div>
             ) : (
                 <div className="divide-y divide-white/5">
                     {notifications.map(notif => (
                         <div 
                            key={notif.id} 
                            className={`p-4 hover:bg-white/5 transition-colors relative group cursor-pointer ${notif.is_read ? 'opacity-60 hover:opacity-100' : 'bg-amber-500/5'}`}
                            onClick={() => handleNotificationClick(notif)}
                         >
                            <div className="flex gap-3">
                                <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/5 ${notif.is_read ? 'bg-zinc-900' : 'bg-zinc-800 shadow-lg shadow-black/50'}`}>
                                    {getIcon(notif.type, notif.title)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className={`text-sm mb-0.5 ${notif.is_read ? 'font-medium text-zinc-300' : 'font-bold text-zinc-100'}`}>
                                        {notif.title}
                                    </h4>
                                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                                        {notif.message}
                                    </p>
                                    <span className="text-[9px] text-zinc-600 font-mono mt-1.5 block uppercase tracking-wide">
                                        {new Date(notif.created_at).toLocaleString('tr-TR')}
                                    </span>
                                </div>
                                {!notif.is_read && (
                                    <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-2 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
                                )}
                                <button 
                                    onClick={(e) => deleteNotification(notif.id, e)}
                                    className="absolute top-2 right-2 p-1.5 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    title="Sil"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                         </div>
                     ))}
                 </div>
             )}
          </div>
          
          <div className="p-3 border-t border-white/5 bg-zinc-900/80 backdrop-blur-sm flex items-center gap-3">
              <button 
                  onClick={() => setVolume(v => v === 0 ? 0.4 : 0)} 
                  title={volume === 0 ? "Sesi Aç" : "Sessize Al"}
                  className="focus:outline-none"
              >
                {volume === 0 ? 
                    <VolumeX className="w-4 h-4 text-zinc-500 hover:text-zinc-300 transition-colors" /> : 
                    <Volume2 className="w-4 h-4 text-zinc-400 hover:text-amber-500 transition-colors" />
                }
              </button>
              <div className="flex-1 flex items-center gap-3">
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    value={volume} 
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                  <span className="text-[9px] text-zinc-500 font-mono w-8 text-right">
                      {(volume * 100).toFixed(0)}%
                  </span>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
