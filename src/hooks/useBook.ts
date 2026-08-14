import { useEffect, useState } from "react";
import { getBookRepository } from "../lib/books";
import type { Chunk, Progress } from "../lib/books";

// Single-book hook — live chunks + last-saved progress for one book. The
// frontend (#14 reading UI) consumes this without caring where data lives.
export function useBook(bookId: string | null): {
  chunks: Chunk[];
  progress: Progress | null;
  loading: boolean;
} {
  const repo = getBookRepository();
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookId) {
      setChunks([]);
      setProgress(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = repo.onChunks(bookId, (next) => {
      setChunks(next);
      setLoading(false);
    });
    repo.getProgress(bookId).then(setProgress);
    return unsub;
  }, [repo, bookId]);

  return { chunks, progress, loading };
}
