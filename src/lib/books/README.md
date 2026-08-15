# `lib/books` — Book data layer & sync facade

One `BookRepository` interface, one set of React hooks. The frontend (#14
reading UI, #19 library) consumes these without caring whether data is local
or synced. Same Strategy + Facade pattern as `lib/user`.

## Pattern

```
Frontend ──> useLibrary() / useBook() ──> BookRepositoryFacade
                                              ├──> LocalBookRepository      (default)
                                              └──> FirestoreBookRepository  (after opt-in)
```

- **`BookRepository`** — the public interface (books, chunks, progress, bookmarks).
- **`LocalBookRepository`** — IndexedDB-backed, zero network. Default at startup.
- **`FirestoreBookRepository`** — stub for now; full Firestore sync is #18's main body.
- **`BookRepositoryFacade`** — delegates to the active strategy, swaps on opt-in,
  runs `backfillFromLocal` on `onFirstSync` (from `lib/user`).

## Public API

### Frontend (React)

```ts
import { useLibrary } from "@/hooks/useLibrary";
import { useBook } from "@/hooks/useBook";

function LibraryScreen() {
  const { books, loading } = useLibrary();
  if (loading) return <Spinner />;
  return books.map((b) => <BookCard key={b.id} book={b} />);
}

function ReaderScreen({ bookId }: { bookId: string }) {
  const { chunks, progress, loading } = useBook(bookId);
  // chunks is a live, ordered array; progress is the last-saved position.
}
```

### Data layer / #18 (sync wiring)

```ts
import { startFirestoreSync, getBookRepository } from "@/lib/books";

// When #18 ships the real Firestore impl:
startFirestoreSync(new FirestoreBookRepository(fb.db, uid));
// Backfill is automatic: the facade subscribes to onFirstSync from lib/user
// and calls backfillFromLocal() to copy local data into Firestore.
```

### Direct repository access (non-React)

```ts
import { getBookRepository } from "@/lib/books";

const repo = getBookRepository();
await repo.saveBook(book);
const unsub = repo.onBooks((books) => console.log(books));
```

## Data shapes

```ts
interface Book {
  id: string;
  titulo: string;
  autor: string | null;
  formatoOriginal: "txt" | "pdf" | "epub";
  totalChunks: number;
  capitulos: { indice: number; titulo: string }[];
  fechaCreacion: number; // epoch ms
  fechaModificacion: number;
}

interface Chunk {
  id: string; // chunkId, stable per book
  bookId: string;
  indiceOrden: number;
  capituloId: number | null;
  texto: string;
  voiceId: string;
  toneCategoria?: string;
  synthesisParams?: Record<string, number>;
}

interface Progress {
  bookId: string;
  chunkActualId: string;
  offsetSegundos: number;
  fechaUltimaEscucha: number;
}

interface Bookmark {
  id: string;
  bookId: string;
  chunkId: string;
  offsetSegundos: number;
  nombre: string | null;
  createdAt: number;
}
```

Audio is deliberately NOT in these types — audio lives in OPFS (#6), keyed by
chunk hash. Firestore sync (#18) never touches audio.

## Storage

IndexedDB `books` object store with composite string keys:

```
book:{bookId}                    → Book
chunk:{bookId}:{chunkId}         → Chunk
progress:{bookId}                → Progress
bookmark:{bookId}:{bookmarkId}   → Bookmark
```

Range queries use `IDBKeyRange.bound(prefix, prefix + "\uffff")` — e.g. all
chunks of a book are one cursor scan. The `BookStore` port keeps
`LocalBookRepository` unit-testable without IndexedDB (in-memory store in tests).

## Files

| File                         | Role                                                     |
| ---------------------------- | -------------------------------------------------------- |
| `../../types/book.ts`        | `Book`, `Chunk`, `Progress`, `Bookmark`                  |
| `BookRepository.ts`          | The public interface + `BookStore` port                  |
| `LocalBookRepository.ts`     | Local-first strategy (IndexedDB-backed, no-op sync)      |
| `FirestoreBookRepository.ts` | Stub (full Firestore sync is #18)                        |
| `facade.ts`                  | Strategy swap + backfill on `onFirstSync`                |
| `index.ts`                   | Singleton, `getBookRepository()`, `startFirestoreSync()` |
| `../localDb.ts`              | IndexedDB store (kv + books object stores)               |
| `../../hooks/useLibrary.ts`  | React hook — live book list                              |
| `../../hooks/useBook.ts`     | React hook — live chunks + progress for one book         |

## Testing

- `LocalBookRepository.test.ts` — save/get round-trips, live listeners,
  ordering, delete, progress, bookmarks, unsubscribe correctness (8 tests).
  Uses an in-memory `BookStore` (no IndexedDB needed).
- `facade.test.ts` — delegation, strategy swap, backfill, unconfigured no-op
  (4 tests). Mocks `../firebase` to avoid live Firebase calls.
