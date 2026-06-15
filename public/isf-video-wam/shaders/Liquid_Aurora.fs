/*{
  "NAME": "Liquid_Aurora",
  "CREDIT": "OpenAI",
  "DESCRIPTION": "Rubans colorés fluides de type aurore liquide",
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 3.0, "DEFAULT": 0.6 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 2.8 },
    { "NAME": "intensity", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.15 },
    { "NAME": "warp", "TYPE": "float", "MIN": 0.0, "MAX": 3.0, "DEFAULT": 1.2 },
    { "NAME": "bands", "TYPE": "float", "MIN": 1.0, "MAX": 14.0, "DEFAULT": 5.0 },
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 1.0, 0.7, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.2, 0.4, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.7, 1.0] }
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.0, 289.0))) * 45758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += noise(p) * a;
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 p = uv - 0.5;
  p.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);

  float t = TIME * speed;
  vec2 q = p * scale;
  float n = fbm(q + vec2(0.0, t * 0.4));
  float m = fbm(q * 1.7 - vec2(t * 0.3, -t * 0.2));

  float ribbons = sin((p.y + n * warp) * bands * 6.28318 + m * 4.0 - t);
  ribbons = smoothstep(-0.2, 0.8, ribbons);

  vec3 col = mix(colorA.rgb, colorB.rgb, clamp(n * 1.2, 0.0, 1.0));
  col = mix(col, colorC.rgb, clamp(m, 0.0, 1.0));
  col *= ribbons * intensity;

  float vignette = smoothstep(1.25, 0.2, length(p));
  col *= vignette;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
