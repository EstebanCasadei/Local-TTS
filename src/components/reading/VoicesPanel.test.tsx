import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoicesPanel } from "./VoicesPanel";

vi.mock("./SidePanel.tsx", () => ({
  SidePanel: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
afterEach(cleanup);

const props = {
  open: true,
  onClose: vi.fn(),
  onSelect: vi.fn(),
  selectedId: "voice",
  voices: [],
  downloadedIds: [],
  downloadingId: null,
};

describe("adaptive narration controls", () => {
  it("starts disabled and enables narration explicitly", () => {
    const onNarrationChange = vi.fn();
    render(<VoicesPanel {...props} onNarrationChange={onNarrationChange} />);
    expect(screen.getByRole("checkbox", { name: "Narración adaptativa" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Narración adaptativa" }));
    expect(onNarrationChange).toHaveBeenCalledWith({ enabled: true, personality: "study" });
  });
  it("offers four styles and reports fallback without disabling reading", () => {
    const onNarrationChange = vi.fn();
    render(
      <VoicesPanel
        {...props}
        narration={{ enabled: true, personality: "study" }}
        narrationModel={{ status: "fallback" }}
        onNarrationChange={onNarrationChange}
      />,
    );
    expect(screen.getAllByRole("option")).toHaveLength(4);
    fireEvent.change(screen.getByRole("combobox", { name: "Estilo de lectura" }), {
      target: { value: "poetry" },
    });
    expect(onNarrationChange).toHaveBeenCalledWith({ enabled: true, personality: "poetry" });
    expect(screen.getByRole("status")).toHaveTextContent("usando reglas locales");
  });
});
