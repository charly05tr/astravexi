import { useState } from 'react';
import { useAppActions } from '../../app/app-context';
import { Button } from '../../ui/Button';

/** DEMO only: advance the demo by one day, or reset it after a confirmation. */
export function DemoControls() {
  const actions = useAppActions();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="badges" role="group" aria-label="Confirm reset">
        <span>Reset the demo? This deletes demo entries, outbox and decisions, and returns to day 150.</span>
        <Button
          size="small"
          variant="primary"
          onClick={() => {
            setConfirming(false);
            void actions.resetDemo();
          }}
        >
          Yes, reset
        </Button>
        <Button size="small" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div className="badges">
      <Button size="small" onClick={() => void actions.advanceDay()}>
        Advance one day
      </Button>
      <Button size="small" onClick={() => setConfirming(true)}>
        Reset demo
      </Button>
    </div>
  );
}
