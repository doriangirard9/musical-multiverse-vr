/*{
    "NAME": "Audio Zoom",
    "CREDIT": "Gemini CLI",
    "DESCRIPTION": "Zooms based on audio RMS. Works with or without input image.",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "audioGain", "TYPE": "float", "DEFAULT": 2.0, "MIN": 0.0, "MAX": 10.0 },
        { "NAME": "audioPulse", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 2.0 },
        { "NAME": "zoomIntensity", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 }
    ]
}*/

void main() {
    float zoom = 1.0 + AUDIO_RMS * audioGain * audioPulse * zoomIntensity;
    vec2 uv = isf_FragNormCoord;
    uv = (uv - 0.5) / zoom + 0.5;
    
    // Pattern de fallback si pas d'image
    vec4 pattern = vec4(0.0);
    float grid = mod(floor(uv.x * 20.0) + floor(uv.y * 20.0), 2.0);
    pattern = vec4(vec3(grid * 0.2), 1.0);
    
    vec4 color = IMG_NORM_PIXEL(inputImage, uv);
    
    // Si la texture est vide (noir/transparent), on mixe avec le pattern
    if (color.a < 0.01) {
        gl_FragColor = pattern;
    } else {
        gl_FragColor = color;
    }
}
