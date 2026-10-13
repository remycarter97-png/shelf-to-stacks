import { createContext, useContext } from "react";
import type { Availability, Book } from "../../shared/types";

/** What a book card needs to know about the rest of the shelf (for "More like this"). */
export type ShelfContextValue = {
  books: Book[];
  /** Saved availability for a book on the shelf, if it has been checked. */
  lookup: (b: Book) => Availability | undefined;
  /** AI recommendations are configured on the server. */
  aiEnabled: boolean;
};

export const ShelfContext = createContext<ShelfContextValue>({ books: [], lookup: () => undefined, aiEnabled: false });
export const useShelf = () => useContext(ShelfContext);
