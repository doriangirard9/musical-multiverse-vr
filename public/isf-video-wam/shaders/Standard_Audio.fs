/*{
    "NAME": "Standard Audio Visualizer",
    "CREDIT": "Gemini CLI",
    "DESCRIPTION": "Standard ISF Audio Input Test",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "wave", "TYPE": "audio" },
        { "NAME": "fft", "TYPE": "audioFFT" },
        { "NAME": "gain", "TYPE": "float", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 5.0 }
    ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    
    // Lecture de la waveform (haut de l'écran)
    float waveVal = texture2D(wave, vec2(uv.x, 0.5)).r;
    float waveLine = smoothstep(0.01, 0.0, abs(uv.y - 0.75 - (waveVal - 0.5) * 0.4));
    
    // Lecture de la FFT (bas de l'écran)
    float fftVal = texture2D(fft, vec2(uv.x, 0.5)).r;
    float fftBar = step(uv.y, fftVal * gain * 0.5);
    
    vec4 video = IMG_NORM_PIXEL(inputImage, uv);
    if (video.a < 0.01) video = vec4(0.0, 0.0, 0.0, 1.0);
    
    vec3 color = video.rgb;
    color = mix(color, vec3(0.0, 1.0, 0.0), waveLine);
    color = mix(color, vec3(1.0, 0.5, 0.0), fftBar * 0.5);
    
    gl_FragColor = vec4(color, 1.0);
}
