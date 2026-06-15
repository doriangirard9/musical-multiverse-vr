/*{
    "NAME": "Audio Distort",
    "CREDIT": "Gemini CLI",
    "DESCRIPTION": "Waves based on audio RMS",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "audioGain", "TYPE": "float", "DEFAULT": 2.0, "MIN": 0.0, "MAX": 10.0 },
        { "NAME": "audioPulse", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 2.0 },
        { "NAME": "distortion", "TYPE": "float", "DEFAULT": 0.1, "MIN": 0.0, "MAX": 0.5 }
    ]
}*/

void main() {
    float strength = AUDIO_RMS * audioGain * audioPulse * distortion;
    vec2 uv = isf_FragNormCoord;
    uv.x += sin(uv.y * 10.0 + TIME) * strength;
    uv.y += cos(uv.x * 10.0 + TIME) * strength;
    
    vec4 color = IMG_NORM_PIXEL(inputImage, uv);
    
    // Fallback pattern
    if (color.a < 0.01) {
        float pattern = sin(uv.x * 40.0) * sin(uv.y * 40.0);
        color = vec4(vec3(pattern * 0.3 + 0.3), 1.0);
    }
    
    gl_FragColor = color;
}
