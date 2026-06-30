/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}, {"NAME": "audioGain", "TYPE": "float"}] }*/
void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 dir = uv - 0.5;
    vec4 color = vec4(0.0);
    float blur = AUDIO_RMS * audioGain * 0.1;
    for(float i = 0.0; i < 10.0; i++) {
        color += IMG_NORM_PIXEL(inputImage, uv - dir * i * blur);
    }
    gl_FragColor = color / 10.0;
}