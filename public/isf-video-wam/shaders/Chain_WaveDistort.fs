/*{
  "NAME": "Chain_WaveDistort",
  "CREDIT": "Copilot",
  "DESCRIPTION": "Post-process chaînable: déformation + mélange",
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
    { "NAME": "amount", "TYPE": "float", "MIN": 0.0, "MAX": 0.08, "DEFAULT": 0.02 },
    { "NAME": "frequency", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 8.0 },
    { "NAME": "mixAmt", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.8 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * 0.9;

  vec2 offset;
  offset.x = sin((uv.y * frequency + t) * 6.28318) * amount;
  offset.y = cos((uv.x * frequency - t * 1.1) * 6.28318) * amount;

  vec4 src = IMG_NORM_PIXEL(inputImage, uv);
  vec4 warped = IMG_NORM_PIXEL(inputImage, uv + offset);

  vec3 col = mix(src.rgb, warped.rgb, mixAmt);
  gl_FragColor = vec4(col, 1.0);
}
