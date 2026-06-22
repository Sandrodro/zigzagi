import { Timer } from "./Timer";

export function CongratsModal({ seconds, onClose }: { seconds: number; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="congratulations"
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ background: "#fff", padding: "1.5rem", borderRadius: 8, textAlign: "center" }}>
        <h2>გილოცავ! 🎉</h2>
        <p>
          შენი დრო: <Timer seconds={seconds} />
        </p>
        <button onClick={onClose}>დახურვა</button>
      </div>
    </div>
  );
}
