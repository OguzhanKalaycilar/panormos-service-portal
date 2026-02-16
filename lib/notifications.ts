
import { supabase } from './supabase';
import toast from 'react-hot-toast';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * Sends a notification to a specific user.
 */
export const sendNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'info',
  link?: string
) => {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      link,
      is_read: false
    });

    if (error) throw error;
    return true;
  } catch (error: any) {
    console.error('Failed to send notification:', error);
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
        toast.error("Bildirim tablosu bulunamadı. Lütfen 'db_fix.sql' dosyasını Supabase SQL editöründe çalıştırın.");
    }
    return false;
  }
};

/**
 * Sends a notification to all users with the 'admin' role.
 */
export const notifyAdmins = async (
  title: string,
  message: string,
  type: NotificationType = 'info',
  link: string = '#/admin-dashboard'
) => {
  try {
    // 1. Fetch all admin IDs
    const { data: admins, error: fetchError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    if (fetchError) throw fetchError;
    if (!admins || admins.length === 0) return false;

    // 2. Prepare bulk insert payload
    const notifications = admins.map(admin => ({
      user_id: admin.id,
      title,
      message,
      type,
      link,
      is_read: false
    }));

    // 3. Bulk insert
    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) throw insertError;
    return true;

  } catch (error: any) {
    console.error('Failed to notify admins:', error);
    if (error?.code === 'PGRST205' || error?.message?.includes('schema cache')) {
        toast.error("Bildirim tablosu bulunamadı. Lütfen 'db_fix.sql' dosyasını Supabase SQL editöründe çalıştırın.");
    }
    return false;
  }
};
