import { Button } from "./ui/Button";
import { Timer } from "./Timer";

export function CongratsModal({ seconds, onClose }: { seconds: number; onClose: () => void }) {
  return (
    <div role="dialog" aria-label="congratulations" className="modal-overlay">
      <div className="modal">
        <h2 className="modal__title">გილოცავ!</h2>
        <p className="text">
          შენი დრო: <Timer seconds={seconds} />
        </p>
        <Button variant="primary" onClick={onClose}>
          დახურვა
        </Button>
      </div>
    </div>
  );
}
