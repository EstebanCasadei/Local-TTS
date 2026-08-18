import { useEffect, useState } from "react";
import { getBookRepository } from "../lib/books";
import type { Progress } from "../types/book.ts";

/**
 * Loads progress for a single book. Used by ContinueCard and BookRow to
 * show reading progress in the library. The repository facade handles
 * local vs. synced storage transparently.
 */
export function useBookProgress(bookId: string): {
  progress: Progress | null;
  loading: boolean;
} {
  const repo = getBookRepository();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookId) {
      setProgress(null);
      setLoading(false);
      return;
    }
    repo.getProgress(bookId).then((p) => {
      setProgress(p);
      setLoading(false);
    });
  }, [repo, bookId]);

  return { progress, loading };
}
