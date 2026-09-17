import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export async function uploadDocument(file: File, folder: string) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
  const fileRef = ref(storage, key);
  await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(fileRef);
  return { key, url, name: file.name, size: file.size, contentType: file.type };
}