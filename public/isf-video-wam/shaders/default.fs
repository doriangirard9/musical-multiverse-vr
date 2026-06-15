
/*{
    "CREDIT": "Adapted from Tom Burns & VIDVOX",
    "CATEGORIES": ["Glitch", "Audio-Reactive"],
    "INPUTS": [
        {"NAME": "inputImage", "TYPE": "image"},
        {"NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 0.3},
        {"NAME": "noiseLevel", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.2},
        {"NAME": "distortion1", "TYPE": "float", "MIN": 0.0, "MAX": 5.0, "DEFAULT": 0.5},
        {"NAME": "distortion2", "TYPE": "float", "MIN": 0.0, "MAX": 5.0, "DEFAULT": 1.0},
        {"NAME": "scroll", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.0},
        {"NAME": "scanLineThickness", "TYPE": "float", "MIN": 1.0, "MAX": 100.0, "DEFAULT": 25.0},
        {"NAME": "scanLineIntensity", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.3},
        {"NAME": "scanLineOffset", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.0},
        {"NAME": "audioGain", "TYPE": "float", "MIN": 0.0, "MAX": 10.0, "DEFAULT": 2.0},
        {"NAME": "audioPulse", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0},
        {"NAME": "brightness", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0},
        {"NAME": "contrast", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0},
        {"NAME": "saturation", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 1.0}
    ]
}*/

// Ashima 2D Simplex Noise
const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
	vec2 i  = floor(v + dot(v, C.yy) );
	vec2 x0 = v -   i + dot(i, C.xx);
	vec2 i1;
	i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
	vec4 x12 = x0.xyxy + C.xxzz;
	x12.xy -= i1;
	i = mod289(i);
	vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))+ i.x + vec3(0.0, i1.x, 1.0 ));
	vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
	m = m*m ; m = m*m ;
	vec3 x = 2.0 * fract(p * C.www) - 1.0;
	vec3 h = abs(x) - 0.5;
	vec3 ox = floor(x + 0.5);
	vec3 a0 = x - ox;
	m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
	vec3 g;
	g.x  = a0.x  * x0.x  + h.x  * x0.y;
	g.yz = a0.yz * x12.xz + h.yz * x12.yw;
	return 130.0 * dot(m, g);
}

const float tau = 6.28318530718;

vec2 pattern(vec2 pt) {
	vec2 tex = pt * RENDERSIZE;
	vec2 point = vec2(tex.x, tex.y) * (1.0/scanLineThickness);
	float d = point.y;
	return vec2(sin(d + scanLineOffset * tau + cos(pt.x * tau)), cos(d + scanLineOffset * tau + sin(pt.y * tau)));
}

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
	vec2 p = isf_FragNormCoord;
    float audio = AUDIO_RMS * audioGain;
    
    // Impact de l'audio sur la vitesse et la distorsion
	float ty = TIME * (speed + audio * audioPulse);
	float yt = p.y - ty;

	// Smooth distortion (influence par l'audio)
	float offset = snoise(vec2(yt * 3.0, 0.0)) * 0.2 * (1.0 + audio);
    
	// Boost distortion
	offset = pow( offset * distortion1, 3.0) / max(distortion1, 0.001);
    
	// Add fine grain distortion
	offset += snoise(vec2(yt * 50.0, 0.0)) * distortion2 * 0.005;
    
	// Combine distortion on X with roll on Y
	vec2 adjusted = vec2(fract(p.x + offset), fract(p.y - scroll) );
	vec4 result = IMG_NORM_PIXEL(inputImage, adjusted);
    
    // Scanlines
	vec2 pat = pattern(adjusted);
	vec3 shift = scanLineIntensity * vec3(0.3 * pat.x, 0.59 * pat.y, 0.11) / 2.0;
	result.rgb = (1.0 + scanLineIntensity / 2.0) * result.rgb + shift;
    
    // Noise
    result.rgb += (rand(adjusted * TIME) - 0.5) * noiseLevel;
    
    // Brightness / Contrast
    result.rgb = (result.rgb - 0.5) * contrast + 0.5 + (brightness - 1.0);
    
    // Saturation
    float gray = dot(result.rgb, vec3(0.299, 0.587, 0.114));
    result.rgb = mix(vec3(gray), result.rgb, saturation);

	gl_FragColor = result;
}
