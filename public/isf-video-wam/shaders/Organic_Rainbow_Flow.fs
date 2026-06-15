/*{
  "NAME": "Organic_Rainbow_Flow",
  "CREDIT": "OpenAI",
  "DESCRIPTION": "Textures organiques évolutives avec palette arc-en-ciel paramétrable",
  "INPUTS": [
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 12.0, "DEFAULT": 4.0 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 3.0, "DEFAULT": 0.45 },
    { "NAME": "turbulence", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.2 },
    { "NAME": "detail", "TYPE": "float", "MIN": 1.0, "MAX": 8.0, "DEFAULT": 4.0 },
    { "NAME": "rainbowAmount", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0 },
    { "NAME": "hueShift", "TYPE": "float", "MIN": -1.0, "MAX": 1.0, "DEFAULT": 0.0 },
    { "NAME": "saturation", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.1 },
    { "NAME": "contrast", "TYPE": "float", "MIN": 0.2, "MAX": 3.0, "DEFAULT": 1.2 },
    { "NAME": "brightness", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0 },
    { "NAME": "pulse", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 0.35 },
    { "NAME": "invert", "TYPE": "bool", "DEFAULT": false },
    { "NAME": "center", "TYPE": "point2D", "DEFAULT": [0.5, 0.5], "MIN": [0.0, 0.0], "MAX": [1.0, 1.0] },
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.2, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 1.0, 0.6, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.2, 0.4, 1.0, 1.0] }
  ]
}*/

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x)
         + (c - a) * u.y * (1.0 - u.x)
         + (d - b) * u.x * u.y;
}

float fbm(vec2 p, float octs) {
    float v = 0.0;
    float a = 0.5;
    float sum = 0.0;

    for (int i = 0; i < 8; i++) {
        if (float(i) >= octs) break;
        v += noise(p) * a;
        sum += a;
        p *= 2.03;
        a *= 0.5;
    }

    return v / max(sum, 0.0001);
}

vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

vec3 palette(float t, vec3 a, vec3 b, vec3 c) {
    if (t < 0.5) {
        return mix(a, b, smoothstep(0.0, 0.5, t));
    }
    return mix(b, c, smoothstep(0.5, 1.0, t));
}

void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 p = uv - center;

    p.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);

    float t = TIME * speed;
    float radial = length(p);
    float angle = atan(p.y, p.x);

    vec2 q = p * scale;
    q += vec2(cos(t * 0.7 + radial * 3.0), sin(t * 0.9 - radial * 2.0)) * turbulence * 0.35;

    float n1 = fbm(q + vec2(t * 0.7, -t * 0.5), detail);
    float n2 = fbm(q * 1.7 + vec2(-t * 0.4, t * 0.8), detail);
    float n3 = fbm(q * 2.4 + vec2(sin(angle * 2.0 + t), cos(angle * 3.0 - t)), detail);

    float organic = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
    organic += sin(radial * 10.0 - t * 2.0 + organic * 6.0) * 0.12;
    organic += cos(angle * 5.0 + t * 1.4 + organic * 4.0) * 0.08;

    float pulseWave = 1.0 + pulse * 0.25 * sin(TIME * 2.0 + radial * 12.0);
    organic *= pulseWave;

    float hue = fract(organic * rainbowAmount + hueShift + radial * 0.2 - t * 0.05);
    vec3 rainbow = hsv2rgb(vec3(hue, saturation, 1.0));

    vec3 custom = palette(fract(organic), colorA.rgb, colorB.rgb, colorC.rgb);

    vec3 col = mix(custom, rainbow, clamp(rainbowAmount * 0.65, 0.0, 1.0));

    col *= brightness;
    col = (col - 0.5) * contrast + 0.5;
    col = clamp(col, 0.0, 1.0);

    if (invert > 0.5) {
        col = 1.0 - col;
    }

    gl_FragColor = vec4(col, 1.0);
}
