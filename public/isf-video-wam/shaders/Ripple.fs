/*{
    "NAME": "Circular Ripple",
    "CREDIT": "Gemini CLI",
    "DESCRIPTION": "Animated circular ripple effect",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "frequency", "TYPE": "float", "DEFAULT": 20.0, "MIN": 0.0, "MAX": 100.0 },
        { "NAME": "speed", "TYPE": "float", "DEFAULT": 5.0, "MIN": 0.0, "MAX": 20.0 },
        { "NAME": "amplitude", "TYPE": "float", "DEFAULT": 0.02, "MIN": 0.0, "MAX": 0.1 }
    ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    float dist = distance(uv, vec2(0.5, 0.5));
    float offset = sin(dist * frequency - TIME * speed) * amplitude;
    vec2 newUv = uv + (uv - 0.5) * offset;
    
    vec4 color = IMG_NORM_PIXEL(inputImage, newUv);
    if (color.a < 0.01) color = vec4(uv.x, uv.y, sin(TIME)*0.5+0.5, 1.0);
    gl_FragColor = color;
}
