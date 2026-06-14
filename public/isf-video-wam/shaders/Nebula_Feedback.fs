/*{
  "NAME": "Nebula_Feedback",
  "CREDIT": "OpenAI",
  "DESCRIPTION": "Nébuleuse colorée avec feedback persistant",
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 3.0, "DEFAULT": 0.25 },
    { "NAME": "feedback", "TYPE": "float", "MIN": 0.0, "MAX": 0.99, "DEFAULT": 0.92 },
    { "NAME": "driftAmount", "TYPE": "float", "MIN": 0.0, "MAX": 0.02, "DEFAULT": 0.003 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.2 },
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.2, 0.5, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.8, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.1, 1.0, 0.8, 1.0] }
  ],
  "PASSES": [
    { "TARGET": "history", "PERSISTENT": true },
    {}
  ]
}*/

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
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

  if (PASSINDEX < 0.5) {
    vec2 p = uv - 0.5;
    p.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);

    float t = TIME * speed;
    vec2 q = p * scale;

    float n = fbm(q + vec2(t * 0.2, -t * 0.15));
    float m = fbm(q * 1.9 + vec2(-t * 0.1, t * 0.22));

    vec3 base = mix(colorA.rgb, colorB.rgb, clamp(n, 0.0, 1.0));
    base = mix(base, colorC.rgb, clamp(m, 0.0, 1.0));

    vec2 drift = vec2(
      sin(t + p.y * 4.0),
      cos(t * 1.2 + p.x * 4.0)
    ) * driftAmount;

    vec4 prev = IMG_NORM_PIXEL(history, fract(uv - drift));
    vec3 col = max(base * 0.08 + prev.rgb * feedback, base * 0.12);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  } else {
    vec4 c = IMG_NORM_PIXEL(history, uv);
    gl_FragColor = vec4(c.rgb, 1.0);
  }
}
