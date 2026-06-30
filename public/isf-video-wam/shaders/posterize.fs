/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}] }*/
void main() {
    vec4 color = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);
    float levels = 4.0 + AUDIO_RMS * 10.0;
    color.rgb = floor(color.rgb * levels) / levels;
    gl_FragColor = color;
}