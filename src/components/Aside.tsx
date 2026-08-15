import { useState } from "react";

const NAV = [
  { id: "library", label: "Biblioteca", icon: LibraryIcon },
  { id: "options", label: "Opciones", icon: GearIcon },
];

const SECONDARY = [
  { id: "help", label: "Ayuda", icon: HelpIcon },
  { id: "privacy", label: "Privacidad", icon: ShieldIcon },
];

let syncStatus = "synced"; // "synced", "syncing", "error"

export function Aside() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Abrir menú"
        className="fixed top-4 left-4 z-30 grid size-10 place-items-center rounded-full shadow-large bg-bg-secondary text-text-primary md:hidden"
        onClick={() => setOpen(true)}
        type="button"
      >
        <MenuIcon />
      </button>
      <button
        aria-hidden={!open}
        aria-label="Cerrar menú"
        className={`fixed inset-0 z-40 bg-black/50 md:hidden ${open ? "" : "hidden"}`}
        onClick={() => setOpen(false)}
        tabIndex={-1}
        type="button"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[15rem] md:w-[18rem] flex-col border-r border-border-primary bg-bg-secondary p-4 font-primary text-text-primary transition-transform duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <a className="mb-4 flex items-center justify-center gap-2" href="/">
          <BookIcon />
          <span className="font-h1 font-medium leading-none">
            <span className="block">Local</span>
            <span className="block text-brand-primary">TTS</span>
          </span>
        </a>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ id, label, icon: Icon }, index) => (
            <a
              aria-current={index === 0 ? "page" : undefined}
              className={`font-h3 flex items-center gap-3 rounded-[8px] p-4 ${
                index === 0
                  ? "bg-bg-primary border-r-2 border-border-primary "
                  : "text-text-primary hover:bg-bg-tertiary"
              }`}
              href={`#${id}`}
              key={id}
            >
              <Icon />
              {label}
            </a>
          ))}
        </nav>

        <nav className="mt-auto flex flex-col gap-1">
          {SECONDARY.map(({ id, label, icon: Icon }) => (
            <a
              className="font-h3 flex items-center gap-3 rounded-[8px] p-4"
              href={`#${id}`}
              key={id}
            >
              <Icon />
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
              <CloudIcon />
            </span>
          )}
          {syncStatus === "syncing" && (
            <span
              aria-label="Estado: Sincronizando"
              className="grid size-8 shrink-0 place-items-center rounded-full text-text-inverse bg-action-waiting p-2"
            >
              <CloudIcon />
            </span>
          )}
          {syncStatus === "error" && (
            <span
              aria-label="Estado: Error"
              className="grid size-8 shrink-0 place-items-center rounded-full text-text-inverse bg-action-error p-2"
            >
              <CloudIcon />
            </span>
          )}
        </div>
      </aside>
    </>
  );
}

const svg = "size-5 shrink-0";

function MenuIcon() {
  return (
    <svg
      className={svg}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 8h12M2 4h12M2 12h12"
        stroke="#c6c5d5"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      className="size-16 md:size-24"
      width="368"
      height="233"
      viewBox="0 0 368 233"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m94.295 224.06 73.854-12.17 1.446.026 52.892 10.713 76.123-12.544 1.445.026 53.613 10.861-.795 3.92-.794 3.92-52.893-10.714-76.123 12.545-1.444-.027-52.894-10.714-76.122 12.545-4.276-2.257L0 40.773l7.25-3.381zM223.206.026l53.612 10.86 2.832 2.23 88.328 189.418-4.42 5.611-52.894-10.714-76.122 12.545-1.445-.027-52.894-10.715-76.122 12.545-4.275-2.256L11.479 20.105l2.974-5.637L91.301 1.804l1.445.026 52.893 10.713L221.762 0zm-71.788 19.672L168.84 57.06h-8.827l-17.222-36.931L91.876 9.816 20.957 21.503l84.815 181.889 73.856-12.17 1.444.026 45.843 9.286-20.592-44.16v-1.91h7.937l21.974 47.124 73.855-12.17 1.444.026 45.843 9.285-84.124-180.404-50.915-10.313z"
        fill="#c6c5d5"
      />
      <path
        d="M160.769 73.06v65.404m59.429-65.404v65.404m25.272-46.02v27.893m-114-28.188v27.893m58.231-73.306v107.472"
        stroke="#818cf8"
        stroke-width="12"
        stroke-linecap="square"
        stroke-linejoin="bevel"
      />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg
      className={svg}
      width="19"
      height="19"
      viewBox="0 0 19 19"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.6 11.4h3.8V9.5H7.6zm0-2.85h7.6v-1.9H7.6zm0-2.85h7.6V3.8H7.6zm-1.9 9.5a1.83 1.83 0 0 1-1.342-.558A1.83 1.83 0 0 1 3.8 13.3V1.9q0-.784.558-1.342A1.83 1.83 0 0 1 5.7 0h11.4q.783 0 1.342.558Q19 1.117 19 1.9v11.4q0 .784-.558 1.342a1.83 1.83 0 0 1-1.342.558zM1.9 19a1.83 1.83 0 0 1-1.342-.558A1.83 1.83 0 0 1 0 17.1V3.8h1.9v13.3h13.3V19z"
        fill="#c6c5d5"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      className={svg}
      width="21"
      height="20"
      viewBox="0 0 21 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="m7.3 20-.4-3.2a4 4 0 0 1-.613-.3 8 8 0 0 1-.562-.375l-2.975 1.25L0 12.625l2.575-1.95a2.4 2.4 0 0 1-.025-.338v-.675q0-.162.025-.337L0 7.375l2.75-4.75 2.975 1.25Q6 3.675 6.3 3.5t.6-.3L7.3 0h5.5l.4 3.2q.325.125.613.3.287.175.562.375l2.975-1.25 2.75 4.75-2.575 1.95q.025.176.025.338v.675q0 .162-.05.337l2.575 1.95-2.75 4.75-2.95-1.25a7 7 0 0 1-.575.375q-.3.175-.6.3l-.4 3.2zm1.75-2h1.975l.35-2.65q.775-.2 1.438-.588t1.212-.937L16.5 14.85l.975-1.7-2.15-1.625q.125-.35.175-.738a6.2 6.2 0 0 0 0-1.575 3.5 3.5 0 0 0-.175-.737l2.15-1.625-.975-1.7-2.475 1.05a5.6 5.6 0 0 0-1.213-.963 5.6 5.6 0 0 0-1.437-.587L11.05 2H9.075l-.35 2.65q-.775.2-1.437.587-.663.388-1.213.938L3.6 5.15l-.975 1.7 2.15 1.6q-.125.375-.175.75a6 6 0 0 0-.05.8q0 .4.05.775t.175.75l-2.15 1.625.975 1.7 2.475-1.05q.55.575 1.212.962.663.389 1.438.588zm1.05-4.5q1.45 0 2.475-1.025A3.37 3.37 0 0 0 13.6 10q0-1.45-1.025-2.475A3.37 3.37 0 0 0 10.1 6.5q-1.475 0-2.487 1.025A3.4 3.4 0 0 0 6.6 10q0 1.45 1.013 2.475T10.1 13.5"
        fill="#c6c5d5"
      />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg
      className={svg}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.95 16q.525 0 .888-.363.362-.362.362-.887t-.362-.887a1.2 1.2 0 0 0-.888-.363q-.525 0-.887.363a1.2 1.2 0 0 0-.363.887q0 .525.363.887.362.363.887.363m-.9-3.85h1.85q0-.825.188-1.3t1.062-1.3a7.5 7.5 0 0 0 1.025-1.238q.375-.587.375-1.412 0-1.4-1.025-2.15T10.1 4q-1.424 0-2.312.75T6.55 6.55l1.65.65q.124-.45.563-.975Q9.2 5.7 10.1 5.7q.8 0 1.2.438.4.437.4.962 0 .5-.3.938t-.75.812q-1.1.975-1.35 1.475t-.25 1.825M10 20a9.7 9.7 0 0 1-3.9-.788 10.1 10.1 0 0 1-3.175-2.137Q1.575 15.725.788 13.9A9.7 9.7 0 0 1 0 10q0-2.074.788-3.9a10.1 10.1 0 0 1 2.137-3.175Q4.275 1.575 6.1.788A9.7 9.7 0 0 1 10 0q2.075 0 3.9.788a10.1 10.1 0 0 1 3.175 2.137q1.35 1.35 2.137 3.175A9.7 9.7 0 0 1 20 10a9.7 9.7 0 0 1-.788 3.9 10.1 10.1 0 0 1-2.137 3.175q-1.35 1.35-3.175 2.137A9.7 9.7 0 0 1 10 20m0-2q3.35 0 5.675-2.325T18 10t-2.325-5.675T10 2 4.325 4.325 2 10t2.325 5.675T10 18"
        fill="#c6c5d5"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      className={svg}
      width="16"
      height="20"
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 20q-3.476-.875-5.737-3.988Q0 12.9 0 9.1V3l8-3 8 3v6.1q0 3.8-2.262 6.913Q11.475 19.124 8 20m0-2.1q2.426-.75 4.05-2.962A9.87 9.87 0 0 0 13.95 10H8V2.125l-6 2.25V9.55q0 .175.05.45H8z"
        fill="#c6c5d5"
      />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
      <path
        d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
