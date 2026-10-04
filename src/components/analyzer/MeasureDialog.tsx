'use client';
import { useEffect, useState } from 'react';
import { Button, Dialog, Field, Input, Select } from '@/components/ui';
import { useAnalyzer } from '@/state/analyzer';

const TO_IN = { in: 1, cm: 1 / 2.54, mm: 1 / 25.4 };

/** Asks for the real distance between the two clicked points. */
export function MeasureDialog() {
  const measure = useAnalyzer((s) => s.measure);
  const apply = useAnalyzer((s) => s.applyMeasure);
  const cancel = useAnalyzer((s) => s.cancelMeasure);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<keyof typeof TO_IN>('in');
  const open = measure.length === 2;
  useEffect(() => {
    if (open) setValue('');
  }, [open]);
  const n = Number(value);
  return (
    <Dialog open={open} onClose={cancel} title="Distance between A and B">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (n > 0) apply(n * TO_IN[unit]);
        }}
      >
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Distance">
            <Input type="number" step="any" min="0" value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
          </Field>
          <Field label="Unit">
            <Select value={unit} onChange={(e) => setUnit(e.target.value as keyof typeof TO_IN)}>
              <option value="in">inches</option>
              <option value="cm">cm</option>
              <option value="mm">mm</option>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!(n > 0)}>
            Calibrate
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
