/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}, {"NAME": "speed", "TYPE": "float"}] }*/
void main() {
    vec2 uv = isf_FragNormCoord;
    uv.x += sin(uv.y * 10.0 + TIME * speed * 5.0) * 0.05 * AUDIO_RMS;
    gl_FragColor = IMG_NORM_PIXEL(inputImage, uv);
}