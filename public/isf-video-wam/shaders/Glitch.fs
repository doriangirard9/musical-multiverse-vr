/*{
    "NAME": "TV Glitch",
    "CREDIT": "Gemini CLI",
    "DESCRIPTION": "Analog TV interference",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "intensity", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 }
    ]
}*/

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    vec2 uv = isf_FragNormCoord;
    float r = rand(vec2(TIME, uv.y));
    if (r < intensity * 0.1) {
        uv.x += (rand(vec2(TIME, uv.y)) - 0.5) * 0.1;
    }
    vec4 color = IMG_NORM_PIXEL(inputImage, uv);
    float noise = rand(uv + TIME);
    color.rgb += (noise - 0.5) * intensity * 0.2;
    
    if (color.a < 0.01) color = vec4(vec3(noise), 1.0);
    gl_FragColor = color;
}
