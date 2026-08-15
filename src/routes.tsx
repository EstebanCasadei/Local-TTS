import { createBrowserRouter } from "react-router";
import { Layout, LibraryPage, ReadingPage } from "./pages";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: LibraryPage },
      { path: "reading", Component: ReadingPage },
    ],
  },
]);
