import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstructionsModal({ isOpen, onClose }: InstructionsModalProps) {
  if (!isOpen) return null;

  const steps = [
    {
      number: 1,
      title: 'LOAD IMAGE',
      description: 'Upload a photograph of the target with bullet impacts clearly visible.',
    },
    {
      number: 2,
      title: 'CALIBRATE',
      description: 'Select two reference points on the target with a KNOWN distance between them. Click the two points, then enter the actual distance in inches when prompted. This allows the system to accurately convert pixels to real-world measurements.',
    },
    {
      number: 3,
      title: 'MARK BULLETS',
      description: 'Mark exactly 5 bullet impact holes on the target. The grouping size (largest distance between any two bullets) must be less than 10 inches to proceed.',
    },
    {
      number: 4,
      title: 'MARK POINT OF AIM',
      description: 'Click on the aiming point (center of the target or intended aim point). This establishes the Mean Point of Impact (MPI) relative to the intended target.',
    },
    {
      number: 5,
      title: 'ANALYZE RESULTS',
      description: 'The system calculates grouping, MPI correction, and determines if the rifle is zeroed (within 5cm radial error) or needs adjustment.',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-96 overflow-y-auto bg-slate-900 border-2 border-yellow-500 shadow-2xl">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-yellow-400">OPERATIONAL WORKFLOW</h2>
            <Button
              onClick={onClose}
              className="w-6 h-6 p-0 bg-red-700 hover:bg-red-600 text-white font-bold text-sm"
            >
              ✕
            </Button>
          </div>

          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.number} className="bg-slate-800/50 border border-slate-600 rounded p-2.5">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center">
                    <span className="font-black text-slate-900 text-sm">{step.number}</span>
                  </div>
                  <div className="flex-grow">
                    <h3 className="text-xs font-bold text-yellow-300">{step.title}</h3>
                    <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-2 bg-blue-900/30 border border-blue-600/50 rounded">
            <p className="text-xs text-blue-300">
              <span className="font-bold">NOTE:</span> Grouping must be &lt; 10 inches | Rifle is ZEROED when radial error ≤ 5cm
            </p>
          </div>

          <Button
            onClick={onClose}
            className="w-full mt-4 bg-green-700 hover:bg-green-600 text-white font-bold py-2 text-xs"
          >
            Close Instructions
          </Button>
        </div>
      </Card>
    </div>
  );
}
