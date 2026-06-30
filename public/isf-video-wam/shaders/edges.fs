/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}] }*/
void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 d = 1.0 / RENDERSIZE;
    vec4 c = IMG_NORM_PIXEL(inputImage, uv);
    vec4 r = IMG_NORM_PIXEL(inputImage, uv + vec2(d.x, 0));
    vec4 b = IMG_NORM_PIXEL(inputImage, uv + vec2(0, d.y));
    float diff = length(c - r) + length(c - b);
    gl_FragColor = vec4(vec3(diff * 5.0 * (1.0 + AUDIO_RMS)), 1.0);
}