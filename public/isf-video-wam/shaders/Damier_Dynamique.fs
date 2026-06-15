/*{
    "NAME": "Damier_Dynamique",
    "CREDIT": "Gemini",
    "DESCRIPTION": "Génère un damier noir et blanc ajustable",
    "INPUTS": [
        {
            "NAME": "colonnes",
            "TYPE": "float",
            "MIN": 1.0,
            "MAX": 50.0,
            "DEFAULT": 8.0
        },
        {
            "NAME": "lignes",
            "TYPE": "float",
            "MIN": 1.0,
            "MAX": 50.0,
            "DEFAULT": 8.0
        }
    ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    float x = floor(uv.x * colonnes);
    float y = floor(uv.y * lignes);
    float color = mod(x + y, 2.0);
    gl_FragColor = vec4(vec3(color), 1.0);
}
