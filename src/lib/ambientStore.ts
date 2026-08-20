// OPFS storage for user-imported ambient tracks (music/ambient sounds played
// during reading, see AudioPanel). Same "filename IS the record" pattern as
// audioStore.ts — the directory listing is the source of truth, no parallel
// index to keep in sync.
//
//   /ambient/{fileName}

export interface AmbientTrack {
  id: string; // == fileName
  name: string; // fileName without extension
}

async function getAmbientDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("ambient", { create: true });
}

function trackName(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, "");
}

/** Lists user-imported ambient tracks. Empty if none have been imported yet. */
export async function listAmbientTracks(): Promise<AmbientTrack[]> {
  const dir = await getAmbientDir();
  const tracks: AmbientTrack[] = [];
  for await (const name of dir.keys()) {
    tracks.push({ id: name, name: trackName(name) });
  }
  return tracks;
}

/** Saves an imported file to OPFS. Re-importing the same filename overwrites it. */
export async function saveAmbientTrack(file: File): Promise<AmbientTrack> {
  const dir = await getAmbientDir();
  const handle = await dir.getFileHandle(file.name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return { id: file.name, name: trackName(file.name) };
}

/** Reads a track's raw bytes, to build a Blob URL for playback. */
export async function readAmbientTrack(id: string): Promise<ArrayBuffer> {
  const dir = await getAmbientDir();
  const handle = await dir.getFileHandle(id);
  const file = await handle.getFile();
  return file.arrayBuffer();
}

export async function removeAmbientTrack(id: string): Promise<void> {
  const dir = await getAmbientDir();
  await dir.removeEntry(id).catch(() => {});
}
