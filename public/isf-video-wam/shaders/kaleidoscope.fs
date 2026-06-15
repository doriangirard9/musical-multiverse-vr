/*{ "INPUTS": [{"NAME": "inputImage", "TYPE": "image"}, {"NAME": "speed", "TYPE": "float", "DEFAULT": 0.3}] }*/
void main() {
    vec2 uv = isf_FragNormCoord - 0.5;
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    float a = mod(angle + TIME * speed, 3.14159 / 4.0);
    a = abs(a - 3.14159 / 8.0);
    uv = vec2(cos(a), sin(a)) * radius;
    gl_FragColor = IMG_NORM_PIXEL(inputImage, uv + 0.5);
}