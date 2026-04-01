export const ORB_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const ORB_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform float u_amplitude;
uniform float u_state; // 0=idle, 1=listening, 2=thinking, 3=speaking, 4=muted
uniform vec2 u_resolution;

// Simplex-style noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x_) - 0.5;
  vec3 ox = floor(x_ + 0.5);
  vec3 a0 = x_ - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = v_uv;
  vec2 center = vec2(0.5);
  float aspect = u_resolution.x / u_resolution.y;
  vec2 pos = (uv - center) * vec2(aspect, 1.0);
  float dist = length(pos);

  // State-driven parameters
  float breathRate = mix(1.0, 0.3, step(3.5, u_state)); // slow when muted
  float coreScale = 1.0;
  float glowIntensity = 1.0;
  float ringSpeed = 1.0;
  float goldMix = 0.5;

  // Idle (0)
  float idleWeight = 1.0 - min(u_state, 1.0);
  // Listening (1)
  float listenWeight = max(0.0, 1.0 - abs(u_state - 1.0));
  coreScale -= 0.05 * listenWeight;
  goldMix += 0.3 * listenWeight;
  glowIntensity -= 0.3 * listenWeight;
  // Thinking (2)
  float thinkWeight = max(0.0, 1.0 - abs(u_state - 2.0));
  ringSpeed += 2.0 * thinkWeight;
  breathRate += 3.0 * thinkWeight;
  // Speaking (3)
  float speakWeight = max(0.0, 1.0 - abs(u_state - 3.0));
  coreScale += 0.1 * speakWeight;
  goldMix -= 0.3 * speakWeight;
  glowIntensity += 0.5 * speakWeight;
  ringSpeed += 1.0 * speakWeight;
  // Muted (4)
  float muteWeight = max(0.0, 1.0 - abs(u_state - 4.0));
  glowIntensity -= 0.6 * muteWeight;
  ringSpeed -= 0.8 * muteWeight;

  // Audio amplitude modulation
  float amp = u_amplitude;
  coreScale += amp * 0.12;
  glowIntensity += amp * 0.4;
  ringSpeed += amp * 0.5;

  // Breathing animation
  float breath = sin(u_time * breathRate) * 0.02 + 1.0;
  coreScale *= breath;

  // Noise distortion on sphere surface
  float noise = snoise(pos * 3.0 + u_time * 0.3) * 0.04;
  float coreDist = dist / (0.18 * coreScale) + noise;

  // Core sphere gradient: gold center -> purple edge
  vec3 gold = vec3(0.784, 0.471, 0.157);   // #c87828
  vec3 purple = vec3(0.314, 0.157, 0.627); // #5028a0
  vec3 coreColor = mix(gold, purple, smoothstep(0.0, 1.0, coreDist * goldMix * 2.0));
  float coreAlpha = smoothstep(1.1, 0.5, coreDist);

  // Runic rings
  float ring1Dist = abs(dist - 0.22 * coreScale);
  float ring1Angle = atan(pos.y, pos.x) + u_time * 0.3 * ringSpeed;
  float ring1Dash = step(0.5, fract(ring1Angle * 3.0 / 6.283));
  float ring1 = smoothstep(0.004, 0.001, ring1Dist) * ring1Dash * 0.4;

  float ring2Dist = abs(dist - 0.28 * coreScale);
  float ring2Angle = atan(pos.y, pos.x) - u_time * 0.2 * ringSpeed;
  float ring2Dash = step(0.4, fract(ring2Angle * 5.0 / 6.283));
  float ring2 = smoothstep(0.003, 0.001, ring2Dist) * ring2Dash * 0.3;

  vec3 ringColor1 = gold * ring1;
  vec3 ringColor2 = purple * ring2;

  // Glow / bloom
  float glow = exp(-dist * 4.0 / (0.25 * coreScale)) * 0.3 * glowIntensity;
  vec3 glowColor = mix(gold, purple, 0.5) * glow;

  // Particles (simple noise-based sparkles)
  float particleNoise = snoise(pos * 20.0 + u_time * 0.5);
  float particles = smoothstep(0.85, 0.95, particleNoise) * smoothstep(0.35, 0.2, dist) * 0.5;
  vec3 particleColor = mix(gold, purple, step(0.5, fract(particleNoise * 10.0))) * particles;

  // Composite
  vec3 color = coreColor * coreAlpha + ringColor1 + ringColor2 + glowColor + particleColor;
  float alpha = max(coreAlpha, max(glow * 2.0, max(ring1, max(ring2, particles))));
  alpha = clamp(alpha, 0.0, 1.0);

  fragColor = vec4(color, alpha);
}
`;
