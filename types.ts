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

export interface ServiceRequest {
  id: number;
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
  status: 'pending' | 'resolved' | 'rejected';
  rejection_reason?: string;
}

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  path: string;
}

export interface ServiceNote {
  id: number;
  created_at: string;
  request_id: number;
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