"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import type { OrbState } from "./oracle-orb";

interface AudioPipelineOptions {
  onStateChange: (state: OrbState) => void;
  onAmplitudeChange: (amplitude: number) => void;
  isMuted: boolean;
}

interface AudioPipeline {
  start: () => Promise<MediaStream>;
  stop: () => void;
  getAnalyser: () => AnalyserNode | null;
  playAudio: (pcmData: ArrayBuffer, sampleRate?: number) => void;
  isPlayingRef: React.RefObject<boolean>;
}

const SILENCE_THRESHOLD = 0.02;
const SAMPLE_RATE = 16000;

export function useAudioPipeline({ onStateChange, onAmplitudeChange, isMuted }: AudioPipelineOptions): AudioPipeline {
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const [started, setStarted] = useState(false);

  const start = useCallback(async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    audioContextRef.current = ctx;
    streamRef.current = stream;

    // Input chain: mic → analyser
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;
    const inputAnalyser = ctx.createAnalyser();
    inputAnalyser.fftSize = 256;
    source.connect(inputAnalyser);
    inputAnalyserRef.current = inputAnalyser;

    // Output analyser for playback visualization
    const outputAnalyser = ctx.createAnalyser();
    outputAnalyser.fftSize = 256;
    outputAnalyserRef.current = outputAnalyser;

    setStarted(true);
    return stream;
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current = null;
    sourceRef.current = null;
    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;
    setStarted(false);
  }, []);

  const playAudio = useCallback((pcmData: ArrayBuffer, sampleRate = 24000) => {
    const ctx = audioContextRef.current;
    const outputAnalyser = outputAnalyserRef.current;
    if (!ctx || !outputAnalyser) return;

    const int16 = new Int16Array(pcmData);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(outputAnalyser);
    outputAnalyser.connect(ctx.destination);

    isPlayingRef.current = true;
    source.onended = () => {
      isPlayingRef.current = false;
    };
    source.start();
  }, []);

  // Amplitude monitoring loop
  useEffect(() => {
    if (!started) return;

    const dataArray = new Uint8Array(128);

    const tick = () => {
      const analyser = isPlayingRef.current
        ? outputAnalyserRef.current
        : inputAnalyserRef.current;

      if (analyser) {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        onAmplitudeChange(Math.min(rms * 3, 1.0));

        // Determine state from audio levels
        if (isMuted) {
          onStateChange("muted");
        } else if (isPlayingRef.current) {
          onStateChange("speaking");
        } else if (rms > SILENCE_THRESHOLD) {
          onStateChange("listening");
        } else {
          onStateChange("idle");
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [started, isMuted, onAmplitudeChange, onStateChange]);

  return {
    start,
    stop,
    getAnalyser: () => inputAnalyserRef.current,
    playAudio,
    isPlayingRef,
  };
}
