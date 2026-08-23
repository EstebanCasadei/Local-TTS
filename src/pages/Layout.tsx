import { Outlet } from "react-router";
import { Aside, ToastProvider } from "../components";

export function Layout() {
  return (
    <ToastProvider>
      <div className="flex min-h-screen min-h-[100dvh]">
        <Aside />
        <div className="flex w-full md:pl-[18rem]">
          <Outlet />
        </div>
      </div>
    </ToastProvider>
  );
}
