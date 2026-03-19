import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api',
  timeout: 60000, // 60s for AI requests
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('fcotz_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 globally (session expired)
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('fcotz_token');
      localStorage.removeItem('fcotz_user');
      window.location.href = '/auth/login?expired=1';
    }
    return Promise.reject(error);
  }
);

export default api;

// ── Typed API helpers ──────────────────────────────────────────────────────

export const authApi = {
  signup: (data: { email: string; password: string; fullName: string; preferredLanguage?: string }) =>
    api.post('/auth/signup', data),
  verifyOtp: (data: { userId: string; otp: string }) =>
    api.post('/auth/verify-otp', data),
  resendOtp: (userId: string) =>
    api.post('/auth/resend-otp', { userId }),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
  resetPassword: (data: { userId: string; otp: string; newPassword: string }) =>
    api.post('/auth/reset-password', data),
};

export const paymentApi = {
  subscribe: (phone: string) =>
    api.post('/payments/subscribe', { phone }),
  pollStatus: (subscriptionId: string) =>
    api.get(`/payments/status/${subscriptionId}`),
  mySubscription: () =>
    api.get('/payments/my-subscription'),
};

export const aiApi = {
  generateDesign: (formData: FormData) =>
    api.post('/ai/generate-design', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getDesigns: (page = 1) =>
    api.get(`/ai/designs?page=${page}&limit=12`),
  deleteDesign: (id: string) =>
    api.delete(`/ai/designs/${id}`),
  recommendOutfit: (data: { occasion: string; weather: string; stylePreference: string; language?: string; save?: boolean }) =>
    api.post('/ai/recommend-outfit', data),
  getSavedOutfits: () =>
    api.get('/ai/outfits'),
  chat: (data: { message: string; sessionId?: string; language?: string }) =>
    api.post('/ai/chat', data),
  getChatSessions: () =>
    api.get('/ai/chat/sessions'),
  getChatSession: (id: string) =>
    api.get(`/ai/chat/sessions/${id}`),
};

export const userApi = {
  dashboard: () => api.get('/user/dashboard'),
  updateProfile: (formData: FormData) =>
    api.put('/user/profile', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/user/change-password', data),
};

export const designerApi = {
  getPortfolio: (page = 1, userId?: string) =>
    api.get(`/designer/portfolio?page=${page}${userId ? `&userId=${userId}` : ''}`),
  getPortfolioItem: (id: string) =>
    api.get(`/designer/portfolio/${id}`),
  upload: (formData: FormData) =>
    api.post('/designer/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteItem: (id: string) =>
    api.delete(`/designer/portfolio/${id}`),
  likeItem: (id: string) =>
    api.post(`/designer/portfolio/${id}/like`),
  myPortfolio: () =>
    api.get('/designer/my-portfolio'),
};
