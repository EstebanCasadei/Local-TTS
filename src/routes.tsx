import { createBrowserRouter } from "react-router";
import { Layout, LibraryPage, ReadingPage, TracerPage } from "./pages";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: LibraryPage },
      { path: "reading", Component: ReadingPage },
      { path: "tracer", Component: TracerPage },
    ],
  },
]);
