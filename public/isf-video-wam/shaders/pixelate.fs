/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}, {"NAME": "distortion2", "TYPE": "float", "MIN": 1.0, "MAX": 100.0, "DEFAULT": 50.0}] }*/
void main() {
    float size = max(1.0, (1.0 - AUDIO_RMS) * distortion2);
    vec2 uv = floor(isf_FragNormCoord * size) / size;
    gl_FragColor = IMG_NORM_PIXEL(inputImage, uv);
}