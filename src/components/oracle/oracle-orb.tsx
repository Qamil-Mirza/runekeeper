"use client";

import { useRef, useEffect, useCallback, useState } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "muted";

const STATE_VALUES: Record<OrbState, number> = {
  idle: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
  muted: 4,
};

interface OracleOrbProps {
  state: OrbState;
  amplitude: number; // 0.0 - 1.0
  size?: number;
  className?: string;
}

import { ORB_VERTEX_SHADER, ORB_FRAGMENT_SHADER } from "./orb-shaders";
import { OracleOrbFallback } from "./oracle-orb-fallback";

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, ORB_VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, ORB_FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function OracleOrb({ state, amplitude, size = 240, className }: OracleOrbProps) {
  const [webglSupported, setWebglSupported] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(Date.now());
  const currentStateRef = useRef(0);
  const targetStateRef = useRef(0);
  const currentAmplitudeRef = useRef(0);

  targetStateRef.current = STATE_VALUES[state];
  const targetAmplitude = amplitude;

  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      setWebglSupported(false);
      return false;
    }

    glRef.current = gl;
    const program = createProgram(gl);
    if (!program) return false;
    programRef.current = program;

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);
    uniformsRef.current = {
      u_time: gl.getUniformLocation(program, "u_time"),
      u_amplitude: gl.getUniformLocation(program, "u_amplitude"),
      u_state: gl.getUniformLocation(program, "u_state"),
      u_resolution: gl.getUniformLocation(program, "u_resolution"),
    };

    gl.uniform2f(uniformsRef.current.u_resolution, canvas.width, canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    return true;
  }, [size]);

  const animate = useCallback(() => {
    const gl = glRef.current;
    const uniforms = uniformsRef.current;
    if (!gl || !programRef.current) return;

    currentStateRef.current += (targetStateRef.current - currentStateRef.current) * 0.05;
    currentAmplitudeRef.current += (targetAmplitude - currentAmplitudeRef.current) * 0.15;

    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    gl.uniform1f(uniforms.u_time, elapsed);
    gl.uniform1f(uniforms.u_amplitude, currentAmplitudeRef.current);
    gl.uniform1f(uniforms.u_state, currentStateRef.current);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    rafRef.current = requestAnimationFrame(animate);
  }, [targetAmplitude]);

  useEffect(() => {
    const success = initGL();
    if (success) {
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [initGL, animate]);

  if (!webglSupported) {
    return <OracleOrbFallback state={state} amplitude={amplitude} size={size} className={className} />;
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
