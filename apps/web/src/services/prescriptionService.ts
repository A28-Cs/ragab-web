import { api } from '../lib/apiClient';
import type { Prescription, PrescriptionItem, PrescriptionStatus, PermissionKey } from '../types';

export interface SubmitPrescriptionInput {
  customerName: string;
  customerPhone: string;
  imageUrl: string;
  notes?: string;
}

export interface ReviewPrescriptionPayload {
  items: PrescriptionItem[];
  pharmacistNotes?: string;
  addToCart?: boolean;
}

export const uploadPrescriptionImage = async (file: File): Promise<string> => {
  const headers: Record<string, string> = { 'content-type': file.type || 'application/octet-stream' };
  const res = await fetch('/api/v1/prescriptions/upload', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: file,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error?.message?.ar || 'فشل رفع صورة الروشتة');
  }
  return json.data.url;
};

export const submitPrescription = async (data: SubmitPrescriptionInput): Promise<{ ok: boolean; id: string }> => {
  return api.post<{ ok: boolean; id: string }>('/prescriptions', data);
};

export const getMyPrescriptions = async (): Promise<Prescription[]> => {
  return api.get<Prescription[]>('/prescriptions');
};

export const getPrescriptionById = async (id: string): Promise<Prescription> => {
  return api.get<Prescription>(`/prescriptions/${encodeURIComponent(id)}`);
};

export const addPrescriptionItemsToCart = async (id: string): Promise<{ ok: boolean; addedCount: number }> => {
  return api.post<{ ok: boolean; addedCount: number }>(`/prescriptions/${encodeURIComponent(id)}/add-to-cart`);
};

export const getAdminPrescriptions = async (status?: string): Promise<Prescription[]> => {
  return api.get<Prescription[]>('/admin/prescriptions', { status });
};

export const reviewAdminPrescription = async (
  id: string,
  payload: ReviewPrescriptionPayload,
  _perms?: Set<PermissionKey>
): Promise<Prescription> => {
  return api.post<Prescription>(`/admin/prescriptions/${encodeURIComponent(id)}/review`, payload);
};

export const rejectAdminPrescription = async (
  id: string,
  reason: string,
  _perms?: Set<PermissionKey>
): Promise<Prescription> => {
  return api.post<Prescription>(`/admin/prescriptions/${encodeURIComponent(id)}/reject`, { reason });
};
