import { Outlet } from "react-router";
import { Aside } from "../components";

export function Layout() {
  return (
    <div className="flex min-h-screen min-h-[100dvh]">
      <Aside />
      <div className="flex w-full md:pl-[18rem]">
        <Outlet />
      </div>
    </div>
  );
}
