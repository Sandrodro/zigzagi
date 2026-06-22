import { Button } from "./ui/Button";
import { Timer } from "./Timer";

export function CongratsModal({ seconds, onClose }: { seconds: number; onClose: () => void }) {
  return (
    <div role="dialog" aria-label="congratulations" className="fixed inset-0 z-10 grid place-items-center bg-[rgba(35,39,47,0.45)] p-4">
      <div className="max-w-[360px] rounded border border-rule border-t-[3px] border-t-ochre bg-paper-raised px-8 py-7 text-center">
        <h2 className="mt-0 mb-2 font-serif text-2xl">გილოცავ!</h2>
        <p className="my-1.5">
          შენი დრო: <Timer seconds={seconds} />
        </p>
        <Button variant="primary" onClick={onClose}>
          დახურვა
        </Button>
      </div>
    </div>
  );
}
