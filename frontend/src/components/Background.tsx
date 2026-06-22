import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "../hooks/useReducedMotion";

const GRADIENT = "linear-gradient(135deg, #eef2f7 0%, #dde6f0 50%, #e8eef5 100%)";

const layerStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: -1,
  pointerEvents: "none",
};

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec2 res;
uniform float t;
void main(){
  vec2 uv = gl_FragCoord.xy / res;
  float v = 0.5 + 0.5 * sin(uv.x * 3.0 + t * 0.2) * cos(uv.y * 3.0 - t * 0.15);
  vec3 col = mix(vec3(0.93, 0.95, 0.97), vec3(0.86, 0.90, 0.94), v);
  gl_FragColor = vec4(col, 1.0);
}`;

function startGL(canvas: HTMLCanvasElement): (() => void) | null {
  const gl = canvas.getContext("webgl");
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "res");
  const uT = gl.getUniformLocation(prog, "t");

  let raf = 0;
  const t0 = performance.now();
  const draw = () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uT, (performance.now() - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(draw);
  };
  draw();
  return () => cancelAnimationFrame(raf);
}

export function Background({ enabled }: { enabled: boolean }) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [glFailed, setGlFailed] = useState(false);
  const animate = enabled && !reduced && !glFailed;

  useEffect(() => {
    if (!animate || !canvasRef.current) return;
    const stop = startGL(canvasRef.current);
    if (!stop) {
      setGlFailed(true);
      return;
    }
    return stop;
  }, [animate]);

  if (!animate) {
    return <div data-testid="bg-gradient" style={{ ...layerStyle, background: GRADIENT }} />;
  }
  return <canvas data-testid="bg-canvas" ref={canvasRef} style={{ ...layerStyle, width: "100%", height: "100%" }} />;
}
