import { supabase } from "./supabaseClient";

export const refundsBucket = "refunds";
const refundsStoragePrefix = `storage:${refundsBucket}/`;

export const buildStorageRefundRef = (path: string) =>
  `${refundsStoragePrefix}${path}`;

export const isStorageRefundRef = (ref: string) =>
  ref.startsWith(refundsStoragePrefix);

export const getRefundPathFromRef = (ref: string) =>
  isStorageRefundRef(ref) ? ref.slice(refundsStoragePrefix.length) : null;

export const resolveRefundRefUrl = async (ref: string): Promise<string> => {
  if (!ref) return "";
  if (!isStorageRefundRef(ref)) return ref;
  const path = getRefundPathFromRef(ref);
  if (!path) return "";
  const { data: signedData, error } = await supabase.storage
    .from(refundsBucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (!error && signedData?.signedUrl) return signedData.signedUrl;
  const { data: publicData } = supabase.storage.from(refundsBucket).getPublicUrl(path);
  return publicData?.publicUrl ?? "";
};

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

export const uploadRefundPhoto = async (userId: string, file: File) => {
  const safeName = sanitizeFileName(file.name || "refund");
  const filePath = `${userId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(refundsBucket)
    .upload(filePath, file, { upsert: true });
  if (error) {
    throw error;
  }
  const ref = buildStorageRefundRef(filePath);
  const url = await resolveRefundRefUrl(ref);
  return { ref, path: filePath, url };
};
