import { useState } from 'react';
import { StepIndicator, Stepper, TripTypeSwitch, ZoneSelect } from '../ui';

const opts = [
  { value: 'demo-airport', label: 'DEMO Airport' },
  { value: 'demo-centre', label: 'DEMO Centre' },
];

export default function KitchenSinkDemos() {
  const [type, setType] = useState<'transfer' | 'hourly'>('transfer');
  const [from, setFrom] = useState('demo-airport');
  const [to, setTo] = useState('demo-centre');
  const [hours, setHours] = useState(4);

  return (
    <>
      <h2>Step indicator</h2>
      <StepIndicator steps={['Journey', 'Vehicle', 'Details', 'Payment']} current={1} label="Booking steps" />

      <h2>Trip type</h2>
      <TripTypeSwitch
        value={type}
        onChange={setType}
        transferLabel="Transfer"
        hourlyLabel="By the hour"
      />

      <h2>Zone select + stepper</h2>
      <div className="quick-book-fields">
        <ZoneSelect
          id="ks-from"
          label="From"
          options={opts}
          value={from}
          onChange={setFrom}
          swapWith={{
            otherValue: to,
            onSwap: () => {
              setFrom(to);
              setTo(from);
            },
          }}
        />
        {type === 'transfer' ? (
          <ZoneSelect id="ks-to" label="To" options={opts} value={to} onChange={setTo} />
        ) : (
          <Stepper id="ks-hours" label="Hours" value={hours} min={3} max={12} onChange={setHours} />
        )}
      </div>
    </>
  );
}
