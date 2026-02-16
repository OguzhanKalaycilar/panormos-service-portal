
export interface Profile {
  id: string;
  email?: string;
  full_name?: string;
  phone?: string;
  role: 'admin' | 'customer';
  has_seen_guide?: boolean;
  created_at?: string;
}

export interface ProfileWithStats extends Profile {
  request_count: number;
}

export type RequestStatus = 
  | 'pending'           // Bekliyor
  | 'diagnosing'        // İnceleniyor
  | 'pending_approval'  // Fiyat Onayı Bekliyor
  | 'approved'          // Onaylandı / İşlemde
  | 'waiting_parts'     // Yedek Parça Bekleniyor
  | 'resolved'          // Tamamlandı
  | 'shipped'           // Kargolandı
  | 'rejected'          // İptal / Red
  | 'completed';        // Teslim Edildi / Bitti

export interface ServiceRequest {
  id: string | number; // Updated to support UUIDs
  created_at: string;
  user_id: string; // Linked to auth.users
  full_name: string;
  email: string;
  phone: string;
  brand: string;
  model: string;
  category: string;
  product_date: string;
  description: string;
  media_urls: MediaItem[];
  status: RequestStatus; 
  rejection_reason?: string;
  
  // New Fields
  estimated_cost?: number;
  currency?: string;
  approved_by_customer?: boolean;
  shipping_company?: string;
  shipping_tracking_code?: string;
}

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  path: string;
}

export interface ServiceNote {
  id: number | string; // Updated
  created_at: string;
  request_id: number | string; // Updated
  note: string;
  media_url?: string;
  media_type?: 'image' | 'video';
  author_id?: string;
  author?: {
    role: 'admin' | 'customer';
    full_name: string;
  };
}

export interface ServiceFormData {
  brand: string;
  model: string;
  category: string;
  product_date: string;
  description: string;
  photos: FileList;
  videos: FileList;
}

// NEW: Professional Inventory Item
export interface InventoryItem {
  id: string;
  created_at: string;
  name: string;
  category: string;
  sku?: string;
  quantity: number;
  critical_level: number;
  buy_price: number;
  sell_price: number;
  shelf_location?: string;
  status: 'new' | 'used' | 'refurbished' | 'defective' | 'scrap'; // Added status
  notes?: string; // Added notes
}

// Deprecated but kept for type safety if needed temporarily
export interface BrokenStockItem {
  id: number;
  created_at: string;
  brand: string;
  model: string;
  quantity: number;
  cosmetic_condition: string;
  failure_reason: string;
  missing_parts: string;
  notes: string;
  status: 'waiting' | 'in_repair' | 'ready' | 'scrapped';
}

export interface Notification {
  id: string;
  created_at: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  is_read: boolean;
  metadata?: any;
}
