'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { SavedSession } from '@/types';
import { InstructionsModal } from './InstructionsModal';
import { HeaderMenu } from './HeaderMenu';

interface HeaderProps {
  sessions?: SavedSession[];
  deleteSession?: (id: string) => void;
  clearAllSessions?: () => void;
  onShowSessions?: () => void;
  onShowResults?: () => void;
  onShowFiringCycle?: () => void;
  onShowWpnDetails?: () => void;
}

export function Header({ 
  sessions = [], 
  deleteSession = () => {}, 
  clearAllSessions = () => {},
  onShowSessions = () => {},
  onShowResults = () => {},
  onShowFiringCycle = () => {},
  onShowWpnDetails = () => {},
}: HeaderProps) {
  const quotes = [
    'Your Weapon your skill, One shot One Kill',
    'Precision is the mark of a professional soldier',
    'Zero the weapon, zero the target, zero the doubt',
    'Every shot counts, every calibration matters',
    'Master the fundamentals, master the mission',
  ];

  const [currentQuote, setCurrentQuote] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentQuote((prev) => (prev + 1) % quotes.length);
    }, 10000); // Display each quote for 10 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col w-full">
      {/* Main Header with Rifles */}
      <div
        className="relative w-full bg-cover bg-center border-b-4 border-yellow-500 shadow-2xl"
        style={{
          backgroundImage: 'url(/camo-background.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-black/50"></div>

        {/* Main Header Content */}
        <div className="relative flex items-center justify-center gap-4 px-2 pt-3 pb-2">
          {/* Left Side Controls */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {/* Header Menu - Military Style */}
            <HeaderMenu 
              onInstructionsClick={() => setShowInstructions(true)}
              sessions={sessions}
              deleteSession={deleteSession}
              clearAllSessions={clearAllSessions}
              onShowSessions={onShowSessions}
              onShowResults={onShowResults}
              onShowFiringCycle={onShowFiringCycle}
              onShowWpnDetails={onShowWpnDetails}
            />
          </div>

          {/* Left Ammunition - Mirrored */}
          <div className="h-14 w-20 flex items-center justify-center">
            <Image
              src="/ammunition-bullets.png"
              alt="Ammunition Bullets"
              width={60}
              height={56}
              className="drop-shadow-lg object-contain"
              style={{ transform: 'scaleX(-1)', width: 'auto', height: 'auto' }}
            />
          </div>

          {/* BD Army Logo */}
          <Image
            src="/bd-army-logo.png"
            alt="Bangladesh Army Logo"
            width={70}
            height={70}
            className="drop-shadow-xl flex-shrink-0"
            priority
          />

          {/* Title */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <h1 className="font-black text-3xl text-yellow-400 drop-shadow-2xl tracking-wider">
              REMOTE FIRING ANALYZER
            </h1>
            <p className="text-xs text-yellow-200 drop-shadow-md font-semibold">Bangladesh Army | Digital Target Analysis and Rifle Zeroing System</p>
          </div>

          {/* Right Rifle - Normal */}
          <div className="h-20 w-28 flex items-center justify-center">
            <Image
              src="/bd01-rifle-left.png"
              alt="BD-01 Rifle"
              width={90}
              height={80}
              className="drop-shadow-lg object-contain"
              style={{ width: 'auto', height: 'auto' }}
            />
          </div>

          {/* Right Side Controls */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {/* Instructions Button - Military Green */}
            <button
              onClick={() => setShowInstructions(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-b from-green-700 to-green-800 hover:from-green-600 hover:to-green-700 text-white rounded font-bold text-xs drop-shadow-lg shadow-lg transition-all border-2 border-black/60"
              title="Show Instructions"
            >
              <span className="text-sm">ℹ️</span>
              <span>How to Use</span>
            </button>
          </div>
        </div>

        {/* Scrolling Quotes Ticker with Green Animation */}
        <style>{`
          @keyframes scroll-quote {
            0% {
              transform: translateX(100%);
              opacity: 0;
            }
            5% {
              opacity: 1;
            }
            95% {
              opacity: 1;
            }
            100% {
              transform: translateX(-100%);
              opacity: 0;
            }
          }
          .quote-scroll {
            animation: scroll-quote 9s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          }
        `}</style>
        <div className="relative h-6 bg-black/40 border-t border-yellow-600/40 flex items-center overflow-hidden">
          <div className="w-full flex items-center justify-center">
            <div key={currentQuote} className="quote-scroll text-sm text-green-400 font-bold drop-shadow-lg text-center px-4 whitespace-nowrap">
              ✦ {quotes[currentQuote]} ✦
            </div>
          </div>
        </div>
      </div>
      
      <InstructionsModal isOpen={showInstructions} onClose={() => setShowInstructions(false)} />
    </div>
  );
}
