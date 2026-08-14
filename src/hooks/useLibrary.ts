import { useEffect, useState } from "react";
import { getBookRepository } from "../lib/books";
import type { Book } from "../lib/books";

// Library view hook — live list of all books. The frontend (#19) consumes this
// without caring whether data is local or synced. Sorted by fechaModificacion
// (most recent first) by the repository.
export function useLibrary(): { books: Book[]; loading: boolean } {
  const repo = getBookRepository();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = repo.onBooks((next) => {
      setBooks(next);
      setLoading(false);
    });
    return unsub;
  }, [repo]);

  return { books, loading };
}
