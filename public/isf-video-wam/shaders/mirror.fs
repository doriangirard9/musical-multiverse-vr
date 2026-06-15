/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}] }*/
void main() {
    vec2 uv = isf_FragNormCoord;
    if (uv.x > 0.5) uv.x = 1.0 - uv.x;
    gl_FragColor = IMG_NORM_PIXEL(inputImage, uv);
}