import { FLOW } from '../utils/format.js';
import { IconCheck, IconAlert, IconClock, IconX } from './Icons.jsx';

export default function StatusStepper({ status, expectedDeliveryDate }) {
  if (status === 'Delayed') {
    return (
      <>
        <div className="state-banner delayed"><IconAlert size={16} /> This shipment is <b>&nbsp;delayed&nbsp;</b> — expected delivery was {new Date(expectedDeliveryDate).toLocaleString('en-IN')}.</div>
      </>
    );
  }
  if (status === 'On Hold') {
    return (
      <div className="state-banner hold"><IconClock size={16} /> This shipment is currently <b>&nbsp;on hold</b>. Check related exceptions for details.</div>
    );
  }
  if (status === 'Cancelled') {
    return (
      <div className="state-banner cancelled"><IconX size={16} /> This shipment has been <b>&nbsp;cancelled</b>.</div>
    );
  }
  const activeIdx = Math.max(0, FLOW.indexOf(status));
  return (
    <div className="stepper">
      {FLOW.map((step, i) => (
        <div key={step} className={`step ${i < activeIdx ? 'done' : ''} ${i === activeIdx ? 'current' : ''}`}>
          <span className="s-line" />
          <span className="s-dot">{i < activeIdx ? <IconCheck size={13} /> : i + 1}</span>
          <span className="s-label">{step}</span>
        </div>
      ))}
    </div>
  );
}
