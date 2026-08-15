import { Outlet } from "react-router";
import { Aside } from "../components";

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <Aside />
      <Outlet />
    </div>
  );
}
