import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import BookIcon from "../icons/BookIcon.svg?react";
import CloudIcon from "../icons/CloudIcon.svg?react";
import GearIcon from "../icons/GearIcon.svg?react";
import HelpIcon from "../icons/HelpIcon.svg?react";
import LibraryIcon from "../icons/LibraryIcon.svg?react";
import MenuIcon from "../icons/MenuIcon.svg?react";
import ShieldIcon from "../icons/ShieldIcon.svg?react";

// Reading a book is reached from the library, so "Biblioteca" stays
// highlighted there too. ponytail: hardcoded for the one nav item that
// needs it; generalize only if more sections grow sub-routes.
const LIBRARY_PATHS = ["/", "/reading"];

// `to: null` = no page behind it yet, rendered as a plain (inactive) link.
// ponytail: switch to `to: "/options"` once that route exists.
const NAV = [
  { to: "/", label: "Biblioteca", icon: LibraryIcon },
  { to: null, label: "Opciones", icon: GearIcon },
];

const SECONDARY = [
  { id: "help", label: "Ayuda", icon: HelpIcon },
  { id: "privacy", label: "Privacidad", icon: ShieldIcon },
];

let syncStatus = "synced"; // "synced", "syncing", "error"

export function Aside() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Abrir menú"
        className="fixed top-4 left-4 z-30 grid size-10 place-items-center rounded-full shadow-large bg-bg-secondary text-text-primary md:hidden"
        onClick={() => setOpen(true)}
        type="button"
      >
        <MenuIcon className="size-5 shrink-0" />
      </button>
      <div
        className={`fixed inset-0 z-40 bg-black/50 md:hidden ${open ? "" : "hidden"}`}
        inert={!open}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[15rem] md:w-[18rem] flex-col border-r border-border-primary bg-bg-secondary p-4 font-primary text-text-primary transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link className="mb-4 flex items-center justify-center gap-2" to="/">
          <BookIcon className="size-16 md:size-24" />
          <span className="font-h1 font-medium leading-none">
            <span className="block">Local</span>
            <span className="block text-brand-primary">TTS</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) =>
            to ? (
              <NavLink
                className={() => {
                  const isActive = to === "/" ? LIBRARY_PATHS.includes(pathname) : pathname === to;
                  return `font-h3 flex items-center gap-3 rounded-[8px] p-4 ${
                    isActive
                      ? "bg-bg-primary border-r-2 border-border-primary"
                      : "text-text-primary hover:bg-bg-tertiary"
                  }`;
                }}
                key={label}
                to={to}
              >
                <Icon className="size-5 shrink-0" />
                {label}
              </NavLink>
            ) : (
              <a
                className="font-h3 flex items-center gap-3 rounded-[8px] p-4 text-text-primary hover:bg-bg-tertiary"
                href={`#${label}`}
                key={label}
              >
                <Icon className="size-5 shrink-0" />
                {label}
              </a>
            ),
          )}
        </nav>

        <nav className="mt-auto flex flex-col gap-1">
          {SECONDARY.map(({ id, label, icon: Icon }) => (
            <a
              className="font-h3 flex items-center gap-3 rounded-[8px] p-4"
              href={`#${id}`}
              key={id}
            >
              <Icon className="size-5 shrink-0" />
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-border-primary p-4 pb-0">
          <div className="min-w-0">
            <p className="font-h3 truncate">Jane Doe</p>
            <p className="font-label truncate text-text-secondary">janedoe@gmail.com</p>
          </div>
          {/* TODO: Add sync status indicator */}
          {syncStatus === "synced" && (
            <span
              aria-label="Estado: Sincronizado"
              className="grid size-8 shrink-0 place-items-center rounded-full text-text-inverse bg-action-success p-2"
            >
              <CloudIcon className="size-4" />
            </span>
          )}
          {syncStatus === "syncing" && (
            <span
              aria-label="Estado: Sincronizando"
              className="grid size-8 shrink-0 place-items-center rounded-full text-text-inverse bg-action-waiting p-2"
            >
              <CloudIcon className="size-4" />
            </span>
          )}
          {syncStatus === "error" && (
            <span
              aria-label="Estado: Error"
              className="grid size-8 shrink-0 place-items-center rounded-full text-text-inverse bg-action-error p-2"
            >
              <CloudIcon className="size-4" />
            </span>
          )}
        </div>
      </aside>
    </>
  );
}
