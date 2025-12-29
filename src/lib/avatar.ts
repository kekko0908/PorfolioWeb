import { supabase } from "./supabaseClient";

export const avatarBucket = "Avatar_profile";
const avatarStoragePrefix = `storage:${avatarBucket}/`;

export const buildStorageAvatarRef = (path: string) => `${avatarStoragePrefix}${path}`;

export const isStorageAvatarRef = (ref: string) => ref.startsWith(avatarStoragePrefix);

export const getAvatarPathFromRef = (ref: string) =>
  isStorageAvatarRef(ref) ? ref.slice(avatarStoragePrefix.length) : null;

export const resolveAvatarRefUrl = async (ref: string): Promise<string> => {
  if (!ref) return "";
  if (!isStorageAvatarRef(ref)) return ref;
  const path = getAvatarPathFromRef(ref);
  if (!path) return "";
  const { data: signedData, error } = await supabase.storage
    .from(avatarBucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (!error && signedData?.signedUrl) return signedData.signedUrl;
  const { data: publicData } = supabase.storage.from(avatarBucket).getPublicUrl(path);
  return publicData?.publicUrl ?? "";
};

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

export const uploadAvatarFile = async (userId: string, file: File) => {
  const safeName = sanitizeFileName(file.name || "avatar");
  const filePath = `${userId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(avatarBucket)
    .upload(filePath, file, { upsert: true });
  if (error) {
    throw error;
  }
  const ref = buildStorageAvatarRef(filePath);
  const url = await resolveAvatarRefUrl(ref);
  return { ref, path: filePath, url };
};
