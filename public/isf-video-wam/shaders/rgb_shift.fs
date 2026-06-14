/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}, {"NAME": "distortion1", "TYPE": "float", "DEFAULT": 0.5}] }*/
void main() {
    vec2 uv = isf_FragNormCoord;
    float amount = distortion1 * 0.05 * AUDIO_RMS;
    float r = IMG_NORM_PIXEL(inputImage, uv + vec2(amount, 0.0)).r;
    float g = IMG_NORM_PIXEL(inputImage, uv).g;
    float b = IMG_NORM_PIXEL(inputImage, uv - vec2(amount, 0.0)).b;
    gl_FragColor = vec4(r, g, b, 1.0);
}