/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}] }*/
void main() {
    vec4 color = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);
    gl_FragColor = vec4(1.0 - color.rgb, 1.0);
}