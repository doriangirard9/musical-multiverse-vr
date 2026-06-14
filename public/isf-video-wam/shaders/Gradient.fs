/*{
    "NAME": "Gradient",
    "CREDIT": "Gemini CLI",
    "DESCRIPTION": "Linear gradient",
    "INPUTS": [
        { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
        { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
        { "NAME": "angle", "TYPE": "float", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 6.28 }
    ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 dir = vec2(cos(angle), sin(angle));
    float d = dot(uv - 0.5, dir) + 0.5;
    gl_FragColor = mix(colorA, colorB, clamp(d, 0.0, 1.0));
}
