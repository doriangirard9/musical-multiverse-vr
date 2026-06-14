/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}, {"NAME": "hue", "TYPE": "float"}] }*/
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
void main() {
    vec4 color = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);
    gl_FragColor = vec4(hsv2rgb(vec3(hue + TIME * 0.1, 1.0, 1.0)) * color.rgb, 1.0);
}