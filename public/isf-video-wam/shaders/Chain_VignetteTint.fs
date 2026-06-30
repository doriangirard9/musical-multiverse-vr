/*{
  "NAME": "Chain_VignetteTint",
  "CREDIT": "Copilot",
  "DESCRIPTION": "Post-process final chaînable: vignette et teinte",
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "vignette", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.45 },
    { "NAME": "saturation", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.1 },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [1.0, 0.95, 1.0, 1.0] }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 src = IMG_NORM_PIXEL(inputImage, uv);

  float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  vec3 sat = mix(vec3(lum), src.rgb, saturation);

  vec2 p = uv - 0.5;
  p.x *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float v = smoothstep(0.9, vignette, length(p));

  vec3 col = sat * tint.rgb * v;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
