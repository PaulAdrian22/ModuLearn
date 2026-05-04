import React, { useState } from 'react';

/**
 * Safety disclaimer shown before any hardware-handling simulation.
 *
 * Why this exists: the thesis evaluation flagged that the platform's
 * simulations don't convey ESD risks, improper-force injury, or that
 * simulation mastery doesn't equal physical proficiency. This modal makes
 * the limitation explicit and requires acknowledgement before the activity
 * can begin.
 *
 * The acknowledgement persists in sessionStorage per simulation so users
 * don't see it twice during the same browser session, but they DO see it
 * fresh after closing/reopening the tab — intentional safety repetition.
 */

const SAFETY_POINTS = [
  'This simulation is a learning aid only. It does not replace hands-on practice with proper safety supervision.',
  'In real hardware work, always wear an anti-static (ESD) wrist strap and unplug the system from power before touching internal components.',
  'Static electricity from your body can permanently damage CPUs, RAM, and motherboards. The simulation cannot show this risk visually.',
  'Never force a component into a slot. If it does not fit easily, you have the orientation wrong — re-check it.',
  'Lift and handle equipment with two hands. Damaged equipment can have sharp edges; cuts are common in real work.',
];

const SafetyDisclaimer = ({ simulationId, onAcknowledge }) => {
  const [agreed, setAgreed] = useState(false);
  const storageKey = `sim_safety_ack_${simulationId}`;

  // Skip the modal if already acknowledged this session.
  if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey) === 'true') {
    // Defer the callback so it runs after the parent's render.
    setTimeout(() => onAcknowledge?.(), 0);
    return null;
  }

  const handleAccept = () => {
    if (!agreed) return;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(storageKey, 'true');
    }
    onAcknowledge?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0B2B4C]">Safety reminder before you start</h2>
            <p className="text-sm text-gray-600 mt-1">Read before working with real hardware.</p>
          </div>
        </div>

        <ul className="space-y-2 mb-5 text-sm text-gray-800">
          {SAFETY_POINTS.map((point, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-amber-600 font-bold">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <label className="flex items-start gap-2 mb-5 text-sm text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1"
          />
          <span>
            I understand that completing this simulation does not certify me to work
            on real hardware unsupervised.
          </span>
        </label>

        <button
          type="button"
          onClick={handleAccept}
          disabled={!agreed}
          className={`w-full py-3 rounded-xl font-bold text-white transition-all ${
            agreed
              ? 'bg-[#0B2B4C] hover:bg-[#1a3d5c] active:scale-[0.98] shadow-lg'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          I understand — start the simulation
        </button>
      </div>
    </div>
  );
};

export default SafetyDisclaimer;
