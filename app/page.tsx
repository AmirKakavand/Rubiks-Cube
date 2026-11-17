"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, ContactShadows, Sparkles } from "@react-three/drei";
import RubiksCube, { Move, Axis, moveToNotation } from "./Components/RubiksCube";

export default function Home() {
  const [moveQueue, setMoveQueue] = useState<Move[]>([]);
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [isSolved, setIsSolved] = useState(true);
  const [hasScrambled, setHasScrambled] = useState(false);
  const [isScrambling, setIsScrambling] = useState(false);
  const [cubeInstanceKey, setCubeInstanceKey] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Deterministic refs for animation & timer lifecycle
  const scrambleRemainingRef = useRef(0);
  const undoRemainingRef = useRef(0);
  const timerRunningRef = useRef(false);
  const timerStartRef = useRef<number | null>(null);
  const playerMovedRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Reusable Web Audio context for crisp plastic click feedback
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Speedrun timer state
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning) return;

    const interval = setInterval(() => {
      if (timerStartRef.current !== null) {
        setElapsedMs(performance.now() - timerStartRef.current);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [timerRunning]);

  // Synthesize a subtle tactile plastic click + trigger mobile haptic pulse
  const triggerSnapFeedback = useCallback((duringScramble: boolean) => {
    // Haptic feedback on mobile devices (light crisp pulse on user turns, subtle tick on scramble)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(duringScramble ? 6 : 15);
      } catch {
        // Ignore on unsupported browsers
      }
    }

    if (!soundEnabledRef.current || typeof window === "undefined") return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Short percussive plastic snap
      osc.type = "triangle";
      const baseFreq = duringScramble ? 290 + Math.random() * 60 : 240 + Math.random() * 40;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.038);

      const peakGain = duringScramble ? 0.05 : 0.14;
      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);
    } catch {
      // Ignore audio errors if blocked before user interaction
    }
  }, []);

  const startTimerIfNeeded = useCallback(() => {
    if (!timerRunningRef.current) {
      timerRunningRef.current = true;
      timerStartRef.current = performance.now() - elapsedMs;
      setTimerRunning(true);
    }
  }, [elapsedMs]);

  const stopTimer = useCallback(() => {
    if (timerRunningRef.current) {
      if (timerStartRef.current !== null) {
        setElapsedMs(performance.now() - timerStartRef.current);
      }
      timerRunningRef.current = false;
      timerStartRef.current = null;
      setTimerRunning(false);
    }
  }, []);

  const queueMove = useCallback(
    (move: Move) => {
      if (scrambleRemainingRef.current > 0 || undoRemainingRef.current > 0) return;

      playerMovedRef.current = true;
      startTimerIfNeeded();
      setMoveQueue((prev) => [...prev, move]);
    },
    [startTimerIfNeeded]
  );

  const handleMoveComplete = useCallback((completed: Move) => {
    setMoveQueue((prev) => prev.slice(1));

    if (scrambleRemainingRef.current > 0) {
      scrambleRemainingRef.current -= 1;
      if (scrambleRemainingRef.current === 0) {
        setIsScrambling(false);
      }
    } else if (undoRemainingRef.current > 0) {
      undoRemainingRef.current -= 1;
    } else {
      setMoveHistory((prev) => [...prev, completed]);
    }
  }, []);

  const handleCubeStateChange = useCallback(
    (solved: boolean) => {
      setIsSolved(solved);

      if (solved && scrambleRemainingRef.current === 0 && playerMovedRef.current) {
        stopTimer();
        // Celebratory double haptic pulse on solve
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate([25, 50, 40]);
          } catch {
            // Ignore
          }
        }
      }
    },
    [stopTimer]
  );

  // Generate a 20-move random scramble avoiding redundant consecutive axes
  const handleScramble = () => {
    if (
      scrambleRemainingRef.current > 0 ||
      undoRemainingRef.current > 0 ||
      moveQueue.length > 0
    ) {
      return;
    }

    const axes: Axis[] = ["x", "y", "z"];
    const layers: (-1 | 1)[] = [-1, 1];
    const dirs: (1 | -1)[] = [-1, 1];

    const scrambleMoves: Move[] = [];
    let lastAxis: Axis | null = null;

    for (let i = 0; i < 20; i++) {
      const availableAxes = axes.filter((a) => a !== lastAxis);
      const axis = availableAxes[Math.floor(Math.random() * availableAxes.length)];
      const layer = layers[Math.floor(Math.random() * layers.length)];
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      lastAxis = axis;

      scrambleMoves.push({
        axis,
        layer,
        dir,
        notation: moveToNotation(axis, layer, dir),
      });
    }

    timerRunningRef.current = false;
    timerStartRef.current = null;
    playerMovedRef.current = false;
    undoRemainingRef.current = 0;
    scrambleRemainingRef.current = scrambleMoves.length;

    setTimerRunning(false);
    setElapsedMs(0);
    setMoveHistory([]);
    setIsSolved(false);
    setHasScrambled(true);
    setIsScrambling(true);
    setMoveQueue(scrambleMoves);
  };

  const handleUndo = () => {
    if (
      moveHistory.length === 0 ||
      moveQueue.length > 0 ||
      scrambleRemainingRef.current > 0 ||
      undoRemainingRef.current > 0
    ) {
      return;
    }

    const last = moveHistory[moveHistory.length - 1];
    const inverseDir = (last.dir * -1) as 1 | -1;

    undoRemainingRef.current = 1;
    setMoveHistory((prev) => prev.slice(0, -1));
    setMoveQueue([
      {
        axis: last.axis,
        layer: last.layer,
        dir: inverseDir,
        notation: moveToNotation(last.axis, last.layer, inverseDir),
      },
    ]);
  };

  const handleReset = () => {
    scrambleRemainingRef.current = 0;
    undoRemainingRef.current = 0;
    timerRunningRef.current = false;
    timerStartRef.current = null;
    playerMovedRef.current = false;

    setMoveQueue([]);
    setMoveHistory([]);
    setHasScrambled(false);
    setIsScrambling(false);
    setTimerRunning(false);
    setElapsedMs(0);
    setIsSolved(true);
    setCubeInstanceKey((k) => k + 1);
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${minutes > 0 ? `${minutes}:` : ""}${seconds
      .toString()
      .padStart(minutes > 0 ? 2 : 1, "0")}.${centiseconds.toString().padStart(2, "0")}s`;
  };

  return (
    <main className="relative h-[100dvh] w-screen touch-none overflow-hidden bg-[radial-gradient(circle_at_center,#1e293b_0%,#090d16_100%)] text-slate-100 select-none">
      {/* Top HUD */}
      <header className="pointer-events-none absolute top-0 left-0 right-0 z-10 flex items-start justify-between gap-2 p-4 sm:items-center sm:p-6">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
            Rubik&apos;s Cube 3D
          </h1>
          <p className="hidden text-xs text-slate-400 sm:block">
            Drag any face to twist • Drag background to orbit • Keys: U D L R F B
          </p>
          <p className="text-[11px] text-slate-400 sm:hidden">
            Swipe face to twist • Drag outside to orbit
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((s) => !s)}
            aria-label={soundEnabled ? "Mute sound" : "Unmute sound"}
            title={soundEnabled ? "Mute click sounds" : "Enable click sounds"}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/70 text-slate-300 backdrop-blur-md shadow-xl transition hover:bg-white/10 hover:text-white active:scale-95 sm:h-11 sm:w-11 cursor-pointer"
          >
            {soundEnabled ? (
              <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg className="h-4 w-4 sm:h-5 sm:w-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>

          {/* Timer & Move Counter */}
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-3.5 py-2 backdrop-blur-md shadow-xl sm:gap-4 sm:px-5 sm:py-2.5">
            <div className="text-right">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[10px]">
                Time
              </div>
              <div className="font-mono text-base font-bold tabular-nums text-sky-400 sm:text-lg">
                {formatTime(elapsedMs)}
              </div>
            </div>
            <div className="h-6 w-px bg-white/10 sm:h-7" />
            <div className="text-right">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 sm:text-[10px]">
                Moves
              </div>
              <div className="font-mono text-base font-bold tabular-nums text-white sm:text-lg">
                {moveHistory.length}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Solved Banner */}
      {isSolved && hasScrambled && !isScrambling && moveHistory.length > 0 && (
        <div className="pointer-events-none absolute top-20 left-1/2 z-20 w-max max-w-[90vw] -translate-x-1/2 animate-bounce sm:top-24">
          <div className="rounded-full border border-emerald-400/40 bg-emerald-500/25 px-5 py-2 text-center text-xs font-semibold text-emerald-200 backdrop-blur-md shadow-lg sm:px-6 sm:text-sm">
            Solved in {formatTime(elapsedMs)} ({moveHistory.length} moves)!
          </div>
        </div>
      )}

      {/* 3D Scene */}
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [5.6, 4.8, 6.4], fov: 44 }}
        style={{ touchAction: "none" }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight
          position={[6, 10, 7]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-6, -4, -6]} intensity={0.6} color="#38bdf8" />

        <Environment preset="city" />

        <Suspense fallback={null}>
          <RubiksCube
            key={cubeInstanceKey}
            moveQueue={moveQueue}
            onMoveComplete={handleMoveComplete}
            onQueueMove={queueMove}
            onCubeStateChange={handleCubeStateChange}
            onSnapFeedback={triggerSnapFeedback}
            isScrambling={isScrambling}
          />
        </Suspense>

        <ContactShadows
          position={[0, -2.5, 0]}
          opacity={0.45}
          scale={12}
          blur={2.4}
          far={4.5}
        />

        <Sparkles count={30} scale={10} size={1.5} speed={0.25} opacity={0.25} color="#94a3b8" />
      </Canvas>

      {/* Bottom Controls */}
      <footer className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex w-full max-w-md -translate-x-1/2 justify-center px-4 sm:bottom-7">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-1.5 backdrop-blur-md shadow-2xl sm:gap-2.5 sm:p-2">
          <button
            type="button"
            onClick={handleScramble}
            disabled={moveQueue.length > 0 || isScrambling}
            className="rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 transition active:scale-95 hover:bg-sky-400 disabled:opacity-40 sm:py-2 sm:text-sm cursor-pointer"
          >
            {isScrambling ? "Scrambling..." : "Scramble"}
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={moveHistory.length === 0 || moveQueue.length > 0 || isScrambling}
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-medium text-slate-200 transition active:scale-95 hover:bg-white/10 disabled:opacity-40 sm:py-2 sm:text-sm cursor-pointer"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-medium text-slate-200 transition active:scale-95 hover:bg-white/10 sm:py-2 sm:text-sm cursor-pointer"
          >
            Reset
          </button>
        </div>
      </footer>
    </main>
  );
}