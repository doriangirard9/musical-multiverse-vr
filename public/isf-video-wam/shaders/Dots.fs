/*{
    "NAME": "Dots",
    "CREDIT": "Gemini CLI",
    "DESCRIPTION": "Halftone-like dots",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "size", "TYPE": "float", "DEFAULT": 20.0, "MIN": 5.0, "MAX": 100.0 }
    ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 grid = floor(uv * size) / size;
    vec2 loc = fract(uv * size) - 0.5;
    
    vec4 color = IMG_NORM_PIXEL(inputImage, grid + 0.5/size);
    if (color.a < 0.01) color = vec4(grid.x, grid.y, 1.0, 1.0);
    
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float mask = 1.0 - smoothstep(lum * 0.5, lum * 0.5 + 0.05, length(loc));
    
    gl_FragColor = vec4(color.rgb * mask, 1.0);
}
