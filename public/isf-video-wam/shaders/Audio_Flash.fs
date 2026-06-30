/*{
    "NAME": "Audio Flash",
    "CREDIT": "Gemini CLI",
    "DESCRIPTION": "Flashes based on audio RMS",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "audioGain", "TYPE": "float", "DEFAULT": 2.0, "MIN": 0.0, "MAX": 10.0 },
        { "NAME": "audioPulse", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 2.0 },
        { "NAME": "flashColor", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] }
    ]
}*/

void main() {
    vec4 color = IMG_THIS_PIXEL(inputImage);
    float flash = AUDIO_RMS * audioGain * audioPulse;
    
    // Fallback si pas d'image
    if (color.a < 0.01) {
        color = vec4(0.1, 0.1, 0.1, 1.0);
    }
    
    gl_FragColor = mix(color, flashColor, clamp(flash, 0.0, 1.0));
}
