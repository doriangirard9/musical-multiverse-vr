/*{
  "NAME": "Chain_Source",
  "CREDIT": "Copilot",
  "DESCRIPTION": "Source pour chaînage: motif animé coloré",
  "INPUTS": [
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 3.0, "DEFAULT": 0.8 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 8.0 },
    { "NAME": "contrast", "TYPE": "float", "MIN": 0.2, "MAX": 3.0, "DEFAULT": 1.2 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  float t = TIME * speed;

  float gx = sin((uv.x * scale + t) * 6.28318);
  float gy = sin((uv.y * scale - t * 0.7) * 6.28318);
  float g = 0.5 + 0.5 * gx * gy;

  vec3 colorA = vec3(0.12, 0.85, 1.0);
  vec3 colorB = vec3(1.0, 0.2, 0.55);
  vec3 color = mix(colorA, colorB, g);

  color = pow(color, vec3(contrast));
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
