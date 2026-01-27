import emailjs from '@emailjs/browser';

const SERVICE_ID = 'service_gwhzwdo';
const TEMPLATE_ID = 'template_tu5rxco';
const UPDATE_TEMPLATE_ID = 'template_5ja5csa';
const PUBLIC_KEY = '8MSb9iCkLBq00yCpr';

interface EmailData {
  full_name: string;
  email: string;
  phone: string;
  brand: string;
  model: string;
  product_date: string;
  description: string;
}

interface UpdateEmailData {
  to_email: string;
  full_name: string;
  brand: string;
  model: string;
  new_status: string;
  latest_note: string;
}

export const sendServiceRequestEmail = async (data: EmailData) => {
  try {
    const templateParams: Record<string, unknown> = {
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      brand: data.brand,
      model: data.model,
      product_date: data.product_date,
      description: data.description,
    };

    const response = await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
    return { success: true, status: response.status, text: response.text };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { success: false, error };
  }
};

export const sendUpdateNotificationEmail = async (data: UpdateEmailData) => {
  try {
    const templateParams: Record<string, unknown> = {
      to_email: data.to_email,
      full_name: data.full_name,
      brand: data.brand,
      model: data.model,
      new_status: data.new_status,
      latest_note: data.latest_note,
    };

    const response = await emailjs.send(SERVICE_ID, UPDATE_TEMPLATE_ID, templateParams, PUBLIC_KEY);
    return { success: true, status: response.status, text: response.text };
  } catch (error) {
    console.error('Update email sending failed:', error);
    return { success: false, error };
  }
};