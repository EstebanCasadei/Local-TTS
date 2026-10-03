export const EXPORT_DIRECTORY = "mp3-exports";

export async function removeExport(name: string): Promise<void> {
  // A terminated worker may take a moment to release its synchronous handle.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle(EXPORT_DIRECTORY);
      await directory.removeEntry(name);
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "NotFoundError") return;
      if (attempt === 3) return; // Recover abandoned files at the next inspection.
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }
}

export async function exportDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(EXPORT_DIRECTORY, { create: true });
  // Only remove our expired exports; never remove another tab's active job.
  for await (const handle of directory.values()) {
    if (handle.kind !== "file" || !/^export-[\da-f-]+\.mp3$/.test(handle.name)) continue;
    const file = await handle.getFile();
    if (Date.now() - file.lastModified > 24 * 60 * 60 * 1000) {
      await directory.removeEntry(handle.name).catch(() => {});
    }
  }
  return directory;
}
