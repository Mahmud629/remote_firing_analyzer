'use client';

import React, { useState, useEffect } from 'react';

interface Step {
  number: number;
  title: string;
  description: string;
  color: string;
  glowColor: string;
  borderColor: string;
}

const steps: Step[] = [
  {
    number: 1,
    title: 'Natural Alignment',
    description: 'Natural Alignment of the Weapon to the Point of Aim',
    color: 'from-blue-900 to-blue-800',
    glowColor: 'shadow-lg shadow-blue-500/50',
    borderColor: 'border-blue-500/70',
  },
  {
    number: 2,
    title: 'Correct Sight Picture',
    description: 'Correct Sight Picture and First pull',
    color: 'from-amber-900 to-amber-800',
    glowColor: 'shadow-lg shadow-amber-500/50',
    borderColor: 'border-amber-500/70',
  },
  {
    number: 3,
    title: 'Breathing Cycle',
    description: '2 X Breathing Cycle',
    color: 'from-green-900 to-green-800',
    glowColor: 'shadow-lg shadow-green-500/50',
    borderColor: 'border-green-500/70',
  },
  {
    number: 4,
    title: 'Final Pull',
    description: '8-10 seconds breathing pause, Second (final) pull and follow through',
    color: 'from-red-900 to-red-800',
    glowColor: 'shadow-lg shadow-red-500/50',
    borderColor: 'border-red-500/70',
  },
];

export function FiringCycleAnimation() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isPulsing, setIsPulsing] = useState(false);

  // Animation timing
  const stepDurations = [1500, 1500, 1500, 2000]; // ms for each step

  useEffect(() => {
    if (!isPlaying) return;

    const totalDuration = stepDurations.reduce((a, b) => a + b, 0);
    let currentTime = 0;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentTime += 100;

      let elapsed = 0;
      for (let i = 0; i < steps.length; i++) {
        elapsed += stepDurations[i];
        if (currentTime % totalDuration < elapsed) {
          currentStep = i;
          break;
        }
      }

      setActiveStep(currentStep);

      // Trigger pulse effect on step 4
      if (currentStep === 3) {
        setIsPulsing(true);
        setTimeout(() => setIsPulsing(false), 500);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleRestart = () => {
    setActiveStep(0);
    setIsPlaying(true);
  };

  return (
    <div className="w-full bg-gradient-to-br from-slate-950 to-slate-900 p-8 rounded-lg border border-slate-700/50">
      {/* Title */}
      <div className="text-center mb-12">
        <h2 className="text-2xl font-black text-white tracking-wider">FIRING CYCLE ANIMATION</h2>
        <div className="h-1 w-32 bg-gradient-to-r from-blue-500 via-amber-500 via-green-500 to-red-500 mx-auto mt-3 rounded"></div>
      </div>

      {/* Main Circular Layout */}
      <div className="flex flex-col items-center gap-12">
        {/* Top - Step 2 */}
        <div className="flex justify-center w-full">
          <div
            className={`px-6 py-4 rounded-lg border-2 text-center transition-all duration-300 max-w-xs ${
              activeStep === 1
                ? `bg-gradient-to-br ${steps[1].color} ${steps[1].borderColor} ${steps[1].glowColor} scale-105`
                : 'bg-slate-800/30 border-slate-600/30'
            }`}
          >
            <div className={`text-4xl font-black mb-2 transition-colors duration-300 ${
              activeStep === 1 ? 'text-amber-300' : 'text-slate-500'
            }`}>
              2
            </div>
            <div className={`text-sm font-bold transition-colors duration-300 ${
              activeStep === 1 ? 'text-amber-100' : 'text-slate-400'
            }`}>
              {steps[1].title}
            </div>
            <div className={`text-xs mt-1 transition-colors duration-300 ${
              activeStep === 1 ? 'text-amber-100/80' : 'text-slate-500'
            }`}>
              {steps[1].description}
            </div>
          </div>
        </div>

        {/* Middle Row - Step 1 (Left) and Step 3 (Right) */}
        <div className="flex justify-between items-center w-full gap-8 px-8">
          {/* Step 1 - Left */}
          <div
            className={`px-6 py-4 rounded-lg border-2 text-center transition-all duration-300 flex-1 max-w-xs ${
              activeStep === 0
                ? `bg-gradient-to-br ${steps[0].color} ${steps[0].borderColor} ${steps[0].glowColor} scale-105`
                : 'bg-slate-800/30 border-slate-600/30'
            }`}
          >
            <div className={`text-4xl font-black mb-2 transition-colors duration-300 ${
              activeStep === 0 ? 'text-blue-300' : 'text-slate-500'
            }`}>
              1
            </div>
            <div className={`text-sm font-bold transition-colors duration-300 ${
              activeStep === 0 ? 'text-blue-100' : 'text-slate-400'
            }`}>
              {steps[0].title}
            </div>
            <div className={`text-xs mt-1 transition-colors duration-300 ${
              activeStep === 0 ? 'text-blue-100/80' : 'text-slate-500'
            }`}>
              {steps[0].description}
            </div>
          </div>

          {/* Center Circle with numbers showing flow */}
          <div className="flex flex-col items-center gap-3">
            <div className="text-sm font-bold text-slate-400">Flow</div>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((num) => (
                <div
                  key={num}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 ${
                    activeStep === num - 1
                      ? 'bg-white text-slate-900 scale-125 shadow-lg'
                      : 'bg-slate-700/50 text-slate-400'
                  }`}
                >
                  {num}
                </div>
              ))}
            </div>
          </div>

          {/* Step 3 - Right */}
          <div
            className={`px-6 py-4 rounded-lg border-2 text-center transition-all duration-300 flex-1 max-w-xs ${
              activeStep === 2
                ? `bg-gradient-to-br ${steps[2].color} ${steps[2].borderColor} ${steps[2].glowColor} scale-105`
                : 'bg-slate-800/30 border-slate-600/30'
            }`}
          >
            <div className={`text-4xl font-black mb-2 transition-colors duration-300 ${
              activeStep === 2 ? 'text-green-300' : 'text-slate-500'
            }`}>
              3
            </div>
            <div className={`text-sm font-bold transition-colors duration-300 ${
              activeStep === 2 ? 'text-green-100' : 'text-slate-400'
            }`}>
              {steps[2].title}
            </div>
            <div className={`text-xs mt-1 transition-colors duration-300 ${
              activeStep === 2 ? 'text-green-100/80' : 'text-slate-500'
            }`}>
              {steps[2].description}
            </div>
          </div>
        </div>

        {/* Bottom - Step 4 */}
        <div className="flex justify-center w-full">
          <div
            className={`px-6 py-4 rounded-lg border-2 text-center transition-all duration-300 max-w-xs ${
              activeStep === 3
                ? `bg-gradient-to-br ${steps[3].color} ${steps[3].borderColor} ${steps[3].glowColor} scale-105 ${
                    isPulsing ? 'animate-pulse' : ''
                  }`
                : 'bg-slate-800/30 border-slate-600/30'
            }`}
          >
            <div className={`text-4xl font-black mb-2 transition-colors duration-300 ${
              activeStep === 3 ? 'text-red-300' : 'text-slate-500'
            }`}>
              4
            </div>
            <div className={`text-sm font-bold transition-colors duration-300 ${
              activeStep === 3 ? 'text-red-100' : 'text-slate-400'
            }`}>
              {steps[3].title}
            </div>
            <div className={`text-xs mt-1 transition-colors duration-300 ${
              activeStep === 3 ? 'text-red-100/80' : 'text-slate-500'
            }`}>
              {steps[3].description}
            </div>
          </div>
        </div>
      </div>

      {/* Current Step Info */}
      <div className="mt-8 p-4 bg-slate-800/40 border border-slate-700/50 rounded text-center">
        <p className={`text-lg font-bold transition-colors duration-300 ${
          activeStep === 0
            ? 'text-blue-300'
            : activeStep === 1
              ? 'text-amber-300'
              : activeStep === 2
                ? 'text-green-300'
                : 'text-red-300'
        }`}>
          Step {activeStep + 1}: {steps[activeStep].title}
        </p>
        <p className="text-slate-400 text-sm mt-1">{steps[activeStep].description}</p>
      </div>

      {/* Controls */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          onClick={handlePlayPause}
          className="px-6 py-2 rounded font-bold text-sm transition-all bg-slate-700/70 border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white hover:bg-slate-700"
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          onClick={handleRestart}
          className="px-6 py-2 rounded font-bold text-sm transition-all bg-slate-700/70 border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white hover:bg-slate-700"
        >
          ⟲ Restart
        </button>
      </div>
    </div>
  );
}
