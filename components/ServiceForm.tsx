import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Upload, FileVideo, FileImage, Loader2, AlertCircle, CheckCircle2, ArrowLeft, Tag, Calendar, AlertTriangle, Layers, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { sendServiceRequestEmail } from '../lib/email';
import { MediaItem } from '../types';
import { useAuth } from '../lib/AuthContext';

// Validation Schema
const serviceSchema = z.object({
  brand: z.string().min(1, "Ürün markası gereklidir."),
  model: z.string().min(1, "Ürün modeli gereklidir."),
  category: z.string().min(1, "Lütfen bir arıza kategorisi seçiniz."),
  product_date: z.string().min(1, "Ürün alım tarihi gereklidir."),
  description: z.string().min(20, "Lütfen sorunu detaylı açıklayınız (en az 20 karakter)."),
  photos: z.custom<FileList>()
    .refine((files) => files && files.length > 0, "En az 1 fotoğraf yüklemelisiniz.")
    .refine((files) => {
        if (!files) return false;
        return Array.from(files).every((file: File) => file.type.startsWith('image/'));
    }, "Sadece resim dosyaları yüklenebilir."),
  videos: z.custom<FileList>()
    .refine((files) => files && files.length > 0, "En az 1 video yüklemelisiniz.")
    .refine((files) => {
        if (!files) return false;
        return Array.from(files).every((file: File) => file.type.startsWith('video/'));
    }, "Sadece video dosyaları yüklenebilir.")
    .refine((files) => {
        if (!files) return false;
        // 100MB limit per file
        return Array.from(files).every((file: File) => file.size <= 100 * 1024 * 1024);
    }, "Video boyutu 100MB'dan küçük olmalıdır.")
});

type ServiceSchemaType = z.infer<typeof serviceSchema>;

const CATEGORIES = [
  "Motor Arızası (Isınma/Ses)",
  "Bağlantı/Soket Sorunu",
  "Batarya/Güç Sorunu",
  "Vuruş/Hız Düzensizliği",
  "Dış Kasa/Mekanik Hasar",
  "Mürekkep Kaçması (Ink Ingress)",
  "Diğer"
];

const ServiceForm: React.FC = () => {
  const { profile, session } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  
  const [selectedPhotoNames, setSelectedPhotoNames] = useState<string[]>([]);
  const [selectedVideoNames, setSelectedVideoNames] = useState<string[]>([]);

  const { register, handleSubmit, reset, formState: { errors, isValid } } = useForm<ServiceSchemaType>({
    resolver: zodResolver(serviceSchema),
    mode: 'onChange' // Validate on change to enable/disable button
  });

  const uploadFile = async (file: File, bucket: string): Promise<{ path: string; url: string } | null> => {
    if (!session?.user?.id) return null;

    try {
      // 1. Sanitize Filename: Remove special characters, spaces, etc.
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const cleanFileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${fileExt}`;
      
      // 2. Construct Path: Ensure it is strictly "userId/filename" to match typical RLS owner policies
      const filePath = `${session.user.id}/${cleanFileName}`; 

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

      if (error) {
        console.error('Supabase Storage Upload Error:', error);
        throw error;
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      return { path: filePath, url: publicUrl };
    } catch (error: any) {
      console.error('File Upload Exception:', error);
      toast.error(`Yükleme hatası: ${error.message || 'Bilinmeyen hata'}`);
      return null;
    }
  };

  const onSubmit = async (data: ServiceSchemaType) => {
    if (!profile || !session) {
        toast.error('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
        return;
    }

    setIsSubmitting(true);
    setUploadProgress('Dosyalar hazırlanıyor...');
    const mediaItems: MediaItem[] = [];

    try {
      // 1. Upload Photos
      if (data.photos && data.photos.length > 0) {
        for (let i = 0; i < data.photos.length; i++) {
            setUploadProgress(`Fotoğraf ${i + 1} / ${data.photos.length} yükleniyor...`);
            const result = await uploadFile(data.photos[i], 'service-media');
            if (result) {
                mediaItems.push({ type: 'image', ...result });
            } else {
                throw new Error(`Fotoğraf ${i + 1} yüklenemedi. İşlem durduruldu.`);
            }
        }
      }

      // 2. Upload Videos
      if (data.videos && data.videos.length > 0) {
        for (let i = 0; i < data.videos.length; i++) {
            setUploadProgress(`Video ${i + 1} / ${data.videos.length} yükleniyor...`);
            const result = await uploadFile(data.videos[i], 'service-media');
            if (result) {
                mediaItems.push({ type: 'video', ...result });
            } else {
                throw new Error(`Video ${i + 1} yüklenemedi. İşlem durduruldu.`);
            }
        }
      }

      if (mediaItems.length === 0) {
        throw new Error("Hiçbir dosya yüklenemedi. Lütfen tekrar deneyin.");
      }

      setUploadProgress('Kayıt oluşturuluyor...');

      // 3. Save Record to Database (using Auth data)
      const { error: dbError } = await supabase
        .from('service_requests')
        .insert({
            user_id: session.user.id, 
            full_name: profile.full_name,
            email: profile.email || session.user.email,
            phone: profile.phone || session.user.user_metadata.phone,
            brand: data.brand,
            model: data.model,
            category: data.category,
            product_date: data.product_date,
            description: data.description,
            media_urls: mediaItems,
            status: 'pending'
        });

      if (dbError) throw dbError;

      // 4. Send Email Notification
      setUploadProgress('Bildirim gönderiliyor...');
      await sendServiceRequestEmail({
        full_name: profile.full_name,
        email: profile.email || session.user.email || '',
        phone: profile.phone || session.user.user_metadata.phone || '',
        brand: data.brand,
        model: data.model,
        product_date: data.product_date,
        description: data.description
      });

      toast.success('Talebiniz başarıyla oluşturuldu!');
      
      reset();
      setSelectedPhotoNames([]);
      setSelectedVideoNames([]);
      setTimeout(() => {
        window.location.hash = '#/my-requests';
      }, 1500);

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <button 
        onClick={() => window.location.hash = '#/my-requests'}
        className="mb-8 flex items-center gap-2 text-zinc-500 hover:text-zinc-200 transition-colors text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" /> Taleplerime Dön
      </button>

      <div className="mb-8 text-center md:text-left">
        <h2 className="text-3xl font-serif font-bold text-zinc-100 mb-2 tracking-tight">Yeni Servis Talebi</h2>
        {/* User Info Header */}
        <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between mt-6 glass-panel p-6 rounded-2xl border border-amber-500/20 bg-zinc-900/40">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-amber-500 border border-zinc-700">
                    <User className="w-6 h-6" />
                </div>
                <div>
                   <div className="text-zinc-100 font-bold text-lg">{profile?.full_name || session?.user.user_metadata.full_name}</div>
                   <div className="text-zinc-500 text-xs uppercase tracking-wider">Müşteri Bilgileri</div>
                </div>
            </div>
            <div className="flex flex-col md:items-end gap-1 text-sm text-zinc-400">
                <span className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {profile?.email || session?.user.email}</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> {profile?.phone || session?.user.user_metadata.phone || '-'}</span>
            </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="glass-panel p-8 md:p-12 rounded-3xl shadow-2xl space-y-8">
        
        {/* Brand & Model Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2 relative">
                <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1 flex items-center gap-2">
                   <Tag className="w-3 h-3" /> Ürün Markası
                </label>
                <input
                    {...register('brand')}
                    type="text"
                    placeholder="Örn: Panormos"
                    className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                />
                {errors.brand && <p className="text-red-400 text-xs flex items-center gap-1 mt-2"><AlertCircle className="w-3 h-3"/> {errors.brand.message}</p>}
            </div>

            <div className="space-y-2 relative">
                <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1 flex items-center gap-2">
                    <Tag className="w-3 h-3" /> Ürün Modeli
                </label>
                <input
                    {...register('model')}
                    type="text"
                    placeholder="Örn: Pen Machine V2"
                    className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                />
                {errors.model && <p className="text-red-400 text-xs flex items-center gap-1 mt-2"><AlertCircle className="w-3 h-3"/> {errors.model.message}</p>}
            </div>
        </div>
        
        {/* Category & Date Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2 relative">
                <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1 flex items-center gap-2">
                    <Layers className="w-3 h-3" /> Sorun Kategorisi
                </label>
                <select
                    {...register('category')}
                    className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all appearance-none"
                >
                    <option value="">Seçiniz...</option>
                    {CATEGORIES.map((cat, i) => (
                        <option key={i} value={cat} className="bg-zinc-900 text-zinc-200">{cat}</option>
                    ))}
                </select>
                {errors.category && <p className="text-red-400 text-xs flex items-center gap-1 mt-2"><AlertCircle className="w-3 h-3"/> {errors.category.message}</p>}
            </div>

            <div className="space-y-2 relative">
              <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1 flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Ürün Alım Tarihi
              </label>
              <input
                {...register('product_date')}
                type="date"
                className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all [color-scheme:dark]"
              />
              {errors.product_date && <p className="text-red-400 text-xs flex items-center gap-1 mt-2"><AlertCircle className="w-3 h-3"/> {errors.product_date.message}</p>}
            </div>
        </div>

        {/* Description */}
        <div className="space-y-2 relative">
          <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1 flex items-center gap-2">
            <AlertTriangle className="w-3 h-3" /> Sorun Açıklaması
          </label>
          <textarea
            {...register('description')}
            rows={6}
            className="w-full bg-zinc-950/50 border border-zinc-700 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all resize-none leading-relaxed"
            placeholder="Lütfen yaşadığınız sorunu detaylı bir şekilde anlatınız..."
          />
          {errors.description && <p className="text-red-400 text-xs flex items-center gap-1 mt-2"><AlertCircle className="w-3 h-3"/> {errors.description.message}</p>}
        </div>

        {/* Media Upload Area */}
        <div className="pt-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Custom Photo Upload */}
          <div className="space-y-3">
             <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1 flex items-center gap-2">
                <FileImage className="w-4 h-4" /> Fotoğraf (Min. 1)
             </label>
             <div className="relative group cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  {...register('photos', {
                    onChange: (e) => {
                      if (e.target.files) setSelectedPhotoNames(Array.from(e.target.files).map((f: File) => f.name));
                    }
                  })}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all bg-zinc-900/50 ${errors.photos ? 'border-red-500/30 bg-red-900/10' : 'border-zinc-700 group-hover:border-amber-500/40 group-hover:bg-zinc-900'}`}>
                   <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg">
                      <Upload className="w-6 h-6 text-amber-500" />
                   </div>
                   <span className="text-sm text-zinc-400 text-center font-medium group-hover:text-zinc-300">Fotoğrafları Seçin veya Sürükleyin</span>
                </div>
             </div>
             {selectedPhotoNames.length > 0 && (
                <div className="bg-zinc-950/50 rounded-lg p-3 border border-white/5 space-y-2">
                   {selectedPhotoNames.map((name, i) => (
                      <div key={i} className="text-xs text-green-400 flex items-center gap-2 truncate"><CheckCircle2 className="w-3 h-3 flex-shrink-0" /> {name}</div>
                   ))}
                </div>
             )}
             {errors.photos && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {errors.photos.message as string}</p>}
          </div>

          {/* Custom Video Upload */}
          <div className="space-y-3">
             <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold ml-1 flex items-center gap-2">
                <FileVideo className="w-4 h-4" /> Video (Min. 1, Max 100MB)
             </label>
             <div className="relative group cursor-pointer">
                <input
                  type="file"
                  accept="video/*"
                  multiple
                  {...register('videos', {
                     onChange: (e) => {
                        if (e.target.files) setSelectedVideoNames(Array.from(e.target.files).map((f: File) => f.name));
                     }
                  })}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all bg-zinc-900/50 ${errors.videos ? 'border-red-500/30 bg-red-900/10' : 'border-zinc-700 group-hover:border-amber-500/40 group-hover:bg-zinc-900'}`}>
                   <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg">
                      <Upload className="w-6 h-6 text-amber-500" />
                   </div>
                   <span className="text-sm text-zinc-400 text-center font-medium group-hover:text-zinc-300">Videoları Seçin veya Sürükleyin</span>
                </div>
             </div>
             {selectedVideoNames.length > 0 && (
                <div className="bg-zinc-950/50 rounded-lg p-3 border border-white/5 space-y-2">
                   {selectedVideoNames.map((name, i) => (
                      <div key={i} className="text-xs text-green-400 flex items-center gap-2 truncate"><CheckCircle2 className="w-3 h-3 flex-shrink-0" /> {name}</div>
                   ))}
                </div>
             )}
             {errors.videos && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {errors.videos.message as string}</p>}
          </div>
        </div>

        <div className="pt-8">
          <button
            type="submit"
            disabled={isSubmitting || !isValid}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-5 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-amber-900/20 hover:shadow-amber-900/40 hover:-translate-y-0.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="uppercase tracking-wider text-sm font-semibold">{uploadProgress || 'İşleniyor...'}</span>
              </>
            ) : (
              <>
                <span className="uppercase tracking-widest text-sm font-bold">Talep Oluştur</span>
                <CheckCircle2 className="w-5 h-5" />
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};

export default ServiceForm;