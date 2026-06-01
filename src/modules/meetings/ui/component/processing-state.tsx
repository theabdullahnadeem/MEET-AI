"use client";

import { useState, useEffect } from "react";
import { Loader2, BrainCircuit } from "lucide-react";

const LOADING_STEPS = [
  "Fetching meeting transcriptions…",
  "Running speaker identification…",
  "Synthesizing conversational threads…",
  "Extracting key discussion points…",
  "Generating AI summary…",
];

export const ProcessingState = () => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative overflow-hidden bg-white rounded-lg border p-12 flex flex-col items-center justify-center min-h-[360px] text-center">
      {/* Subtle background gradient accents */}
      <div className="absolute top-0 left-1/4 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-30 animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-purple-100 rounded-full blur-3xl opacity-30 animate-pulse" />

      <div className="relative z-10 flex flex-col items-center gap-y-6">
        {/* Animated icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500 rounded-full blur-md opacity-20 animate-ping" />
          <div className="bg-blue-600 text-white p-4 rounded-full relative flex items-center justify-center">
            <BrainCircuit className="size-8 animate-spin" style={{ animationDuration: "3s" }} />
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col gap-y-2">
          <h3 className="text-xl font-semibold text-gray-800 tracking-tight">
            Analyzing Your Meeting
          </h3>
          <p className="text-gray-500 text-sm max-w-sm">
            Our AI is processing the recording, mapping speakers, and generating your summary. This usually takes 1–3 minutes.
          </p>
        </div>

        {/* Cycling step indicator */}
        <div className="mt-2 flex items-center gap-x-3 bg-blue-50 border border-blue-100 px-5 py-2.5 rounded-full text-blue-700 text-sm font-medium transition-all duration-300">
          <Loader2 className="size-4 animate-spin text-blue-600" />
          <span key={stepIndex} className="animate-fade-in">
            {LOADING_STEPS[stepIndex]}
          </span>
        </div>
      </div>
    </div>
  );
};
